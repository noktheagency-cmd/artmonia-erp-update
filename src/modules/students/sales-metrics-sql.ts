import { Prisma } from "@/generated/prisma/client";

/**
 * Canonical admission-sale count for a date window (BK-01 / BK-04 / BK-21).
 * Same source as the daily sales report: erp.course_sales.qualified_at.
 * Cancelled sales are excluded from the net period total.
 */
export function companySalesCountSql(from: Prisma.Sql, until: Prisma.Sql) {
  return Prisma.sql`(
    select count(*)::int
    from erp.course_sales x
    join erp.students s on s.id = x.student_id
    where s.is_test_data = false
      and x.cancelled_at is null
      and x.qualified_at >= ${from}::date
      and x.qualified_at < ${until}::date
      and x.qualified_at <= (now() at time zone 'Asia/Baku')::date
  )`;
}

/**
 * Production owner-dashboard sales count: new registrations plus paid returns.
 * The course_sales journal is still empty for historical admissions.
 */
export function registeredSalesCountSql(from: Prisma.Sql, until: Prisma.Sql) {
  return Prisma.sql`(
    select count(*)::int from (
      select s.id, s.registered_at as sale_date
      from erp.students s
      where s.is_test_data = false
      union all
      select s.id, greatest(r.effective_at, activation.activated_at, payment.paid_at) as sale_date
      from erp.students s
      join (
        select distinct student_id, effective_at
        from erp.student_status_history
        where event_type = 'REACTIVATED'::"erp"."StudentLifecycleEventType"
      ) r on r.student_id = s.id and r.effective_at > s.registered_at
      left join lateral (
        select min(h.effective_at) as stopped_at
        from erp.student_status_history h
        where h.student_id = s.id and h.effective_at > r.effective_at
          and h.new_status in ('FROZEN', 'STOPPED', 'COMPLETED', 'DECLINED')
      ) next_stop on true
      join lateral (
        select min(h.effective_at) as activated_at
        from erp.student_status_history h
        where h.student_id = s.id and h.new_status = 'ACTIVE'
          and h.effective_at >= r.effective_at
          and (next_stop.stopped_at is null or h.effective_at < next_stop.stopped_at)
      ) activation on activation.activated_at is not null
      join lateral (
        select min(p.paid_at) as paid_at
        from erp.payments p
        where p.student_id = s.id and p.amount > 0 and p.paid_at >= r.effective_at
          and (next_stop.stopped_at is null or p.paid_at < next_stop.stopped_at)
      ) payment on payment.paid_at is not null
      where s.is_test_data = false
    ) sales
    where sale_date >= ${from}::date and sale_date < ${until}::date
      and sale_date <= (now() at time zone 'Asia/Baku')::date
  )`;
}

/**
 * Whether lead `l` has a non-cancelled qualifying admission sale.
 * Prefer course_sales.lead_id; fall back to converted_student_id linkage.
 */
export function leadHasQualifiedSaleSql() {
  return Prisma.sql`exists (
    select 1
    from erp.course_sales cs
    join erp.students sale_student on sale_student.id = cs.student_id
    where sale_student.is_test_data = false
      and cs.cancelled_at is null
      and (
        cs.lead_id = l.id
        or (
          l.converted_student_id is not null
          and cs.student_id = l.converted_student_id
        )
      )
  )`;
}

/**
 * Owner-scoped sales in a window (sale owner = course_sales.owner_id).
 * `ownerIdSql` must be a raw SQL expression (e.g. Prisma.raw("u.id")) or a bound uuid.
 */
export function ownerSalesCountSql(
  ownerIdSql: Prisma.Sql,
  from: Prisma.Sql | null,
  until: Prisma.Sql | null,
) {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`sale_student.is_test_data = false`,
    Prisma.sql`cs.cancelled_at is null`,
    Prisma.sql`cs.owner_id = ${ownerIdSql}`,
  ];

  if (from) {
    conditions.push(Prisma.sql`cs.qualified_at >= ${from}::date`);
  }
  if (until) {
    conditions.push(Prisma.sql`cs.qualified_at < ${until}::date`);
  }

  return Prisma.sql`(
    select count(*)::int
    from erp.course_sales cs
    join erp.students sale_student on sale_student.id = cs.student_id
    where ${Prisma.join(conditions, " AND ")}
  )`;
}

/**
 * Calendar-day guard for dates that must not count in the future (Baku).
 * Prefer course_sales.qualified_at for admission-sale KPIs and HR sales bonus.
 */
export function actualRegistrationSql(date: Prisma.Sql) {
  return Prisma.sql`${date} <= (now() at time zone 'Asia/Baku')::date`;
}
