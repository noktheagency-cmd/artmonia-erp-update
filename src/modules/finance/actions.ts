"use server";

import { contractConfirmationSchema, receiptPurposeSchema } from "@/modules/students/course-sale-policy";
import { assertSalePaymentEditable, recordCourseSalePayment } from "@/modules/students/course-sale-service";
import { lockPaymentStudent, replayPayment, assertAdmissionLeadActor } from "@/modules/students/payment-entry-guard";

import { revalidatePath, updateTag } from "next/cache";
import type { Route } from "next";
import { z } from "zod";
import {
  FinanceCostCenter,
  FinanceFinancialClass,
  FinanceSalaryMode,
  FinanceTransactionType,
  InvoiceStatus,
  PaymentAllocationMode,
  PaymentMethod,
  Prisma,
  StudentLifecycleStatus,
} from "@/generated/prisma/client";
import { getPrisma } from "@/server/db/prisma";
import { requireMutationActor, type ErpActor } from "@/server/auth/actor";
import { writeAuditLog } from "@/modules/audit/audit-service";
import { erpCacheTags } from "@/modules/shared/cache-tags";
import { optionalFormString } from "@/modules/shared/form-values";
import { toNumber } from "@/modules/shared/format";
import { studentPaymentMethodValues } from "@/modules/students/payment-method";
import {
  studentPaymentScheduleTypeValues,
  type StudentPaymentScheduleType,
} from "@/modules/students/payment-schedule-type";
import {
  clearStudentPaymentSchedules,
} from "@/modules/students/payment-schedule-service";
import {
  ensureMissingStudentMonthlyInvoices,
  ensureStudentMonthlyInvoicesForPeriod,
} from "@/modules/students/monthly-invoice-service";
import { parseBillingMonthInput } from "@/modules/students/payment-billing-period";
import {
  assertPaymentMonthMismatchAcknowledged,
  parsePaymentDateInput,
} from "@/modules/students/payment-date-policy";
import { recalculateTeacherPayoutsForMonth } from "@/modules/hr/teacher-payroll";
import { PublicActionError, safeServerAction } from "@/server/actions/safe-action";
import { uploadReceipt } from "@/server/storage/erp-files";
import { resolveExpenseStaff, resolveStaffSalarySnapshot } from "./staff-salary";
import { shouldVoidObsoleteImportedInvoice } from "./obsolete-import-invoice";

const optionalText = (max: number) =>
  z.preprocess(optionalFormString, z.string().max(max).optional());

const optionalAmount = z.preprocess((value) => {
  const normalized = optionalFormString(value);
  return normalized ? parseAmountInput(normalized) : undefined;
}, z.number().nonnegative().max(250_000).optional());

const expenseCategorySchema = z.object({
  id: z.preprocess(optionalFormString, z.string().uuid().optional()),
  code: z.string().trim().regex(/^[A-Z][A-Z0-9_]{2,63}$/),
  name: z.string().trim().min(2).max(80),
  description: optionalText(300),
  transactionType: z.enum([
    FinanceTransactionType.INCOME,
    FinanceTransactionType.EXPENSE,
    FinanceTransactionType.CAPEX_OUT,
    FinanceTransactionType.FINANCING_IN,
    FinanceTransactionType.FINANCING_OUT,
  ]),
  financialClass: z.preprocess(optionalFormString, z.enum([
    FinanceFinancialClass.DIRECT_COST,
    FinanceFinancialClass.OPEX,
    FinanceFinancialClass.CAPEX,
    FinanceFinancialClass.FINANCING,
    FinanceFinancialClass.LEGACY_LIABILITY,
  ]).optional()),
  isActive: z.preprocess((value) => value === "true" || value === "on", z.boolean()),
  requiresStaff: z.preprocess((value) => value === "true" || value === "on", z.boolean()),
  requiresProject: z.preprocess((value) => value === "true" || value === "on", z.boolean()),
}).superRefine((value, context) => {
  if (value.transactionType === FinanceTransactionType.INCOME && value.financialClass) {
    context.addIssue({ code: "custom", message: "Gəlir kateqoriyasına xərc sinfi verilə bilməz" });
  }
  if (value.transactionType !== FinanceTransactionType.INCOME && !value.financialClass) {
    context.addIssue({ code: "custom", message: "Maliyyə sinfi seçilməlidir" });
  }
  if (
    value.transactionType === FinanceTransactionType.EXPENSE &&
    value.financialClass !== FinanceFinancialClass.DIRECT_COST &&
    value.financialClass !== FinanceFinancialClass.OPEX
  ) {
    context.addIssue({ code: "custom", message: "Adi xərc yalnız birbaşa və ya əməliyyat xərci ola bilər" });
  }
  if (
    value.transactionType === FinanceTransactionType.CAPEX_OUT &&
    value.financialClass !== FinanceFinancialClass.CAPEX
  ) {
    context.addIssue({ code: "custom", message: "Kapital çıxışı kapital investisiyası kimi təsnif edilməlidir" });
  }
  if (
    (value.transactionType === FinanceTransactionType.FINANCING_IN ||
      value.transactionType === FinanceTransactionType.FINANCING_OUT) &&
    value.financialClass !== FinanceFinancialClass.FINANCING &&
    !(
      value.transactionType === FinanceTransactionType.FINANCING_OUT &&
      value.financialClass === FinanceFinancialClass.LEGACY_LIABILITY
    )
  ) {
    context.addIssue({ code: "custom", message: "Maliyyələşmə hərəkətinin uyğun maliyyə sinfi seçilməlidir" });
  }
});

