import { Prisma } from "@/generated/prisma/client";

export const STATIC_GUEST_LESSON_PERCENT = 35;

export type GuestLessonPayrollLine = {
  teacherId: string;
  paymentId: string;
  paidAmount: Prisma.Decimal;
};

export function calculateGuestLessonPayout(amount: Prisma.Decimal, percent: Prisma.Decimal | number) {
  const eligibleRevenue = Prisma.Decimal.max(amount, 0).toDecimalPlaces(2);
  return {
    eligibleRevenue,
    payoutAmount: eligibleRevenue.mul(Prisma.Decimal.max(percent, 0)).div(100)
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
  };
}

export async function queryGuestLessonPayrollLines(
  db: Pick<Prisma.TransactionClient, "$queryRaw">,
  periodMonth: Date,
  teacherIds?: string[],
) {
  return db.$queryRaw<GuestLessonPayrollLine[]>(Prisma.sql`
    select l.teacher_id::text as "teacherId", p.id::text as "paymentId",
      least(l.price, p.amount, sum(pa.amount_allocated)) as "paidAmount"
    from erp.single_lessons l
    join erp.payments p on p.id = l.payment_id
    join erp.invoices i on i.id = l.invoice_id
    join erp.payment_allocations pa on pa.payment_id = p.id and pa.invoice_id = i.id
    join erp.students s on s.id = l.student_id
    where l.status = 'ATTENDED'::"erp"."LessonStatus"
      and p.payment_month = ${periodMonth}
      and p.receipt_purpose = 'ONE_OFF' and p.refunded_at is null
      and i.status <> 'VOID'::"erp"."InvoiceStatus" and not s.is_test_data
      ${teacherIds?.length ? Prisma.sql`and l.teacher_id in (${Prisma.join(teacherIds)})` : Prisma.empty}
    group by l.id, p.id
    having sum(pa.amount_allocated) > 0
  `);
}

// Static salary includes only guest commissions, never old monthly percentage lines.
export async function getSavedGuestLessonPayout(tx: Prisma.TransactionClient, teacherId: string, periodMonth: Date) {
  const result = await tx.teacherPayoutLine.aggregate({
    where: {
      enrollmentId: null,
      payout: { teacherId, periodMonth },
      payment: { singleLesson: { is: { teacherId } } },
    },
    _sum: { payoutAmount: true },
  });
  return result._sum.payoutAmount ?? new Prisma.Decimal(0);
}
