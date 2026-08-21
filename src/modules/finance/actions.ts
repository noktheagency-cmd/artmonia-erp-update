"use server";

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
import { startOfMonth, toNumber } from "@/modules/shared/format";
import { studentPaymentMethodValues } from "@/modules/students/payment-method";
import {
  studentPaymentScheduleTypeValues,
  type StudentPaymentScheduleType,
} from "@/modules/students/payment-schedule-type";
import {
  clearStudentPaymentSchedules,
  resolveStudentNextPaymentAt,
} from "@/modules/students/payment-schedule-service";
import { isStudentDebtDue } from "@/modules/students/student-debt-status";
import { getBakuDateInput } from "@/modules/students/student-reminders";
import { recalculateTeacherPayoutsForMonth } from "@/modules/hr/teacher-payroll";
import { PublicActionError, safeServerAction } from "@/server/actions/safe-action";
import { uploadReceipt } from "@/server/storage/erp-files";

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
  idempotencyKey: z.string().uuid(),
  studentId: z.string().uuid(),
  amount: requiredAmount,
  paidDate: z.string().trim().min(1).max(20),
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
  const receipt = await persistReceiptFile(formData.get("receiptFile"), input.idempotencyKey);
  const paidAt = parseDateInput(input.paidDate, "Ödəniş tarixi");
  const paymentMonth = startOfMonth(paidAt);
  const prisma = getPrisma();

  await prisma.$transaction(async (tx) => {
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

    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "finance.payment.record",
      entityType: "payment",
      entityId: paymentResult.payment.id,
      after: toPaymentAuditJson(paymentResult),
      reason: input.note ?? `${paymentResult.studentCode} üçün ödəniş qəbul edildi`,
    });
  });

  await recalculateTeacherPayoutsForMonth(paymentMonth, actor.id);

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
      ? staff
      : { employeeUserId: null, teacherId: null };
    const salarySnapshot = usesPayrollFlow
      ? await resolveStaffSalarySnapshot(tx, staff, expenseDate)
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
  const receipt = await persistReceiptFile(formData.get("receiptFile"));
  const paidAt = parseDateInput(input.paidDate, "Ödəniş tarixi");
  const paymentMonth = startOfMonth(paidAt);
  const prisma = getPrisma();

  const previousPaymentMonth = await prisma.$transaction(async (tx) => {
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

    await reversePaymentAllocations(tx, existing.id);
    await clearStudentPaymentSchedules(tx, [existing.studentId]);

    const payment = await tx.payment.update({
      where: { id: existing.id },
      data: {
        amount: input.amount,
        paidAt,
        paymentMonth,
        nextPaymentAt: input.scheduleType === "ONE_TIME"
          ? null
          : await resolveStudentNextPaymentAt(tx, {
              studentId: existing.studentId,
              paymentMonth,
            }),
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
      paidAt,
    });

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
    return existing.paymentMonth;
  });

  await recalculateTeacherPayoutsForMonth(previousPaymentMonth, actor.id);
  if (previousPaymentMonth.getTime() !== paymentMonth.getTime()) await recalculateTeacherPayoutsForMonth(paymentMonth, actor.id);

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

    await reversePaymentAllocations(tx, payment.id);
    await tx.payment.delete({ where: { id: payment.id } });
    await markStudentDebtIfNeeded(tx, payment.studentId);

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
      ? staff
      : { employeeUserId: null, teacherId: null };
    const salarySnapshot = usesPayrollFlow
      ? await resolveStaffSalarySnapshot(tx, staff, expenseDate)
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
    paidAt: Date;
  }
) {
  const invoices = await tx.invoice.findMany({
    where: {
      studentId: input.studentId,
      status: { not: InvoiceStatus.VOID },
      balanceDue: { gt: 0 },
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      amount: true,
      balanceDue: true,
      dueDate: true,
    },
  });
  let remainingAmount = input.amount;
  const allocations: Array<{ invoiceId: string; amount: number }> = [];

  for (const invoice of invoices) {
    if (remainingAmount <= 0) {
      break;
    }

    const currentBalance = toNumber(invoice.balanceDue);
    const amountAllocated = Math.min(currentBalance, remainingAmount);
    const nextBalance = roundMoney(currentBalance - amountAllocated);

    await tx.paymentAllocation.create({
      data: {
        paymentId: input.paymentId,
        invoiceId: invoice.id,
        amountAllocated,
        mode: PaymentAllocationMode.OLDEST_FIRST,
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

  await markStudentDebtIfNeeded(tx, input.studentId);
  return allocations;
}

async function markStudentDebtIfNeeded(tx: Prisma.TransactionClient, studentId: string) {
  const [openBalance, latestSchedule] = await Promise.all([
    tx.invoice.findFirst({
      where: {
        studentId,
        status: { not: InvoiceStatus.VOID },
        balanceDue: { gt: 0 },
      },
      select: { id: true },
    }),
    tx.payment.findFirst({
      where: { studentId, nextPaymentAt: { not: null } },
      orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
      select: { nextPaymentAt: true },
    }),
  ]);
  const today = new Date(`${getBakuDateInput()}T00:00:00.000Z`);

  if (!isStudentDebtDue({
    balance: openBalance ? 1 : 0,
    nextPaymentAt: latestSchedule?.nextPaymentAt,
    today,
  })) {
    return;
  }

  await tx.student.updateMany({
    where: {
      id: studentId,
      lifecycleStatus: StudentLifecycleStatus.ACTIVE,
    },
    data: {
      lifecycleStatus: StudentLifecycleStatus.DEBT,
    },
  });
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

  let invoices = student.invoices;
  if (input.scheduleType === "ONE_TIME" && input.amount > openBalance) {
    const oneTimeAmount = roundMoney(input.amount - openBalance);
    const invoice = await tx.invoice.upsert({
      where: { idempotencyKey: `student-one-time-${input.idempotencyKey}` },
      update: {},
      create: {
        studentId: student.id,
        enrollmentId: student.enrollments[0]?.id ?? null,
        periodMonth: input.paymentMonth,
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

  const nextPaymentAt = input.scheduleType === "ONE_TIME"
    ? null
    : await resolveStudentNextPaymentAt(tx, {
        studentId: student.id,
        paymentMonth: input.paymentMonth,
      });

  await clearStudentPaymentSchedules(tx, [student.id]);

  const payment = await tx.payment.create({
    data: {
      studentId: student.id,
      amount: input.amount,
      paidAt: input.paidAt,
      paymentMonth: input.paymentMonth,
      nextPaymentAt,
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
    const amountAllocated = Math.min(currentBalance, remainingAmount);
    const nextBalance = roundMoney(currentBalance - amountAllocated);

    await tx.paymentAllocation.create({
      data: {
        paymentId: payment.id,
        invoiceId: invoice.id,
        amountAllocated,
        mode: PaymentAllocationMode.OLDEST_FIRST,
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

  const stillHasOpenBalance = await tx.invoice.findFirst({
    where: {
      studentId: student.id,
      status: { not: InvoiceStatus.VOID },
      balanceDue: { gt: 0 },
    },
    select: { id: true },
  });

  if (!stillHasOpenBalance && student.lifecycleStatus === StudentLifecycleStatus.DEBT) {
    await tx.student.update({
      where: { id: student.id },
      data: { lifecycleStatus: StudentLifecycleStatus.ACTIVE },
    });

    await tx.studentStatusHistory.create({
      data: {
        studentId: student.id,
        oldStatus: student.lifecycleStatus,
        newStatus: StudentLifecycleStatus.ACTIVE,
        reason: "Alacaq bağlandığı üçün status aktiv edildi",
        note: input.note,
        effectiveAt: input.paidAt,
        changedById: input.actorId,
      },
    });
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

async function resolveStaffSalarySnapshot(
  tx: Prisma.TransactionClient,
  staff: ReturnType<typeof parseStaffTarget>,
  expenseDate: Date
) {
  if (!staff.employeeUserId && !staff.teacherId) {
    throw new Error("Əməkhaqqı xərci üçün əməkdaş seçilməlidir");
  }

  if (staff.employeeUserId) {
    const employee = await tx.hrEmployee.findUnique({
      where: { userId: staff.employeeUserId },
      select: {
        id: true,
        fullName: true,
        salaryMode: true,
        salaryAmount: true,
        salaryPercent: true,
        user: { select: { isActive: true } },
      },
    });

    if (!employee?.user?.isActive) {
      throw new Error("Seçilmiş əməkdaş tapılmadı və ya aktiv deyil");
    }

    const lastSalary = await tx.financeExpense.findFirst({
      where: {
        employeeUserId: staff.employeeUserId,
      },
      orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
      select: {
        amount: true,
        salaryCalculatedAmount: true,
      },
    });
    const salaryBase = roundMoney(toNumber(lastSalary?.salaryCalculatedAmount ?? lastSalary?.amount));
    const salaryPercent = roundMoney(toNumber(employee.salaryPercent));
    const salaryAmount = employee.salaryMode === FinanceSalaryMode.PERCENT
      ? roundMoney(salaryBase * salaryPercent / 100)
      : roundMoney(toNumber(employee.salaryAmount));

    return {
      payeeName: employee.fullName,
      salaryMode: employee.salaryMode,
      salaryPercent: employee.salaryMode === FinanceSalaryMode.PERCENT ? salaryPercent : null,
      salaryBaseAmount: employee.salaryMode === FinanceSalaryMode.PERCENT ? salaryBase : salaryAmount,
      salaryCalculatedAmount: salaryAmount,
    };
  }

  const periodMonth = startOfMonth(expenseDate);
  const teacher = await tx.teacher.findUnique({
    where: { id: staff.teacherId ?? "" },
    select: { id: true, fullName: true, isActive: true },
  });

  if (!teacher?.isActive) {
    throw new Error("Seçilmiş müəllim tapılmadı və ya aktiv deyil");
  }

  const [rule, payout, lastSalary] = await Promise.all([
    tx.teacherContractRule.findFirst({
      where: {
        teacherId: teacher.id,
        validFrom: { lte: periodMonth },
        OR: [{ validTo: null }, { validTo: { gte: periodMonth } }],
      },
      orderBy: [{ validFrom: "desc" }, { createdAt: "desc" }],
      select: { salaryPercent: true },
    }),
    tx.teacherPayout.findFirst({
      where: {
        teacherId: teacher.id,
        periodMonth,
      },
      orderBy: { createdAt: "desc" },
      select: {
        eligibleRevenue: true,
        payoutAmount: true,
      },
    }),
    tx.financeExpense.findFirst({
      where: {
        teacherId: teacher.id,
        salaryMode: FinanceSalaryMode.PERCENT,
      },
      orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
      select: {
        amount: true,
        salaryPercent: true,
        salaryBaseAmount: true,
        salaryCalculatedAmount: true,
      },
    }),
  ]);

  const salaryPercent = roundMoney(toNumber(rule?.salaryPercent ?? lastSalary?.salaryPercent));
  const salaryBaseAmount = roundMoney(toNumber(payout?.eligibleRevenue ?? lastSalary?.salaryBaseAmount));
  const calculatedAmount = payout
    ? roundMoney(toNumber(payout.payoutAmount))
    : roundMoney(
        toNumber(lastSalary?.salaryCalculatedAmount ?? lastSalary?.amount) ||
          (salaryBaseAmount * salaryPercent) / 100
      );

  return {
    payeeName: teacher.fullName,
    salaryMode: FinanceSalaryMode.PERCENT,
    salaryPercent,
    salaryBaseAmount,
    salaryCalculatedAmount: calculatedAmount,
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