async function saveFinanceExpenseCategoryActionImpl(formData: FormData) {
  const actor = await requireExpenseCategoryActor();
  const input = expenseCategorySchema.parse(Object.fromEntries(formData));
  const prisma = getPrisma();

  const saved = await prisma.$transaction(async (tx) => {
    if (!input.id) {
      const created = await tx.financeExpenseCategory.create({
        data: {
          code: input.code,
          name: input.name,
          description: input.description ?? null,
          transactionType: input.transactionType,
          financialClass: input.financialClass ?? null,
          isActive: input.isActive,
          isSystem: false,
          requiresStaff: input.requiresStaff,
          requiresProject: input.requiresProject,
        },
        select: { id: true, code: true, name: true, isSystem: true, isActive: true },
      });
      await writeAuditLog(tx, {
        actorUserId: actor.id,
        action: "finance.expense_category.create",
        entityType: "finance_expense_category",
        entityId: created.id,
        after: created,
      });
      return created;
    }

    const current = await tx.financeExpenseCategory.findUnique({
      where: { id: input.id },
      select: { id: true, code: true, name: true, isSystem: true, isActive: true },
    });
    if (!current) throw new PublicActionError("Xərc kateqoriyası tapılmadı.", "NOT_FOUND");
    const updated = await tx.financeExpenseCategory.update({
      where: { id: current.id },
      data: {
        name: input.name,
        description: input.description ?? null,
        transactionType: input.transactionType,
        financialClass: input.financialClass ?? null,
        isActive: input.isActive,
        requiresStaff: input.requiresStaff,
        requiresProject: input.requiresProject,
      },
      select: { id: true, code: true, name: true, isSystem: true, isActive: true },
    });
    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "finance.expense_category.update",
      entityType: "finance_expense_category",
      entityId: updated.id,
      before: current,
      after: updated,
    });
    return updated;
  });

  invalidateFinanceCaches();
  return saved;
}

async function deleteFinanceExpenseCategoryActionImpl(formData: FormData) {
  const actor = await requireExpenseCategoryActor();
  const id = z.string().uuid().parse(formData.get("id"));
  const prisma = getPrisma();

  const deleted = await prisma.$transaction(async (tx) => {
    const current = await tx.financeExpenseCategory.findUnique({
      where: { id },
      select: { id: true, name: true, isSystem: true, _count: { select: { expenses: true } } },
    });
    if (!current) throw new PublicActionError("Xərc kateqoriyası tapılmadı.", "NOT_FOUND");
    await tx.financeExpenseCategory.update({
      where: { id },
      data: { isActive: false },
    });
    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "finance.expense_category.deactivate",
      entityType: "finance_expense_category",
      entityId: current.id,
      before: { id: current.id, name: current.name },
    });
    return { id: current.id };
  });

  invalidateFinanceCaches();
  return deleted;
}

async function requireExpenseCategoryActor() {
  return requireMutationActor("billing.category.manage");
}

const requiredAmount = z.preprocess(
  parseAmountInput,
  z.number().positive().max(250_000)
);

const recordFinancePaymentSchema = z.object({
  admissionLeadId: z.preprocess(optionalFormString, z.string().uuid().optional()),
  receiptPurpose: receiptPurposeSchema,
  contractConfirmed: contractConfirmationSchema,
  idempotencyKey: z.string().uuid(),
  studentId: z.string().uuid(),
  amount: requiredAmount,
  paidDate: z.string().trim().min(1).max(20),
  billingMonth: z.string().trim().regex(/^\d{4}-\d{2}$/, "Aid olduğu ay düzgün seçilməyib."),
  paymentMonthMismatchAcknowledged: z.preprocess(
    (value) => value === "true" || value === "on",
    z.boolean(),
  ),
  method: z.enum(studentPaymentMethodValues).default("CASH"),
  scheduleType: z.enum(studentPaymentScheduleTypeValues).default("MONTHLY"),
  payerName: optionalText(120),
  receiptReference: optionalText(120),
  note: optionalText(500),
  returnTo: optionalText(320),
});

const updateFinancePaymentSchema = recordFinancePaymentSchema.extend({
  paymentId: z.string().uuid(),
});

const deleteFinancePaymentSchema = z.object({
  paymentId: z.string().uuid(),
  returnTo: optionalText(320),
});

const createExpenseSchema = z.object({
  idempotencyKey: z.string().uuid(),
  categoryId: z.string().uuid(),
  amount: requiredAmount,
  expenseDate: z.string().trim().min(1).max(20),
  method: z.enum(studentPaymentMethodValues).default("CASH"),
  payeeMode: z.enum(["MANUAL", "COMPANY"]).default("MANUAL"),
  corporateCustomerId: optionalText(80),
  vendor: optionalText(120),
  description: z.string().trim().min(3).max(700),
  costCenter: z.enum([
    FinanceCostCenter.TEACHING,
    FinanceCostCenter.SALES,
    FinanceCostCenter.MARKETING,
    FinanceCostCenter.OPERATIONS,
    FinanceCostCenter.MANAGEMENT,
  ]),
  staffTarget: optionalText(80),
  salaryMode: z
    .enum([
      FinanceSalaryMode.NONE,
      FinanceSalaryMode.STATIC,
      FinanceSalaryMode.PERCENT,
    ])
    .default(FinanceSalaryMode.NONE),
  salaryPercent: optionalAmount,
  salaryBaseAmount: optionalAmount,
  salaryCalculatedAmount: optionalAmount,
  receiptReference: optionalText(120),
  returnTo: optionalText(320),
});

const updateExpenseSchema = createExpenseSchema.extend({
  expenseId: z.string().uuid(),
});

const deleteExpenseSchema = z.object({
  expenseId: z.string().uuid(),
  returnTo: optionalText(320),
});

