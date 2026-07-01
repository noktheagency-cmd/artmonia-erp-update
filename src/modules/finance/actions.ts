"use server";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { revalidatePath, updateTag } from "next/cache";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  FinanceSalaryMode,
  InvoiceStatus,
  PaymentAllocationMode,
  PaymentMethod,
  Prisma,
  StudentLifecycleStatus,
} from "@/generated/prisma/client";
import { getPrisma } from "@/server/db/prisma";
import { requireMutationActor } from "@/server/auth/actor";
import { writeAuditLog } from "@/modules/audit/audit-service";
import { erpCacheTags } from "@/modules/shared/cache-tags";
import { optionalFormString } from "@/modules/shared/form-values";
import { startOfMonth, toNumber } from "@/modules/shared/format";
import { studentPaymentMethodValues } from "@/modules/students/payment-method";

const optionalText = (max: number) =>
  z.preprocess(optionalFormString, z.string().max(max).optional());

const optionalUuid = z.preprocess(
  optionalFormString,
  z.string().uuid().optional()
);

const optionalAmount = z.preprocess((value) => {
  const normalized = optionalFormString(value);
  return normalized ? parseAmountInput(normalized) : undefined;
}, z.number().nonnegative().max(250_000).optional());

const requiredAmount = z.preprocess(
  parseAmountInput,
  z.number().positive().max(250_000)
);

const recordFinancePaymentSchema = z.object({
  studentId: z.string().uuid(),
  amount: requiredAmount,
  paidDate: z.string().trim().min(1).max(20),
  paymentMonth: z.string().trim().min(1).max(20),
  method: z.enum(studentPaymentMethodValues).default("CASH"),
  payerName: optionalText(120),
  receiptReference: optionalText(120),
  note: optionalText(500),
  returnTo: optionalText(320),
});

const createExpenseSchema = z.object({
  categoryId: optionalUuid,
  newCategoryName: optionalText(80),
  amount: requiredAmount,
  expenseDate: z.string().trim().min(1).max(20),
  method: z.enum(studentPaymentMethodValues).default("CASH"),
  vendor: optionalText(120),
  description: optionalText(700),
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

export async function recordFinancePaymentAction(formData: FormData) {
  const actor = await requireMutationActor("billing.payment.create");
  const input = recordFinancePaymentSchema.parse(Object.fromEntries(formData));
  const receipt = await persistReceiptFile(formData.get("receiptFile"));
  const paidAt = parseDateInput(input.paidDate, "Odenis tarixi");
  const paymentMonth = parseMonthInput(input.paymentMonth);
  const prisma = getPrisma();

  await prisma.$transaction(async (tx) => {
    const paymentResult = await createPaymentAndAllocate(tx, {
      studentId: input.studentId,
      amount: input.amount,
      paidAt,
      paymentMonth,
      method: input.method,
      payerName: input.payerName ?? null,
      receiptFileName: receipt?.fileName ?? null,
      receiptFilePath: receipt?.filePath ?? null,
      receiptReference: input.receiptReference ?? null,
      note: input.note ?? null,
      actorId: actor.id,
    });

    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "finance.payment.record",
      entityType: "payment",
      entityId: paymentResult.payment.id,
      after: toPaymentAuditJson(paymentResult),
      reason: input.note ?? `${paymentResult.studentCode} ucun odenis qebul edildi`,
    });
  });

  invalidateFinanceCaches();
  redirectToFinance(input.returnTo);
}

