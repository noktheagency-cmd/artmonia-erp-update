import {
  InvoiceStatus,
  Prisma,
} from "@/generated/prisma/client";
import { toNumber } from "@/modules/shared/format";

type MissingMonthlyInvoiceRow = {
  studentId: string;
  studentCode: string;
  enrollmentId: string;
  periodMonth: Date | string;
  billingAnchor: Date | string;
  amount: unknown;
  balanceDue: unknown;
};

/**
 * Materializes monthly invoice gaps before a payment is allocated.
 *
 * Imported historical data may contain a monthly payment without an invoice.
 * Such a month is treated as covered; only its unpaid remainder is invoiced.
 */
export async function ensureMissingStudentMonthlyInvoices(
  tx: Prisma.TransactionClient,
  input: { studentId: string; throughDate: Date },
) {
  const throughMonth = startOfMonth(input.throughDate);
  const sentinelMonth = addMonths(throughMonth, 1);
  const rows = await tx.$queryRaw<MissingMonthlyInvoiceRow[]>(Prisma.sql`
    with current_enrollment as (
      select
        e.id,
        e.student_id,
        e.start_date,
        coalesce(e.first_lesson_at, e.start_date) as billing_anchor,
        e.monthly_fee
      from erp.enrollments e
      join erp.students s on s.id = e.student_id
      where e.student_id = ${input.studentId}::uuid
        and e.status in (
          'ACTIVE'::"erp"."EnrollmentStatus",
          'PAUSED'::"erp"."EnrollmentStatus"
        )
        and s.lifecycle_status in (
          'ACTIVE'::"erp"."StudentLifecycleStatus",
          'DEBT'::"erp"."StudentLifecycleStatus"
        )
        and s.billing_paused = false
      order by e.start_date desc, e.created_at desc
      limit 1
    ), evidence as (
      select
        ce.*,
        greatest(
          date_trunc('month', ce.start_date)::date,
          least(
            coalesce((
              select min(i.period_month)
              from erp.invoices i
              where i.student_id = ce.student_id
                and i.status <> 'VOID'::"erp"."InvoiceStatus"
            ), ${sentinelMonth}::date),
            coalesce((
              select min(p.payment_month)
              from erp.payments p
              where p.student_id = ce.student_id
                and p.schedule_type = 'MONTHLY'::"erp"."PaymentScheduleType"
            ), ${sentinelMonth}::date)
          )
        ) as first_billing_month
      from current_enrollment ce
    )
    select
      e.student_id::text as "studentId",
      s.code as "studentCode",
      e.id::text as "enrollmentId",
      billing_month.period_month as "periodMonth",
      e.billing_anchor as "billingAnchor",
      e.monthly_fee as amount,
      greatest(e.monthly_fee - coalesce((
        select sum(p.amount)
        from erp.payments p
        where p.student_id = e.student_id
          and p.schedule_type = 'MONTHLY'::"erp"."PaymentScheduleType"
          and date_trunc('month', p.payment_month) = billing_month.period_month
      ), 0), 0) as "balanceDue"
    from evidence e
    join erp.students s on s.id = e.student_id
    cross join lateral generate_series(
      e.first_billing_month,
      ${throughMonth}::date,
      interval '1 month'
    ) as billing_month(period_month)
    where not exists (
      select 1
      from erp.invoices i
      where i.student_id = e.student_id
        and i.status <> 'VOID'::"erp"."InvoiceStatus"
        and date_trunc('month', i.period_month) = billing_month.period_month
    )
      and e.monthly_fee > coalesce((
        select sum(p.amount)
        from erp.payments p
        where p.student_id = e.student_id
          and p.schedule_type = 'MONTHLY'::"erp"."PaymentScheduleType"
          and date_trunc('month', p.payment_month) = billing_month.period_month
      ), 0)
    order by billing_month.period_month asc
  `);

  if (rows.length === 0) return 0;

  const result = await tx.invoice.createMany({
    data: rows.map((row) => {
      const periodMonth = startOfMonth(new Date(row.periodMonth));
      const amount = toNumber(row.amount);
      const balanceDue = toNumber(row.balanceDue);
      const dueDate = dateInMonth(periodMonth, new Date(row.billingAnchor).getUTCDate());

      return {
        studentId: row.studentId,
        enrollmentId: row.enrollmentId,
        periodMonth,
        issueDate: dueDate,
        dueDate,
        amount,
        balanceDue,
        status: resolveInvoiceStatus({ amount, balanceDue, dueDate, today: input.throughDate }),
        idempotencyKey: `student-gap-${row.studentCode}-${periodMonth.toISOString().slice(0, 10)}`,
      };
    }),
    skipDuplicates: true,
  });

  return result.count;
}

function resolveInvoiceStatus({
  amount,
  balanceDue,
  dueDate,
  today,
}: {
  amount: number;
  balanceDue: number;
  dueDate: Date;
  today: Date;
}) {
  if (balanceDue <= 0) return InvoiceStatus.PAID;
  if (dueDate < startOfDay(today)) return InvoiceStatus.OVERDUE;
  return balanceDue < amount ? InvoiceStatus.PARTIAL : InvoiceStatus.OPEN;
}

function startOfMonth(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
}

function startOfDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function addMonths(value: Date, count: number) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + count, 1));
}

function dateInMonth(month: Date, requestedDay: number) {
  const lastDay = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(
    month.getUTCFullYear(),
    month.getUTCMonth(),
    Math.min(requestedDay, lastDay),
  ));
}