async function recordFinancePaymentActionImpl(formData: FormData) {
  const actor = await requireMutationActor();
  assertFinanceEntryPermission(actor, "billing.payment.create");
  const input = recordFinancePaymentSchema.parse(Object.fromEntries(formData));
  const paidAt = parsePaymentDateInput(input.paidDate);
  const paymentMonth = parseBillingMonthInput(input.billingMonth, paidAt);
  assertPaymentMonthMismatchAcknowledged({
    paidAt,
    paymentMonth,
    acknowledged: input.paymentMonthMismatchAcknowledged,
  });
  const receipt = await persistReceiptFile(formData.get("receiptFile"), input.idempotencyKey);
  const prisma = getPrisma();

  const effectivePaymentMonth = await prisma.$transaction(async (tx) => {
    await lockPaymentStudent(tx, actor, input.studentId);
    await assertAdmissionLeadActor(tx,actor,input.admissionLeadId);
    const replay = await replayPayment(tx, { ...input, paidAt, actorId: actor.id });
    if (replay) return replay.paymentMonth;
    const paymentResult = await createPaymentAndAllocate(tx, {
      studentId: input.studentId,
      amount: input.amount,
      paidAt,
      paymentMonth,
      scheduleType: input.scheduleType,
      method: input.method,
      payerName: input.payerName ?? null,
      receiptFileName: receipt?.fileName ?? null,
      receiptFilePath: receipt?.filePath ?? null,
      receiptReference: input.receiptReference ?? null,
      note: input.note ?? null,
      actorId: actor.id,
      idempotencyKey: input.idempotencyKey,
    });

    if (input.admissionLeadId && !actor.permissions.has("crm.lead.convert")) throw new PublicActionError("Müraciətdən qəbul yaratmaq icazəniz yoxdur.","FORBIDDEN");
    await recordCourseSalePayment(tx, { studentId: input.studentId, paymentId: paymentResult.payment.id, purpose: input.receiptPurpose, contractConfirmed: input.contractConfirmed, actorId: actor.id, admissionLeadId: input.admissionLeadId });

    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "finance.payment.record",
      entityType: "payment",
      entityId: paymentResult.payment.id,
      after: toPaymentAuditJson(paymentResult),
      reason: input.note ?? `${paymentResult.studentCode} üçün ödəniş qəbul edildi`,
    });

    return paymentResult.payment.paymentMonth;
  });

  await recalculateTeacherPayoutsForMonth(effectivePaymentMonth, actor.id);

  invalidateFinanceCaches();
  return {
    ok: true as const,
    redirectTo: buildFinanceRedirect(input.returnTo, "payment-created"),
  };
}

async function createFinanceExpenseActionImpl(formData: FormData) {
  const actor = await requireMutationActor();
  assertFinanceEntryPermission(actor, "billing.expense.create");
  const input = createExpenseSchema.parse(Object.fromEntries(formData));
  const receipt = await persistReceiptFile(formData.get("receiptFile"), input.idempotencyKey);
  const expenseDate = parseDateInput(input.expenseDate, "Xərc tarixi");
  const staff = parseStaffTarget(input.staffTarget);

  const prisma = getPrisma();

  await prisma.$transaction(async (tx) => {
    const category = await resolveFinanceMovementCategory(tx, input.categoryId);
    const usesPayrollFlow = category.requiresStaff;
    const expenseStaff = usesPayrollFlow
      ? await resolveExpenseStaff(tx, staff)
      : { employeeUserId: null, teacherId: null };
    const salarySnapshot = usesPayrollFlow
      ? await resolveStaffSalarySnapshot(tx, expenseStaff, expenseDate)
      : emptySalarySnapshot();
    const corporateCustomer = !usesPayrollFlow && input.payeeMode === "COMPANY"
      ? await tx.hrCorporateCustomer.findFirst({
          where: { id: input.corporateCustomerId, status: "ACTIVE" },
          select: { id: true, name: true },
        })
      : null;
    if (!usesPayrollFlow && input.payeeMode === "COMPANY" && !corporateCustomer) {
      throw new PublicActionError("Seçilmiş şirkət aktiv korporativ müştəri deyil.", "NOT_FOUND");
    }
    const vendor = salarySnapshot.payeeName ?? corporateCustomer?.name ?? input.vendor;

    if (!vendor) {
      throw new PublicActionError("Kimə ödəniş edildiyi qeyd olunmalıdır.");
    }

    const expense = await tx.financeExpense.create({
      data: {
        categoryId: category.id,
        transactionType: category.transactionType,
        financialClass: category.financialClass,
        costCenter: input.costCenter,
        classificationReviewRequired: false,
        amount: input.amount,
        expenseDate,
        method: input.method as PaymentMethod,
        vendor,
        corporateCustomerId: corporateCustomer?.id ?? null,
        description: input.description,
        employeeUserId: expenseStaff.employeeUserId,
        teacherId: expenseStaff.teacherId,
        salaryMode: salarySnapshot.salaryMode,
        salaryPercent: salarySnapshot.salaryPercent,
        salaryBaseAmount: salarySnapshot.salaryBaseAmount,
        salaryCalculatedAmount: salarySnapshot.salaryCalculatedAmount,
        receiptFileName: receipt?.fileName ?? null,
        receiptFilePath: receipt?.filePath ?? null,
        receiptReference: input.receiptReference ?? null,
        idempotencyKey: input.idempotencyKey,
        createdById: actor.id,
      },
      select: {
        id: true,
        amount: true,
        expenseDate: true,
        method: true,
        salaryMode: true,
      },
    });

    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "finance.expense.create",
      entityType: "finance_expense",
      entityId: expense.id,
      after: {
        categoryCode: category.code,
        category: category.name,
        transactionType: category.transactionType,
        financialClass: category.financialClass,
        costCenter: input.costCenter,
        amount: toNumber(expense.amount),
        expenseDate: expense.expenseDate.toISOString(),
        method: expense.method,
        salaryMode: expense.salaryMode,
        employeeUserId: expenseStaff.employeeUserId,
        teacherId: expenseStaff.teacherId,
        receiptFileName: receipt?.fileName ?? null,
        receiptReference: input.receiptReference ?? null,
      } satisfies Prisma.InputJsonValue,
      reason: input.description,
    });
  });

  invalidateFinanceCaches();
  return {
    ok: true as const,
    redirectTo: buildFinanceRedirect(input.returnTo, "expense-created"),
  };
}