export async function createFinanceExpenseAction(formData: FormData) {
  const actor = await requireMutationActor("billing.expense.create");
  const input = createExpenseSchema.parse(Object.fromEntries(formData));
  const receipt = await persistReceiptFile(formData.get("receiptFile"));
  const expenseDate = parseDateInput(input.expenseDate, "Xerc tarixi");
  const staff = parseStaffTarget(input.staffTarget);

  if (!input.categoryId && !input.newCategoryName) {
    throw new Error("Xerc kateqoriyasi secilmelidir");
  }

  const prisma = getPrisma();

  await prisma.$transaction(async (tx) => {
    const category = input.newCategoryName
      ? await tx.financeExpenseCategory.upsert({
          where: { name: input.newCategoryName },
          create: {
            name: input.newCategoryName,
            description: "Finance modulundan elave edildi",
            isSystem: false,
          },
          update: {},
          select: { id: true, name: true },
        })
      : await tx.financeExpenseCategory.findUnique({
          where: { id: input.categoryId },
          select: { id: true, name: true },
        });

    if (!category) {
      throw new Error("Xerc kateqoriyasi tapilmadi");
    }

    const usesPayrollFlow = isPayrollCategoryName(category.name);
    const expenseStaff = usesPayrollFlow
      ? staff
      : { employeeUserId: null, teacherId: null };
    const salarySnapshot = usesPayrollFlow
      ? await resolveStaffSalarySnapshot(tx, staff, expenseDate)
      : emptySalarySnapshot();

    const expense = await tx.financeExpense.create({
      data: {
        categoryId: category.id,
        amount: input.amount,
        expenseDate,
        method: input.method as PaymentMethod,
        vendor: input.vendor ?? null,
        description: input.description ?? null,
        employeeUserId: expenseStaff.employeeUserId,
        teacherId: expenseStaff.teacherId,
        salaryMode: salarySnapshot.salaryMode,
        salaryPercent: salarySnapshot.salaryPercent,
        salaryBaseAmount: salarySnapshot.salaryBaseAmount,
        salaryCalculatedAmount: salarySnapshot.salaryCalculatedAmount,
        receiptFileName: receipt?.fileName ?? null,
        receiptFilePath: receipt?.filePath ?? null,
        receiptReference: input.receiptReference ?? null,
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
        category: category.name,
        amount: toNumber(expense.amount),
        expenseDate: expense.expenseDate.toISOString(),
        method: expense.method,
        salaryMode: expense.salaryMode,
        employeeUserId: expenseStaff.employeeUserId,
        teacherId: expenseStaff.teacherId,
        receiptFileName: receipt?.fileName ?? null,
        receiptReference: input.receiptReference ?? null,
      } satisfies Prisma.InputJsonValue,
      reason: input.description ?? `${category.name} xerc qeydi yaradildi`,
    });
  });

  invalidateFinanceCaches();
  redirectToFinance(input.returnTo);
}

