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
 * Acquisition-bonus eligibility still uses registration calendar day (not sale journal).
 * Bonus policy is intentionally separate from company/KPI admission-sale totals.
 */
export function actualRegistrationSql(date: Prisma.Sql) {
  return Prisma.sql`${date} <= (now() at time zone 'Asia/Baku')::date`;
}