async function updateFinancePaymentActionImpl(formData: FormData) {
  const actor = await requireMutationActor("billing.payment.create");
  const input = updateFinancePaymentSchema.parse(Object.fromEntries(formData));
  const paidAt = parsePaymentDateInput(input.paidDate);
  const requestedPaymentMonth = parseBillingMonthInput(input.billingMonth, paidAt);
  assertPaymentMonthMismatchAcknowledged({
    paidAt,
    paymentMonth: requestedPaymentMonth,
    acknowledged: input.paymentMonthMismatchAcknowledged,
  });
  const receipt = await persistReceiptFile(formData.get("receiptFile"));
  const prisma = getPrisma();

  const paymentMonths = await prisma.$transaction(async (tx) => {
    const existing = await tx.payment.findUnique({
      where: { id: input.paymentId },
      select: {
        id: true,
        studentId: true,
        amount: true,
        paidAt: true,
        paymentMonth: true,
        nextPaymentAt: true,
        scheduleType: true,
        method: true,
        payerName: true,
        receiptFileName: true,
        receiptFilePath: true,
        receiptReference: true,
        note: true,
      },
    });

    if (!existing) {
      throw new Error("Ödəniş tapılmadı");
    }

    await lockPaymentStudent(tx, actor, existing.studentId);
    await assertSalePaymentEditable(tx, existing.id);
    await reversePaymentAllocations(tx, existing.id);
    await clearStudentPaymentSchedules(tx, [existing.studentId]);

    const paymentMonth = input.scheduleType === "MONTHLY"
      ? await ensureStudentMonthlyInvoicesForPeriod(tx, {
          studentId: existing.studentId,
          requestedPeriodMonth: requestedPaymentMonth,
          asOfDate: paidAt,
        })
      : requestedPaymentMonth;

    if (input.scheduleType === "ONE_TIME") {
      await ensureMissingStudentMonthlyInvoices(tx, {
        studentId: existing.studentId,
        throughDate: paidAt,
      });
    }

    const payment = await tx.payment.update({
      where: { id: existing.id },
      data: {
        amount: input.amount,
        paidAt,
        paymentMonth,
        nextPaymentAt: null,
        scheduleType: input.scheduleType,
        method: input.method as PaymentMethod,
        payerName: input.payerName ?? null,
        receiptFileName: receipt?.fileName ?? existing.receiptFileName,
        receiptFilePath: receipt?.filePath ?? existing.receiptFilePath,
        receiptReference: input.receiptReference ?? null,
        note: input.note ?? null,
      },
      select: {
        id: true,
        studentId: true,
        amount: true,
        paidAt: true,
        paymentMonth: true,
        nextPaymentAt: true,
        scheduleType: true,
        method: true,
      },
    });

    const allocations = await allocateExistingPayment(tx, {
      paymentId: payment.id,
      studentId: payment.studentId,
      amount: input.amount,
      paymentMonth,
      scheduleType: input.scheduleType,
    });

    if (
      existing.scheduleType === "MONTHLY" &&
      payment.scheduleType === "MONTHLY"
    ) {
      await voidObsoleteImportedPaymentInvoices(tx, {
        actorUserId: actor.id,
        studentId: payment.studentId,
        paymentId: payment.id,
        previousPaymentMonth: existing.paymentMonth,
        currentPaymentMonth: payment.paymentMonth,
      });
    }

    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "finance.payment.update",
      entityType: "payment",
      entityId: payment.id,
      before: {
        amount: toNumber(existing.amount),
        paidAt: existing.paidAt.toISOString(),
        paymentMonth: existing.paymentMonth.toISOString(),
        nextPaymentAt: existing.nextPaymentAt?.toISOString() ?? null,
        scheduleType: existing.scheduleType,
        method: existing.method,
        payerName: existing.payerName,
        receiptReference: existing.receiptReference,
        note: existing.note,
      } satisfies Prisma.InputJsonValue,
      after: {
        amount: toNumber(payment.amount),
        paidAt: payment.paidAt.toISOString(),
        paymentMonth: payment.paymentMonth.toISOString(),
        nextPaymentAt: payment.nextPaymentAt?.toISOString() ?? null,
        scheduleType: payment.scheduleType,
        method: payment.method,
        allocations,
      } satisfies Prisma.InputJsonValue,
      reason: input.note ?? "Ödəniş düzəliş edildi",
    });
    return {
      previous: existing.paymentMonth,
      current: payment.paymentMonth,
    };
  });

  await recalculateTeacherPayoutsForMonth(paymentMonths.previous, actor.id);
  if (paymentMonths.previous.getTime() !== paymentMonths.current.getTime()) {
    await recalculateTeacherPayoutsForMonth(paymentMonths.current, actor.id);
  }

  invalidateFinanceCaches();
  return {
    ok: true as const,
    redirectTo: buildFinanceRedirect(input.returnTo, "payment-updated"),
  };
}

async function deleteFinancePaymentActionImpl(formData: FormData) {
  const actor = await requireMutationActor("billing.payment.create");
  const input = deleteFinancePaymentSchema.parse(Object.fromEntries(formData));
  const prisma = getPrisma();

  const deletedPaymentMonth = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({
      where: { id: input.paymentId },
      select: {
        id: true,
        studentId: true,
        amount: true,
        paidAt: true,
        paymentMonth: true,
        scheduleType: true,
        method: true,
        payerName: true,
        receiptReference: true,
      },
    });

    if (!payment) {
      throw new Error("Ödəniş tapılmadı");
    }

    await lockPaymentStudent(tx, actor, payment.studentId);
    await assertSalePaymentEditable(tx, payment.id);
    await reversePaymentAllocations(tx, payment.id);
    await tx.payment.delete({ where: { id: payment.id } });

    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "finance.payment.delete",
      entityType: "payment",
      entityId: payment.id,
      before: {
        amount: toNumber(payment.amount),
        paidAt: payment.paidAt.toISOString(),
        paymentMonth: payment.paymentMonth.toISOString(),
        scheduleType: payment.scheduleType,
        method: payment.method,
        payerName: payment.payerName,
        receiptReference: payment.receiptReference,
      } satisfies Prisma.InputJsonValue,
      reason: "Ödəniş silindi və faktura balansları yeniləndi",
    });
    return payment.paymentMonth;
  });

  await recalculateTeacherPayoutsForMonth(deletedPaymentMonth, actor.id);

  invalidateFinanceCaches();
  return {
    ok: true as const,
    redirectTo: buildFinanceRedirect(input.returnTo, "payment-deleted"),
  };
}

