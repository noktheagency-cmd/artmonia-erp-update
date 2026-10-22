import { Prisma } from "@/generated/prisma/client";

type StudentAmountSqlInput = {
  studentId: Prisma.Sql;
  asOfDate?: Date;
};

/** Total unpaid amount, including amounts whose due date is still in the future. */
export function buildStudentOpenBalanceValueSql({ studentId }: StudentAmountSqlInput) {
  return Prisma.sql`coalesce((
    select sum(invoice.balance_due)
    from erp.invoices invoice
    where invoice.student_id = ${studentId}
      and invoice.status <> 'VOID'::"erp"."InvoiceStatus"
      and invoice.balance_due > 0
  ), 0)`;
}

/** Actionable debt only: unpaid invoices whose due date has arrived. */
export function buildStudentDueDebtValueSql({
  studentId,
  asOfDate,
}: StudentAmountSqlInput & { asOfDate: Date }) {
  return Prisma.sql`coalesce((
    select sum(invoice.balance_due)
    from erp.invoices invoice
    where invoice.student_id = ${studentId}
      and invoice.status <> 'VOID'::"erp"."InvoiceStatus"
      and invoice.balance_due > 0
      and (invoice.due_date is null or invoice.due_date <= ${asOfDate}::date)
  ), 0)`;
}

/**
 * Remaining first-period fee after avans/deposit payments on an open course sale.
 * Shown as Cari borc when no due invoice exists yet (SLOT_WAITING admissions).
 */
export function buildStudentAdvanceRemainingValueSql({ studentId }: StudentAmountSqlInput) {
  return Prisma.sql`coalesce((
    select greatest(
      cs.initial_fee - coalesce((
        select sum(p.amount)
        from erp.payments p
        where p.course_sale_id = cs.id
          and p.refunded_at is null
      ), 0),
      0
    )
    from erp.course_sales cs
    where cs.student_id = ${studentId}
      and cs.status = 'DEPOSIT'
      and cs.cancelled_at is null
    order by cs.created_at desc
    limit 1
  ), 0)`;
}

/** Unpaid invoices that are scheduled after the reporting date. */
export function buildStudentFutureReceivableValueSql({
  studentId,
  asOfDate,
}: StudentAmountSqlInput & { asOfDate: Date }) {
  return Prisma.sql`coalesce((
    select sum(invoice.balance_due)
    from erp.invoices invoice
    where invoice.student_id = ${studentId}
      and invoice.status <> 'VOID'::"erp"."InvoiceStatus"
      and invoice.balance_due > 0
      and invoice.due_date > ${asOfDate}::date
  ), 0)`;
}

/** Oldest due date that already represents debt. */
export function buildStudentOldestDebtDueDateSql({
  studentId,
  asOfDate,
}: StudentAmountSqlInput & { asOfDate: Date }) {
  return Prisma.sql`(
    select min(invoice.due_date)
    from erp.invoices invoice
    where invoice.student_id = ${studentId}
      and invoice.status <> 'VOID'::"erp"."InvoiceStatus"
      and invoice.balance_due > 0
      and (invoice.due_date is null or invoice.due_date <= ${asOfDate}::date)
  )`;
}

/**
 * Returns the oldest unpaid due date. Once everything issued is paid, derives
 * the next monthly date from the immutable first-lesson anchor and the latest
 * invoiced period. It never uses slot, group or payment dates as the anchor.
 */
export function buildStudentNextPaymentDateSql(studentId: Prisma.Sql = Prisma.sql`s.id`) {
  return Prisma.sql`coalesce(
    (
      select min(invoice.due_date)
      from erp.invoices invoice
      where invoice.student_id = ${studentId}
        and invoice.status <> 'VOID'::"erp"."InvoiceStatus"
        and invoice.balance_due > 0
    ),
    (
      select case
        when student.billing_paused
          or student.billing_anchor_date is null
          or student.lifecycle_status not in (
            'ACTIVE'::"erp"."StudentLifecycleStatus",
            'FROZEN'::"erp"."StudentLifecycleStatus"
          )
        then null
        else erp.next_unfrozen_billing_date(
          student.id,
          coalesce(
            (
              select (date_trunc('month', max(invoice.period_month)) + interval '1 month')::date
              from erp.invoices invoice
              where invoice.student_id = student.id
                and invoice.status <> 'VOID'::"erp"."InvoiceStatus"
            ),
            date_trunc('month', student.billing_anchor_date)::date
          )
        )
      end
      from erp.students student
      where student.id = ${studentId}
    )
  )`;
}
