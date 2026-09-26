import {
  InvoiceStatus,
  Prisma,
} from "@/generated/prisma/client";
import { writeAuditLog } from "@/modules/audit/audit-service";
import { toNumber } from "@/modules/shared/format";
import { PublicActionError } from "@/server/actions/public-action-error";

export const enrollmentBillingChangeModeValues = ["FROM_MONTH", "ONLY_MONTH"] as const;
export type EnrollmentBillingChangeMode =
  (typeof enrollmentBillingChangeModeValues)[number];

type BillingTermsRow = {
  monthlyFee: unknown;
  lessonsPerMonth: number | null;
  discountType: string | null;
};

export function parseEnrollmentBillingMonth(value: string) {
  if (!/^\d{4}-\d{2}$/.test(value)) {
    throw new PublicActionError("Tarifin qüvvəyə minəcəyi ay düzgün seçilməyib.");
  }
  const parsed = new Date(`${value}-01T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 7) !== value
  ) {
    throw new PublicActionError("Tarifin qüvvəyə minəcəyi ay düzgün seçilməyib.");
  }
  return parsed;
}

export function resolveRepricedInvoice(input: {
  amount: number;
  allocatedAmount: number;
  dueDate: Date;
  today: Date;
}) {
  const amount = roundMoney(input.amount);
  const allocatedAmount = roundMoney(input.allocatedAmount);
  if (allocatedAmount > amount) {
    throw new PublicActionError(
      "Yeni məbləğ bu ay üzrə artıq bölüşdürülmüş ödənişdən azdır. Artıq ödəniş əvvəlcə kredit və ya geri qaytarma kimi rəsmiləşdirilməlidir.",
    );
  }

  const balanceDue = roundMoney(amount - allocatedAmount);
  const status = balanceDue <= 0
    ? InvoiceStatus.PAID
    : balanceDue < amount
      ? InvoiceStatus.PARTIAL
      : input.dueDate < input.today
        ? InvoiceStatus.OVERDUE
        : InvoiceStatus.OPEN;

  return { amount, balanceDue, status };
}

export async function resolveEnrollmentBillingTerms(
  tx: Prisma.TransactionClient,
  input: {
    enrollmentId: string;
    periodMonth: Date;
    fallbackMonthlyFee: number;
    fallbackLessonsPerMonth?: number | null;
    fallbackDiscountType?: string | null;
  },
) {
  const rows = await tx.$queryRaw<BillingTermsRow[]>(Prisma.sql`
    select
      term.monthly_fee as "monthlyFee",
      term.lessons_per_month as "lessonsPerMonth",
      term.discount_type as "discountType"
    from erp.enrollment_billing_terms term
    where term.enrollment_id = ${input.enrollmentId}::uuid
      and (
        (
          term.mode = 'ONLY_MONTH'
          and term.effective_month = ${input.periodMonth}::date
        )
        or (
          term.mode = 'FROM_MONTH'
          and term.effective_month <= ${input.periodMonth}::date
        )
      )
    order by
      case when term.mode = 'ONLY_MONTH' then 0 else 1 end,
      term.effective_month desc,
      term.created_at desc
    limit 1
  `);
  const row = rows[0];
  return {
    monthlyFee: row ? toNumber(row.monthlyFee) : input.fallbackMonthlyFee,
    lessonsPerMonth: row?.lessonsPerMonth ?? input.fallbackLessonsPerMonth ?? null,
    discountType: row?.discountType ?? input.fallbackDiscountType ?? null,
  };
}

export async function applyEnrollmentBillingChange(
  tx: Prisma.TransactionClient,
  input: {
    actorUserId: string;
    studentId: string;
    studentCode: string;
    enrollmentId: string;
    effectiveMonth: Date;
    mode: EnrollmentBillingChangeMode;
    previousMonthlyFee: number;
    previousLessonsPerMonth: number | null;
    previousDiscountType: string | null;
    monthlyFee: number;
    lessonsPerMonth: number | null;
    discountType: string | null;
    reason: string;
    today: Date;
  },
) {
  const previousTerms = await resolveEnrollmentBillingTerms(tx, {
    enrollmentId: input.enrollmentId,
    periodMonth: input.effectiveMonth,
    fallbackMonthlyFee: input.previousMonthlyFee,
    fallbackLessonsPerMonth: input.previousLessonsPerMonth,
    fallbackDiscountType: input.previousDiscountType,
  });

  const termRows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    insert into erp.enrollment_billing_terms (
      id,
      enrollment_id,
      effective_month,
      mode,
      monthly_fee,
      lessons_per_month,
      discount_type,
      reason,
      created_by_id,
      created_at,
      updated_at
    ) values (
      gen_random_uuid(),
      ${input.enrollmentId}::uuid,
      ${input.effectiveMonth}::date,
      ${input.mode},
      ${input.monthlyFee},
      ${input.lessonsPerMonth},
      ${input.discountType},
      ${input.reason},
      ${input.actorUserId}::uuid,
      now(),
      now()
    )
    on conflict (enrollment_id, effective_month, mode)
    do update set
      monthly_fee = excluded.monthly_fee,
      lessons_per_month = excluded.lessons_per_month,
      discount_type = excluded.discount_type,
      reason = excluded.reason,
      created_by_id = excluded.created_by_id,
      updated_at = now()
    returning id::text as id
  `);

  await writeAuditLog(tx, {
    actorUserId: input.actorUserId,
    action: "student.billing_terms.change",
    entityType: "student",
    entityId: input.studentId,
    before: {
      enrollmentId: input.enrollmentId,
      effectiveMonth: input.effectiveMonth.toISOString(),
      mode: input.mode,
      monthlyFee: previousTerms.monthlyFee,
      lessonsPerMonth: previousTerms.lessonsPerMonth,
      discountType: previousTerms.discountType,
    } satisfies Prisma.InputJsonValue,
    after: {
      termId: termRows[0]?.id ?? null,
      enrollmentId: input.enrollmentId,
      effectiveMonth: input.effectiveMonth.toISOString(),
      mode: input.mode,
      monthlyFee: input.monthlyFee,
      lessonsPerMonth: input.lessonsPerMonth,
      discountType: input.discountType,
    } satisfies Prisma.InputJsonValue,
    reason: input.reason,
  });

  const invoices = await tx.invoice.findMany({
    where: {
      enrollmentId: input.enrollmentId,
      status: { not: InvoiceStatus.VOID },
      ...(input.mode === "ONLY_MONTH"
        ? { periodMonth: input.effectiveMonth }
        : { periodMonth: { gte: input.effectiveMonth } }),
    },
    orderBy: [{ periodMonth: "asc" }, { id: "asc" }],
    select: {
      id: true,
      periodMonth: true,
      dueDate: true,
      amount: true,
      balanceDue: true,
      status: true,
      paymentAllocations: { select: { amountAllocated: true } },
    },
  });

  const repricedInvoiceIds: string[] = [];
  for (const invoice of invoices) {
    const invoiceTerms = await resolveEnrollmentBillingTerms(tx, {
      enrollmentId: input.enrollmentId,
      periodMonth: invoice.periodMonth,
      fallbackMonthlyFee: input.monthlyFee,
      fallbackLessonsPerMonth: input.lessonsPerMonth,
      fallbackDiscountType: input.discountType,
    });
    const allocatedAmount = invoice.paymentAllocations.reduce(
      (total, allocation) => total + toNumber(allocation.amountAllocated),
      0,
    );
    const repriced = resolveRepricedInvoice({
      amount: invoiceTerms.monthlyFee,
      allocatedAmount,
      dueDate: invoice.dueDate,
      today: input.today,
    });

    const before = {
      periodMonth: invoice.periodMonth.toISOString(),
      amount: toNumber(invoice.amount),
      balanceDue: toNumber(invoice.balanceDue),
      status: invoice.status,
      allocatedAmount: roundMoney(allocatedAmount),
    } satisfies Prisma.InputJsonValue;

    await tx.invoice.update({
      where: { id: invoice.id },
      data: repriced,
    });
    repricedInvoiceIds.push(invoice.id);

    await writeAuditLog(tx, {
      actorUserId: input.actorUserId,
      action: "billing.invoice.reprice",
      entityType: "invoice",
      entityId: invoice.id,
      before,
      after: {
        studentCode: input.studentCode,
        periodMonth: invoice.periodMonth.toISOString(),
        amount: repriced.amount,
        balanceDue: repriced.balanceDue,
        status: repriced.status,
        allocatedAmount: roundMoney(allocatedAmount),
        billingChangeMode: input.mode,
        lessonsPerMonth: invoiceTerms.lessonsPerMonth,
        discountType: invoiceTerms.discountType,
      } satisfies Prisma.InputJsonValue,
      reason: input.reason,
    });
  }

  return { termId: termRows[0]?.id ?? null, repricedInvoiceIds };
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}