async function updateFinanceExpenseActionImpl(formData: FormData) {
  const actor = await requireMutationActor("billing.expense.create");
  const input = updateExpenseSchema.parse(Object.fromEntries(formData));
  const receipt = await persistReceiptFile(formData.get("receiptFile"));
  const expenseDate = parseDateInput(input.expenseDate, "Xərc tarixi");
  const staff = parseStaffTarget(input.staffTarget);

  const prisma = getPrisma();

  await prisma.$transaction(async (tx) => {
    const existing = await tx.financeExpense.findUnique({
      where: { id: input.expenseId },
      select: {
        id: true,
        categoryId: true,
        amount: true,
        expenseDate: true,
        method: true,
        vendor: true,
        description: true,
        receiptFileName: true,
        receiptFilePath: true,
        receiptReference: true,
      },
    });

    if (!existing) {
      throw new Error("Xərc qeydi tapılmadı");
    }

    const category = await resolveFinanceMovementCategory(tx, input.categoryId);
    const usesPayrollFlow = category.requiresStaff;
    const expenseStaff = usesPayrollFlow
      ? await resolveExpenseStaff(tx, staff)
      : { employeeUserId: null, teacherId: null };
    const salarySnapshot = usesPayrollFlow
      ? await resolveStaffSalarySnapshot(tx, expenseStaff, expenseDate)
      : emptySalarySnapshot();
    const corporateCustomer = !usesPayrollFlow && input.payeeMode === "COMPANY"
      ? await tx.hrCorporateCustomer.findFirst({
          where: { id: input.corporateCustomerId, status: "ACTIVE" },
          select: { id: true, name: true },
        })
      : null;
    if (!usesPayrollFlow && input.payeeMode === "COMPANY" && !corporateCustomer) {
      throw new PublicActionError("Seçilmiş şirkət aktiv korporativ müştəri deyil.", "NOT_FOUND");
    }
    const vendor = salarySnapshot.payeeName ?? corporateCustomer?.name ?? input.vendor;

    if (!vendor) {
      throw new PublicActionError("Kimə ödəniş edildiyi qeyd olunmalıdır.");
    }

    const expense = await tx.financeExpense.update({
      where: { id: existing.id },
      data: {
        categoryId: category.id,
        transactionType: category.transactionType,
        financialClass: category.financialClass,
        costCenter: input.costCenter,
        classificationReviewRequired: false,
        amount: input.amount,
        expenseDate,
        method: input.method as PaymentMethod,
        vendor,
        corporateCustomerId: corporateCustomer?.id ?? null,
        description: input.description,
        employeeUserId: expenseStaff.employeeUserId,
        teacherId: expenseStaff.teacherId,
        salaryMode: salarySnapshot.salaryMode,
        salaryPercent: salarySnapshot.salaryPercent,
        salaryBaseAmount: salarySnapshot.salaryBaseAmount,
        salaryCalculatedAmount: salarySnapshot.salaryCalculatedAmount,
        receiptFileName: receipt?.fileName ?? existing.receiptFileName,
        receiptFilePath: receipt?.filePath ?? existing.receiptFilePath,
        receiptReference: input.receiptReference ?? null,
      },
      select: { id: true, amount: true, expenseDate: true, method: true },
    });

    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "finance.expense.update",
      entityType: "finance_expense",
      entityId: expense.id,
      before: {
        categoryId: existing.categoryId,
        amount: toNumber(existing.amount),
        expenseDate: existing.expenseDate.toISOString(),
        method: existing.method,
      } satisfies Prisma.InputJsonValue,
      after: {
        categoryCode: category.code,
        category: category.name,
        transactionType: category.transactionType,
        financialClass: category.financialClass,
        costCenter: input.costCenter,
        amount: toNumber(expense.amount),
        expenseDate: expense.expenseDate.toISOString(),
        method: expense.method,
      } satisfies Prisma.InputJsonValue,
      reason: input.description,
    });
  });

  invalidateFinanceCaches();
  return {
    ok: true as const,
    redirectTo: buildFinanceRedirect(input.returnTo, "expense-updated"),
  };
}

async function deleteFinanceExpenseActionImpl(formData: FormData) {
  const actor = await requireMutationActor("billing.expense.void");
  const input = deleteExpenseSchema.parse(Object.fromEntries(formData));
  const prisma = getPrisma();

  await prisma.$transaction(async (tx) => {
    const expense = await tx.financeExpense.findUnique({
      where: { id: input.expenseId },
      select: {
        id: true,
        categoryId: true,
        amount: true,
        expenseDate: true,
        method: true,
        vendor: true,
        corporateCustomerId: true,
        description: true,
        voidedAt: true,
      },
    });

    if (!expense) {
      throw new Error("Xərc qeydi tapılmadı");
    }
    if (expense.voidedAt) {
      throw new PublicActionError("Bu maliyyə hərəkəti artıq ləğv edilib.");
    }

    await tx.financeExpense.update({
      where: { id: expense.id },
      data: {
        voidedAt: new Date(),
        voidedById: actor.id,
        voidReason: "Maliyyə ekranından ləğv edildi",
      },
    });

    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "finance.expense.void",
      entityType: "finance_expense",
      entityId: expense.id,
      before: {
        categoryId: expense.categoryId,
        amount: toNumber(expense.amount),
        expenseDate: expense.expenseDate.toISOString(),
        method: expense.method,
        vendor: expense.vendor,
        description: expense.description,
      } satisfies Prisma.InputJsonValue,
      reason: "Maliyyə hərəkəti ləğv edildi",
    });
  });

  invalidateFinanceCaches();
  return {
    ok: true as const,
    redirectTo: buildFinanceRedirect(input.returnTo, "expense-deleted"),
  };
}

async function reversePaymentAllocations(tx: Prisma.TransactionClient, paymentId: string) {
  const allocations = await tx.paymentAllocation.findMany({
    where: { paymentId },
    select: {
      id: true,
      amountAllocated: true,
      invoice: {
        select: {
          id: true,
          amount: true,
          balanceDue: true,
          dueDate: true,
        },
      },
    },
  });

  for (const allocation of allocations) {
    const nextBalance = roundMoney(toNumber(allocation.invoice.balanceDue) + toNumber(allocation.amountAllocated));

    await tx.invoice.update({
      where: { id: allocation.invoice.id },
      data: {
        balanceDue: nextBalance,
        status: resolveInvoiceStatus({
          amount: toNumber(allocation.invoice.amount),
          balanceDue: nextBalance,
          dueDate: allocation.invoice.dueDate,
        }),
      },
    });
  }

  if (allocations.length > 0) {
    await tx.paymentAllocation.deleteMany({ where: { paymentId } });
  }
}

