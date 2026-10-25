import { Prisma } from "@/generated/prisma/client";

/**
 * Canonical admission-sale count: erp.course_sales.qualified_at.
 *
 * Covers the three paid routes written by recordCourseSalePayment:
 *   NEW  + CRM    — müraciətdən gəlib ödəniş alan
 *   NEW  + DIRECT — tələbələr səhifəsindən birbaşa əlavə + ödəniş
 *   RETURN + *    — STOPPED/FROZEN qayıdış + ödəniş (avans və ya tam)
 *
 * Cancelled / refunded deposits are excluded (cancelled_at is not null).
 * Use everywhere owner dashboard, company KPI, daily report, bonus, and
 * marketing "satış" must agree.
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
 * @deprecated Alias of companySalesCountSql — kept so older call sites stay on the journal.
 */
export function registeredSalesCountSql(from: Prisma.Sql, until: Prisma.Sql) {
  return companySalesCountSql(from, until);
}

/**
 * Owner-scoped journal sales (course_sales.owner_id).
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
    Prisma.sql`cs.qualified_at <= (now() at time zone 'Asia/Baku')::date`,
  ];

  if (from) {
    conditions.push(Prisma.sql`cs.qualified_at >= (${from})::date`);
  }
  if (until) {
    // Bounds may contain date arithmetic; cast the whole expression, not its interval.
    conditions.push(Prisma.sql`cs.qualified_at < (${until})::date`);
  }

  return Prisma.sql`(
    select count(*)::int
    from erp.course_sales cs
    join erp.students sale_student on sale_student.id = cs.student_id
    where ${Prisma.join(conditions, " AND ")}
  )`;
}

/**
 * @deprecated Alias of ownerSalesCountSql.
 */
export function ownerRegisteredSalesCountSql(
  ownerIdSql: Prisma.Sql,
  from: Prisma.Sql | null,
  until: Prisma.Sql | null,
) {
  return ownerSalesCountSql(ownerIdSql, from, until);
}

/**
 * Department bonus sales: journal rows whose owner belongs to the department.
 * Inclusive end date matches HR campaign windows (starts_at..ends_at).
 */
export function departmentSalesCountSql(
  departmentSql: Prisma.Sql,
  from: Prisma.Sql,
  untilInclusive: Prisma.Sql,
  eligibleCampaignIdSql?: Prisma.Sql,
) {
  const eligibility = eligibleCampaignIdSql
    ? Prisma.sql`and exists (
        select 1 from erp.hr_bonus_participants participant
        where participant.campaign_id = ${eligibleCampaignIdSql}
          and participant.employee_id = he.id
          and participant.is_eligible = true
      )`
    : Prisma.sql``;

  return Prisma.sql`(
    select count(*)::int
    from erp.course_sales cs
    join erp.students s on s.id = cs.student_id
    join erp.hr_employees he on he.user_id = cs.owner_id
    where s.is_test_data = false
      and cs.cancelled_at is null
      and he.department = ${departmentSql}
      and cs.qualified_at >= ${from}::date
      and cs.qualified_at <= ${untilInclusive}::date
      and cs.qualified_at <= (now() at time zone 'Asia/Baku')::date
      ${eligibility}
  )`;
}

/**
 * Lead converted in production CRM sense (registered student or REGISTERED stage).
 * Funnel metric — not a paid sale. Prefer leadHasQualifiedSaleSql for sale KPIs.
 */
export function leadIsConvertedSql() {
  return Prisma.sql`(
    l.converted_student_id is not null
    or l.stage = 'REGISTERED'::"erp"."LeadStage"
  )`;
}

/**
 * Paid qualifying sale for lead `l` (open course_sales on the lead or converted student).
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
 * Lead reached a consultation / trial meeting path (stage history or attended appointment).
 * Used to split CRM paid sales: konsultasiya ilə vs follow-up shortcut.
 */
export function leadHadConsultationSql() {
  return Prisma.sql`(
    l.stage in (
      'QUALIFIED'::"erp"."LeadStage",
      'TRIAL_LESSON'::"erp"."LeadStage",
      'TRIAL_CONSULTATION'::"erp"."LeadStage"
    )
    or exists (
      select 1
      from erp.lead_stage_history h
      where h.lead_id = l.id
        and h.new_stage in (
          'QUALIFIED'::"erp"."LeadStage",
          'TRIAL_LESSON'::"erp"."LeadStage",
          'TRIAL_CONSULTATION'::"erp"."LeadStage"
        )
    )
    or exists (
      select 1
      from erp.crm_appointments a
      where a.lead_id = l.id
        and a.outcome = 'ATTENDED'
        and a.kind in ('MEETING', 'CONSULTATION', 'TRIAL')
    )
  )`;
}

/**
 * Period journal sales with optional route/kind filter (canonical course_sales).
 */
export function periodCourseSalesCountSql(
  from: Prisma.Sql,
  until: Prisma.Sql,
  options?: { route?: "CRM" | "DIRECT"; kind?: "NEW" | "RETURN" },
) {
  const filters: Prisma.Sql[] = [
    Prisma.sql`s.is_test_data = false`,
    Prisma.sql`cs.cancelled_at is null`,
    Prisma.sql`cs.qualified_at >= ${from}::date`,
    Prisma.sql`cs.qualified_at < ${until}::date`,
    Prisma.sql`cs.qualified_at <= (now() at time zone 'Asia/Baku')::date`,
  ];
  if (options?.route) {
    filters.push(Prisma.sql`cs.route = ${options.route}`);
  }
  if (options?.kind) {
    filters.push(Prisma.sql`cs.kind = ${options.kind}`);
  }
  return Prisma.sql`(
    select count(*)::int
    from erp.course_sales cs
    join erp.students s on s.id = cs.student_id
    where ${Prisma.join(filters, " AND ")}
  )`;
}

/**
 * Calendar-day guard for dates that must not count in the future (Baku).
 */
export function actualRegistrationSql(date: Prisma.Sql) {
  return Prisma.sql`${date} <= (now() at time zone 'Asia/Baku')::date`;
}