async function createPaymentAndAllocate(
  tx: Prisma.TransactionClient,
  input: {
    studentId: string;
    amount: number;
    paidAt: Date;
    paymentMonth: Date;
    method: (typeof studentPaymentMethodValues)[number];
    payerName: string | null;
    receiptFileName: string | null;
    receiptFilePath: string | null;
    receiptReference: string | null;
    note: string | null;
    actorId: string;
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
    },
  });

  if (!student) {
    throw new Error("Telebe tapilmadi");
  }

  const payment = await tx.payment.create({
    data: {
      studentId: student.id,
      amount: input.amount,
      paidAt: input.paidAt,
      paymentMonth: input.paymentMonth,
      method: input.method as PaymentMethod,
      payerName: input.payerName,
      receiptFileName: input.receiptFileName,
      receiptFilePath: input.receiptFilePath,
      receiptReference: input.receiptReference,
      note: input.note,
      createdById: input.actorId,
    },
    select: {
      id: true,
      amount: true,
      paidAt: true,
      paymentMonth: true,
      method: true,
      payerName: true,
      receiptFileName: true,
      receiptReference: true,
    },
  });

  let remainingAmount = input.amount;
  const allocations: Array<{ invoiceId: string; amount: number }> = [];

  for (const invoice of student.invoices) {
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
        reason: "Borc baglandigi ucun status aktiv edildi",
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

function emptySalarySnapshot() {
  return {
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
    throw new Error("Maas xerci ucun isci secilmelidir");
  }

  if (staff.employeeUserId) {
    const employee = await tx.user.findUnique({
      where: { id: staff.employeeUserId },
      select: { id: true, isActive: true },
    });

    if (!employee?.isActive) {
      throw new Error("Secilmis isci tapilmadi ve ya aktiv deyil");
    }

    const lastSalary = await tx.financeExpense.findFirst({
      where: {
        employeeUserId: staff.employeeUserId,
        salaryMode: FinanceSalaryMode.STATIC,
      },
      orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
      select: {
        amount: true,
        salaryCalculatedAmount: true,
      },
    });
    const salaryAmount = roundMoney(toNumber(lastSalary?.salaryCalculatedAmount ?? lastSalary?.amount));

    return {
      salaryMode: FinanceSalaryMode.STATIC,
      salaryPercent: null,
      salaryBaseAmount: salaryAmount,
      salaryCalculatedAmount: salaryAmount,
    };
  }

  const periodMonth = startOfMonth(expenseDate);
  const teacher = await tx.teacher.findUnique({
    where: { id: staff.teacherId ?? "" },
    select: { id: true, isActive: true },
  });

  if (!teacher?.isActive) {
    throw new Error("Secilmis muellim tapilmadi ve ya aktiv deyil");
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
    throw new Error("Isci secimi duzgun deyil");
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

  throw new Error("Isci secimi duzgun deyil");
}

function isPayrollCategoryName(value: string) {
  const normalized = normalizeKeyword(value);
  return [
    "maas",
    "emekhaqqi",
    "emek haqqi",
    "salary",
    "payroll",
    "isci",
    "employee",
    "staff",
    "worker",
  ].some((keyword) => normalized.includes(keyword));
}

function normalizeKeyword(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[ə]/g, "e")
    .replace(/[ı]/g, "i")
    .replace(/[ş]/g, "s")
    .replace(/[ç]/g, "c")
    .replace(/[ğ]/g, "g")
    .replace(/[ö]/g, "o")
    .replace(/[ü]/g, "u");
}

async function persistReceiptFile(value: FormDataEntryValue | null) {
  if (!isUploadedFile(value)) {
    return null;
  }

  if (value.size > 8 * 1024 * 1024) {
    throw new Error("Qebz fayli 8 MB-dan boyuk ola bilmez");
  }

  const uploadDir = path.join(process.cwd(), "public", "uploads", "finance-receipts");
  await mkdir(uploadDir, { recursive: true });

  const originalName = value.name || "receipt";
  const extension = sanitizeExtension(path.extname(originalName));
  const fileName = `${Date.now()}-${randomUUID()}${extension}`;
  const absolutePath = path.join(uploadDir, fileName);
  const buffer = Buffer.from(await value.arrayBuffer());

  await writeFile(absolutePath, buffer);

  return {
    fileName: originalName.slice(0, 180),
    filePath: `/uploads/finance-receipts/${fileName}`,
  };
}

function isUploadedFile(value: FormDataEntryValue | null): value is File {
  return typeof File !== "undefined" && value instanceof File && value.size > 0;
}

function sanitizeExtension(value: string) {
  const safe = value.toLowerCase().replace(/[^a-z0-9.]/g, "").slice(0, 12);
  return safe || ".bin";
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
    throw new Error(`${fieldName} duzgun deyil`);
  }

  return date;
}

function parseMonthInput(value: string) {
  const trimmed = value.trim();
  const monthMatch = trimmed.match(/^(\d{4})-(\d{2})$/);

  if (monthMatch) {
    return new Date(`${monthMatch[1]}-${monthMatch[2]}-01T00:00:00.000Z`);
  }

  return parseDateInput(trimmed, "Odenis ayi");
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

  throw new Error("Tarix GG.AA.IIII ve ya YYYY-MM-DD formatinda olmalidir");
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

function redirectToFinance(value: string | undefined): never {
  redirect(safeFinanceRedirect(value) as Route);
}

function invalidateFinanceCaches() {
  revalidatePath("/finance");
  revalidatePath("/students");
  revalidatePath("/dashboard");
  updateTag(erpCacheTags.finance);
  updateTag(erpCacheTags.students);
  updateTag(erpCacheTags.dashboard);
}