async function allocateExistingPayment(
  tx: Prisma.TransactionClient,
  input: {
    paymentId: string;
    studentId: string;
    amount: number;
    paymentMonth: Date;
    scheduleType: StudentPaymentScheduleType;
  }
) {
  const invoices = await tx.invoice.findMany({
    where: {
      studentId: input.studentId,
      status: { not: InvoiceStatus.VOID },
      balanceDue: { gt: 0 },
      ...(input.scheduleType === "MONTHLY" ? { periodMonth: input.paymentMonth } : {}),
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      amount: true,
      balanceDue: true,
      dueDate: true,
    },
  });
  const openBalance = roundMoney(
    invoices.reduce((total, invoice) => total + toNumber(invoice.balanceDue), 0),
  );

  if (input.scheduleType === "MONTHLY" && openBalance <= 0) {
    throw new PublicActionError(
      "Seçilmiş ay üzrə açıq faktura yoxdur. Aid olduğu ayı yoxlayın.",
    );
  }

  if (input.scheduleType === "MONTHLY" && input.amount > openBalance) {
    throw new PublicActionError(
      "Aylıq ödəniş seçilmiş ayın açıq balansından çox ola bilməz. Artıq məbləğ üçün ayrıca gələcək ay seçin.",
    );
  }

  if (input.scheduleType === "ONE_TIME" && input.amount < openBalance) {
    throw new PublicActionError("Birdəfəlik tam ödəniş açıq balansdan az ola bilməz.");
  }

  let remainingAmount = input.amount;
  const allocations: Array<{ invoiceId: string; amount: number }> = [];

  for (const invoice of invoices) {
    if (remainingAmount <= 0) {
      break;
    }

    const currentBalance = toNumber(invoice.balanceDue);
    const amountAllocated = roundMoney(Math.min(currentBalance, remainingAmount));
    if (amountAllocated <= 0) continue;
    const nextBalance = roundMoney(currentBalance - amountAllocated);

    await tx.paymentAllocation.create({
      data: {
        paymentId: input.paymentId,
        invoiceId: invoice.id,
        amountAllocated,
        mode: input.scheduleType === "MONTHLY"
          ? PaymentAllocationMode.SELECTED_INVOICE
          : PaymentAllocationMode.OLDEST_FIRST,
      },
    });

    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        balanceDue: nextBalance,
        status: resolveInvoiceStatus({
          amount: toNumber(invoice.amount),
          balanceDue: nextBalance,
          dueDate: invoice.dueDate,
        }),
      },
    });

    allocations.push({ invoiceId: invoice.id, amount: amountAllocated });
    remainingAmount = roundMoney(remainingAmount - amountAllocated);
  }

  return allocations;
}

async function voidObsoleteImportedPaymentInvoices(
  tx: Prisma.TransactionClient,
  input: {
    actorUserId: string;
    studentId: string;
    paymentId: string;
    previousPaymentMonth: Date;
    currentPaymentMonth: Date;
  },
) {
  if (
    input.previousPaymentMonth.getTime() === input.currentPaymentMonth.getTime()
  ) {
    return;
  }

  const student = await tx.student.findUnique({
    where: { id: input.studentId },
    select: { code: true, createdAt: true },
  });
  if (!student) throw new Error("Tələbə tapılmadı");

  const candidates = await tx.invoice.findMany({
    where: {
      studentId: input.studentId,
      periodMonth: input.previousPaymentMonth,
      status: { not: InvoiceStatus.VOID },
      OR: [
        { idempotencyKey: { startsWith: "student-period-" } },
        { idempotencyKey: { startsWith: "student-month-" } },
      ],
    },
    orderBy: { id: "asc" },
    select: {
      id: true,
      periodMonth: true,
      amount: true,
      balanceDue: true,
      status: true,
      idempotencyKey: true,
      _count: { select: { paymentAllocations: true } },
    },
  });

  const otherMonthlyPaymentCount = await tx.payment.count({
    where: {
      studentId: input.studentId,
      id: { not: input.paymentId },
      scheduleType: "MONTHLY",
      paymentMonth: input.previousPaymentMonth,
    },
  });

  for (const invoice of candidates) {
    const amount = toNumber(invoice.amount);
    const balanceDue = toNumber(invoice.balanceDue);
    if (
      !shouldVoidObsoleteImportedInvoice({
        studentCreatedAt: student.createdAt,
        previousPaymentMonth: input.previousPaymentMonth,
        currentPaymentMonth: input.currentPaymentMonth,
        invoicePeriodMonth: invoice.periodMonth,
        invoiceIdempotencyKey: invoice.idempotencyKey,
        invoiceAmount: amount,
        invoiceBalanceDue: balanceDue,
        allocationCount: invoice._count.paymentAllocations,
        otherMonthlyPaymentCount,
      })
    ) {
      continue;
    }

    const updated = await tx.invoice.updateMany({
      where: {
        id: invoice.id,
        status: { not: InvoiceStatus.VOID },
        balanceDue: invoice.amount,
        paymentAllocations: { none: {} },
      },
      data: {
        balanceDue: 0,
        status: InvoiceStatus.VOID,
      },
    });
    if (updated.count !== 1) continue;

    await writeAuditLog(tx, {
      actorUserId: input.actorUserId,
      action: "billing.invoice.void_obsolete_import_period",
      entityType: "invoice",
      entityId: invoice.id,
      before: {
        studentCode: student.code,
        periodMonth: invoice.periodMonth.toISOString(),
        amount,
        balanceDue,
        status: invoice.status,
        idempotencyKey: invoice.idempotencyKey,
      } satisfies Prisma.InputJsonValue,
      after: {
        studentCode: student.code,
        periodMonth: invoice.periodMonth.toISOString(),
        amount,
        balanceDue: 0,
        status: InvoiceStatus.VOID,
        correctedPaymentMonth: input.currentPaymentMonth.toISOString(),
      } satisfies Prisma.InputJsonValue,
      reason:
        "İdxal edilmiş ödənişin aid olduğu ay düzəldildiyi üçün əvvəlki tarixi ay üçün yaranmış təyinatsız faktura ləğv edildi.",
    });
  }
}

