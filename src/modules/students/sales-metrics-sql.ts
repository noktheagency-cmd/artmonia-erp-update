import { Prisma } from "@/generated/prisma/client";

/**
 * Journal-only admission-sale count (erp.course_sales.qualified_at).
 * Use for the daily sales report and new admission flows that write the journal.
 * Do NOT use for owner KPI / CRM / company progress while historical rows live only
 * on students + status history — call registeredSalesCountSql instead.
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

function registeredSalesBaseSql(ownerIdSql?: Prisma.Sql) {
  const ownerFilter = ownerIdSql
    ? Prisma.sql`and s.manager_id = ${ownerIdSql}`
    : Prisma.sql``;
  return Prisma.sql`
    select s.id, s.registered_at as sale_date
    from erp.students s
    where s.is_test_data = false
      ${ownerFilter}
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
      ${ownerFilter}
  `;
}

/**
 * Production-parity sales count: new registrations plus paid returns.
 * Canonical source for dashboard, company KPI progress, and HR sales bonus
 * until historical admissions are fully written into course_sales.
 */
export function registeredSalesCountSql(from: Prisma.Sql, until: Prisma.Sql) {
  return Prisma.sql`(
    select count(*)::int from (
      ${registeredSalesBaseSql()}
    ) sales
    where sale_date >= ${from}::date and sale_date < ${until}::date
      and sale_date <= (now() at time zone 'Asia/Baku')::date
  )`;
}

/**
 * Owner-scoped production-parity sales (student.manager_id).
 * `ownerIdSql` must be a raw SQL expression (e.g. Prisma.raw("u.id")) or a bound uuid.
 */
export function ownerRegisteredSalesCountSql(
  ownerIdSql: Prisma.Sql,
  from: Prisma.Sql | null,
  until: Prisma.Sql | null,
) {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`sale_date <= (now() at time zone 'Asia/Baku')::date`,
  ];
  if (from) conditions.push(Prisma.sql`sale_date >= ${from}::date`);
  if (until) conditions.push(Prisma.sql`sale_date < ${until}::date`);

  return Prisma.sql`(
    select count(*)::int from (
      ${registeredSalesBaseSql(ownerIdSql)}
    ) sales
    where ${Prisma.join(conditions, " AND ")}
  )`;
}

/**
 * Lead converted in production CRM sense (registered student or REGISTERED stage).
 * Prefer this for CRM conversion / role dashboards. Historical imports have no course_sales rows.
 */
export function leadIsConvertedSql() {
  return Prisma.sql`(
    l.converted_student_id is not null
    or l.stage = 'REGISTERED'::"erp"."LeadStage"
  )`;
}

/**
 * Journal-linked qualifying sale for lead `l` (course_sales only).
 * Empty while admissions were never journaled — use leadIsConvertedSql for CRM KPIs.
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
 * Journal-only owner sales (course_sales.owner_id). Prefer ownerRegisteredSalesCountSql for KPIs.
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
 */
export function actualRegistrationSql(date: Prisma.Sql) {
  return Prisma.sql`${date} <= (now() at time zone 'Asia/Baku')::date`;
}