async function createPaymentAndAllocate(
  tx: Prisma.TransactionClient,
  input: {
    studentId: string;
    amount: number;
    paidAt: Date;
    paymentMonth: Date;
    scheduleType: StudentPaymentScheduleType;
    method: (typeof studentPaymentMethodValues)[number];
    payerName: string | null;
    receiptFileName: string | null;
    receiptFilePath: string | null;
    receiptReference: string | null;
    note: string | null;
    actorId: string;
    idempotencyKey: string;
  }
) {
  const paymentStudent = await tx.student.findUnique({
    where: { id: input.studentId },
    select: { lifecycleStatus: true },
  });

  if (!paymentStudent) {
    throw new Error("Tələbə tapılmadı");
  }

  if (paymentStudent.lifecycleStatus === StudentLifecycleStatus.COMPLETED) {
    throw new PublicActionError(
      "Tədrisi tamamlamış tələbənin maliyyə öhdəliyi bağlıdır və ödəniş qəbul edilmir.",
    );
  }

  const paymentMonth = input.scheduleType === "MONTHLY"
    ? await ensureStudentMonthlyInvoicesForPeriod(tx, {
        studentId: input.studentId,
        requestedPeriodMonth: input.paymentMonth,
        asOfDate: input.paidAt,
      })
    : input.paymentMonth;

  if (input.scheduleType === "ONE_TIME") {
    await ensureMissingStudentMonthlyInvoices(tx, {
      studentId: input.studentId,
      throughDate: input.paidAt,
    });
  }

  const student = await tx.student.findUnique({
    where: { id: input.studentId },
    select: {
      id: true,
      code: true,
      lifecycleStatus: true,
      invoices: {
        where: {
          status: { not: InvoiceStatus.VOID },
          balanceDue: { gt: 0 },
          ...(input.scheduleType === "MONTHLY" ? { periodMonth: paymentMonth } : {}),
        },
        orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          amount: true,
          balanceDue: true,
          dueDate: true,
        },
      },
      enrollments: {
        where: { status: { in: ["ACTIVE", "PAUSED"] } },
        orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
        take: 1,
        select: { id: true },
      },
    },
  });

  if (!student) {
    throw new Error("Telebe tapilmadi");
  }

  const openBalance = roundMoney(
    student.invoices.reduce(
      (total, invoice) => total + toNumber(invoice.balanceDue),
      0,
    ),
  );

  if (input.scheduleType === "ONE_TIME" && input.amount < openBalance) {
    throw new PublicActionError(
      "Birdəfəlik tam ödəniş açıq balansdan az ola bilməz.",
    );
  }


  if (input.scheduleType === "MONTHLY" && openBalance <= 0) {
    throw new PublicActionError(
      "Seçilmiş ay üzrə açıq faktura yoxdur. Aid olduğu ayı yoxlayın.",
    );
  }

  if (input.scheduleType === "MONTHLY" && input.amount > openBalance) {
    throw new PublicActionError(
      "Aylıq ödəniş seçilmiş ayın açıq balansından çox ola bilməz. Artıq məbləğ üçün ayrıca gələcək ay seçin.",
    );
  }

  let invoices = student.invoices;
  if (input.scheduleType === "ONE_TIME" && input.amount > openBalance) {
    const oneTimeAmount = roundMoney(input.amount - openBalance);
    const invoice = await tx.invoice.upsert({
      where: { idempotencyKey: `student-one-time-${input.idempotencyKey}` },
      update: {},
      create: {
        studentId: student.id,
        enrollmentId: student.enrollments[0]?.id ?? null,
        periodMonth: paymentMonth,
        issueDate: input.paidAt,
        dueDate: input.paidAt,
        amount: oneTimeAmount,
        balanceDue: oneTimeAmount,
        status: InvoiceStatus.OPEN,
        idempotencyKey: `student-one-time-${input.idempotencyKey}`,
      },
      select: { id: true, amount: true, balanceDue: true, dueDate: true },
    });
    invoices = [...invoices, invoice];
  }

  await clearStudentPaymentSchedules(tx, [student.id]);

  const payment = await tx.payment.create({
    data: {
      studentId: student.id,
      amount: input.amount,
      paidAt: input.paidAt,
      paymentMonth,
      nextPaymentAt: null,
      scheduleType: input.scheduleType,
      method: input.method as PaymentMethod,
      payerName: input.payerName,
      receiptFileName: input.receiptFileName,
      receiptFilePath: input.receiptFilePath,
      receiptReference: input.receiptReference,
      note: input.note,
      idempotencyKey: input.idempotencyKey,
      createdById: input.actorId,
    },
    select: {
      id: true,
      amount: true,
      paidAt: true,
      paymentMonth: true,
      nextPaymentAt: true,
      scheduleType: true,
      method: true,
      payerName: true,
      receiptFileName: true,
      receiptReference: true,
    },
  });

  let remainingAmount = input.amount;
  const allocations: Array<{ invoiceId: string; amount: number }> = [];

  for (const invoice of invoices) {
    if (remainingAmount <= 0) {
      break;
    }

    const currentBalance = toNumber(invoice.balanceDue);
    const amountAllocated = roundMoney(Math.min(currentBalance, remainingAmount));
    if (amountAllocated <= 0) continue;
    const nextBalance = roundMoney(currentBalance - amountAllocated);

    await tx.paymentAllocation.create({
      data: {
        paymentId: payment.id,
        invoiceId: invoice.id,
        amountAllocated,
        mode: input.scheduleType === "MONTHLY"
          ? PaymentAllocationMode.SELECTED_INVOICE
          : PaymentAllocationMode.OLDEST_FIRST,
      },
    });

    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        balanceDue: nextBalance,
        status: resolveInvoiceStatus({
          amount: toNumber(invoice.amount),
          balanceDue: nextBalance,
          dueDate: invoice.dueDate,
        }),
      },
    });

    allocations.push({ invoiceId: invoice.id, amount: amountAllocated });
    remainingAmount = roundMoney(remainingAmount - amountAllocated);
  }

  return {
    studentCode: student.code,
    payment,
    allocations,
    remainingAmount,
  };
}

async function resolveFinanceMovementCategory(
  tx: Prisma.TransactionClient,
  categoryId: string
) {
  const category = await tx.financeExpenseCategory.findUnique({
    where: { id: categoryId },
    select: {
      id: true,
      code: true,
      name: true,
      isActive: true,
      transactionType: true,
      financialClass: true,
      requiresStaff: true,
      requiresProject: true,
    },
  });

  if (!category || !category.isActive) {
    throw new PublicActionError("Seçilmiş kateqoriya aktiv deyil və ya tapılmadı.");
  }
  if (category.transactionType === FinanceTransactionType.INCOME) {
    throw new PublicActionError("Əsas fəaliyyət gəliri ödəniş və tədbir satışları bölməsindən qeydə alınmalıdır.");
  }
  if (!category.financialClass) {
    throw new PublicActionError("Kateqoriyanın maliyyə sinfi təyin edilməyib.");
  }
  if (category.requiresProject) {
    throw new PublicActionError("Bu kateqoriya yalnız tədbir və ya layihə daxilində istifadə oluna bilər.");
  }

  return { ...category, financialClass: category.financialClass };
}

function emptySalarySnapshot() {
  return {
    payeeName: null,
    salaryMode: FinanceSalaryMode.NONE,
    salaryPercent: null,
    salaryBaseAmount: null,
    salaryCalculatedAmount: null,
  };
}

function parseStaffTarget(value: string | undefined) {
  if (!value) {
    return {
      employeeUserId: null,
      teacherId: null,
    };
  }

  const [type, id] = value.split(":");

  if (!id) {
    throw new Error("Əməkdaş seçimi düzgün deyil");
  }

  if (type === "user") {
    return {
      employeeUserId: id,
      teacherId: null,
    };
  }

  if (type === "teacher") {
    return {
      employeeUserId: null,
      teacherId: id,
    };
  }

  throw new Error("Əməkdaş seçimi düzgün deyil");
}

async function persistReceiptFile(
  value: FormDataEntryValue | null,
  idempotencyKey?: string,
) {
  if (!isUploadedFile(value)) {
    return null;
  }
  return uploadReceipt(value, idempotencyKey);
}

function isUploadedFile(value: FormDataEntryValue | null): value is File {
  return typeof File !== "undefined" && value instanceof File && value.size > 0;
}

function toPaymentAuditJson(
  result: Awaited<ReturnType<typeof createPaymentAndAllocate>>
) {
  return {
    payment: {
      ...result.payment,
      amount: toNumber(result.payment.amount),
      paidAt: result.payment.paidAt.toISOString(),
      paymentMonth: result.payment.paymentMonth.toISOString(),
      nextPaymentAt: result.payment.nextPaymentAt?.toISOString() ?? null,
    },
    allocations: result.allocations,
    unallocatedAmount: result.remainingAmount,
  } satisfies Prisma.InputJsonValue;
}

function parseAmountInput(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim().replace(",", ".");
  return normalized.length > 0 ? Number(normalized) : Number.NaN;
}

function parseDateInput(value: string, fieldName: string) {
  const normalized = normalizeDateValue(value);
  const date = normalized ? new Date(`${normalized}T00:00:00.000Z`) : null;

  if (!date || Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} düzgün deyil`);
  }

  return date;
}

function normalizeDateValue(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return trimmed;
  }

  const azMatch = trimmed.match(/^(\d{2})[./](\d{2})[./](\d{4})$/);
  if (azMatch) {
    const [, day, month, year] = azMatch;
    return `${year}-${month}-${day}`;
  }

  throw new Error("Tarix GG.AA.İİİİ və ya YYYY-MM-DD formatında olmalıdır");
}

function resolveInvoiceStatus({
  amount,
  balanceDue,
  dueDate,
}: {
  amount: number;
  balanceDue: number;
  dueDate: Date;
}) {
  if (balanceDue <= 0) {
    return InvoiceStatus.PAID;
  }

  if (dueDate < startOfToday()) {
    return InvoiceStatus.OVERDUE;
  }

  return balanceDue < amount ? InvoiceStatus.PARTIAL : InvoiceStatus.OPEN;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function safeFinanceRedirect(value: string | undefined) {
  return value?.startsWith("/finance") ? value : "/finance";
}

function buildFinanceRedirect(value: string | undefined, notice?: string) {
  const target = safeFinanceRedirect(value);

  if (!notice) {
    return target as Route;
  }

  const url = new URL(target, "http://local.artmonia");
  url.searchParams.set("financeNotice", notice);
  return `${url.pathname}${url.search}` as Route;
}

function invalidateFinanceCaches() {
  revalidatePath("/finance");
  revalidatePath("/students");
  revalidatePath("/dashboard");
  updateTag(erpCacheTags.finance);
  updateTag(erpCacheTags.students);
  updateTag(erpCacheTags.dashboard);
}

function assertFinanceEntryPermission(
  actor: Pick<ErpActor, "permissions">,
  fullPermission: "billing.payment.create" | "billing.expense.create",
) {
  if (
    !actor.permissions.has(fullPermission) &&
    !actor.permissions.has("billing.entry.create")
  ) {
    throw new PublicActionError("Maliyyə əməliyyatı əlavə etmək icazəniz yoxdur.", "FORBIDDEN");
  }
}

export const recordFinancePaymentAction = safeServerAction(
  recordFinancePaymentActionImpl,
  "Ödəniş qeydə alınmadı.",
);
export const createFinanceExpenseAction = safeServerAction(
  createFinanceExpenseActionImpl,
  "Xərc yaradılmadı.",
);
export const updateFinancePaymentAction = safeServerAction(
  updateFinancePaymentActionImpl,
  "Ödəniş yenilənmədi.",
);
export const deleteFinancePaymentAction = safeServerAction(
  deleteFinancePaymentActionImpl,
  "Ödəniş silinmədi.",
);
export const updateFinanceExpenseAction = safeServerAction(
  updateFinanceExpenseActionImpl,
  "Xərc yenilənmədi.",
);
export const deleteFinanceExpenseAction = safeServerAction(
  deleteFinanceExpenseActionImpl,
  "Xərc silinmədi.",
);
export const saveFinanceExpenseCategoryAction = safeServerAction(
  saveFinanceExpenseCategoryActionImpl,
  "Xərc kateqoriyası saxlanmadı.",
);
export const deleteFinanceExpenseCategoryAction = safeServerAction(
  deleteFinanceExpenseCategoryActionImpl,
  "Xərc kateqoriyası silinmədi.",
);
