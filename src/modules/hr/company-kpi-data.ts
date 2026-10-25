import { guestOnlyStudentSql } from "@/modules/students/guest-lesson-sql";
import {
  activeStudentsActualSql,
  activeStudentsAsOfSql,
} from "@/modules/students/active-students-metrics-sql";
import { companySalesCountSql } from "@/modules/students/sales-metrics-sql";
import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { getBakuDateInput } from "@/modules/students/student-reminders";
import {
  buildCompanyKpiMetrics,
  buildCompanyKpiRollover,
  type CompanyKpiActuals,
  type CompanyKpiMetric,
  type CompanyKpiPeriod,
  type CompanyKpiTargets,
} from "@/modules/hr/company-kpi-calculations";
import { requireErpActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";

export type CompanyKpiData = {
  periodMonth: string;
  monthLabel: string;
  targets: CompanyKpiTargets | null;
  baseTargets: CompanyKpiTargets | null;
  carryIn: CompanyKpiTargets | null;
  metrics: CompanyKpiMetric[];
  period: CompanyKpiPeriod;
  plan: CompanyKpiPlanDto | null;
  permissions: {
    canRead: boolean;
    canManage: boolean;
  };
};

export type CompanyKpiPlanDto = {
  id: string;
  name: string;
  startMonth: string;
  endMonth: string;
  durationMonths: 6 | 12;
  totals: CompanyKpiTargets;
  months: Array<{
    periodMonth: string;
    monthLabel: string;
    baseTargets: CompanyKpiTargets;
    effectiveTargets: CompanyKpiTargets;
    actuals: CompanyKpiTargets;
    carryIn: CompanyKpiTargets | null;
    isComplete: boolean;
  }>;
};

type ActualRow = {
  activeStudents: unknown;
  openingActiveStudents: unknown;
  newSales: unknown;
  churn: unknown;
  leads: unknown;
  convertedLeads: unknown;
  revenue: unknown;
};

type CompanyKpiPlanRow = Prisma.CompanyKpiPlanGetPayload<{
  include: { monthlyTargets: true };
}>;

export async function getCompanyKpiData(requestedMonth?: string): Promise<CompanyKpiData> {
  const actor = await requireErpActor();
  const todayKey = getBakuDateInput();
  const periodMonth = normalizeMonthKey(requestedMonth, todayKey.slice(0, 7));
  const period = resolvePeriod(periodMonth, todayKey);

  if (!actor.permissions.has("hr.company_kpi.read")) {
    return emptyCompanyKpiData(periodMonth, period);
  }

  const prisma = getPrisma();
  const periodStart = dateFromKey(`${periodMonth}-01`);
  const targetPromise = prisma.companyMonthlyTarget.findUnique({
    where: { periodMonth: periodStart },
    select: {
      activeStudentsTarget: true,
      newSalesTarget: true,
      churnMaxTarget: true,
      leadTarget: true,
      conversionTarget: true,
      revenueTarget: true,
    },
  });
  const planPromise = prisma.companyKpiPlan.findFirst({
    where: { startMonth: { lte: periodStart }, endMonth: { gte: periodStart } },
    include: { monthlyTargets: { orderBy: { periodMonth: "asc" } } },
    orderBy: { startMonth: "desc" },
  });
  const actualPromise = getActualsForMonth(periodStart, todayKey);
  const [targetRow, planRow, requestedActuals] = await Promise.all([
    targetPromise,
    planPromise,
    actualPromise,
  ]);

  const plan = planRow ? await buildPlanDto(planRow, todayKey) : null;
  const planMonth = plan?.months.find((month) => month.periodMonth === periodMonth) ?? null;
  const baseTargets = planMonth?.baseTargets ?? (targetRow ? targetsFromRow(targetRow) : null);
  const targets = planMonth?.effectiveTargets ?? baseTargets;
  const actuals = planMonth
    ? { ...planMonth.actuals, openingActiveStudents: requestedActuals.openingActiveStudents, convertedLeads: requestedActuals.convertedLeads }
    : requestedActuals;

  return {
    periodMonth,
    monthLabel: formatMonthLabel(periodStart),
    targets,
    baseTargets,
    carryIn: planMonth?.carryIn ?? null,
    metrics: buildCompanyKpiMetrics(targets, actuals, period),
    period,
    plan,
    permissions: {
      canRead: true,
      canManage: actor.permissions.has("hr.company_kpi.manage"),
    },
  };
}

async function buildPlanDto(
  plan: CompanyKpiPlanRow,
  todayKey: string,
): Promise<CompanyKpiPlanDto> {
  if (!plan) throw new Error("KPI planı tapılmadı");
  const monthlyRows = plan.monthlyTargets ?? [];
  const monthInputs = await Promise.all(monthlyRows.map(async (row) => {
    const monthKey = row.periodMonth.toISOString().slice(0, 7);
    const period = resolvePeriod(monthKey, todayKey);
    const actuals = await getActualsForMonth(row.periodMonth, todayKey);
    return {
      periodMonth: monthKey,
      baseTargets: targetsFromRow(row),
      actuals: targetsFromActuals(actuals),
      isComplete: period.isComplete,
    };
  }));
  const rollover = buildCompanyKpiRollover(monthInputs);

  return {
    id: plan.id,
    name: plan.name,
    startMonth: plan.startMonth.toISOString().slice(0, 7),
    endMonth: plan.endMonth.toISOString().slice(0, 7),
    durationMonths: plan.durationMonths === 12 ? 12 : 6,
    totals: targetsFromRow(plan),
    months: rollover.map((month) => ({
      periodMonth: month.periodMonth,
      monthLabel: formatMonthLabel(dateFromKey(`${month.periodMonth}-01`)),
      baseTargets: month.baseTargets,
      effectiveTargets: month.effectiveTargets,
      actuals: month.actuals,
      carryIn: month.carryIn,
      isComplete: month.isComplete,
    })),
  };
}

async function getActualsForMonth(periodStart: Date, todayKey: string) {
  const periodMonth = periodStart.toISOString().slice(0, 7);
  const period = resolvePeriod(periodMonth, todayKey);
  if (!period.hasStarted) return emptyActuals();
  const periodEnd = addUtcMonths(periodStart, 1);
  const actualEnd = period.isComplete ? periodEnd : addUtcDays(dateFromKey(todayKey), 1);
  return getActuals(periodStart, actualEnd, period.isComplete);
}

async function getActuals(
  periodStart: Date,
  actualEnd: Date,
  isComplete: boolean,
): Promise<CompanyKpiActuals> {
  const [row] = await getPrisma().$queryRaw<ActualRow[]>(Prisma.sql`
    select
      coalesce(${activeStudentsActualSql(Prisma.sql`${actualEnd}`, isComplete)}, 0) as "activeStudents",
      coalesce(${activeStudentsAsOfSql(Prisma.sql`${periodStart}`)}, 0) as "openingActiveStudents",
      ${companySalesCountSql(Prisma.sql`${periodStart}`, Prisma.sql`${actualEnd}`)} as "newSales",
      coalesce((
        select count(distinct h.student_id)::int
        from erp.student_status_history h
        join erp.students s on s.id = h.student_id
        where h.effective_at >= ${periodStart}
          and h.effective_at < ${actualEnd}
          and h.old_status = 'ACTIVE'::"erp"."StudentLifecycleStatus"
          and h.new_status in (
            'STOPPED'::"erp"."StudentLifecycleStatus",
            'DECLINED'::"erp"."StudentLifecycleStatus"
          )
          and s.is_test_data = false
      ), 0) as "churn",
      coalesce((
        select count(*)::int
        from erp.leads l
        where l.created_at >= ${periodStart}
          and l.created_at < ${actualEnd}
      ), 0) as "leads",
      coalesce((
        select count(*)::int
        from erp.leads l
        where l.created_at >= ${periodStart}
          and l.created_at < ${actualEnd}
          and (
            exists (
              select 1
              from erp.lead_stage_history lh
              where lh.lead_id = l.id
                and lh.new_stage = 'REGISTERED'::"erp"."LeadStage"
                and lh.created_at < ${actualEnd}
            )
            or exists (
              select 1
              from erp.students converted
              where converted.id = l.converted_student_id and not ${guestOnlyStudentSql(Prisma.sql`converted.id`)}
                and converted.registered_at < ${actualEnd}
                and converted.is_test_data = false
            )
          )
      ), 0) as "convertedLeads",
      coalesce((
        select sum(p.amount)
        from erp.payments p
        join erp.students s on s.id = p.student_id
        where p.receipt_purpose <> 'ONE_OFF' and p.paid_at >= ${periodStart}
          and p.paid_at < ${actualEnd}
          and s.is_test_data = false
      ), 0) + coalesce((
        select sum(wp.amount)
        from erp.workshop_payments wp
        where wp.paid_at >= ${periodStart}
          and wp.paid_at < ${actualEnd}
          and wp.voided_at is null
      ), 0) as "revenue"
  `);

  const leads = toNumber(row?.leads);
  const convertedLeads = toNumber(row?.convertedLeads);
  return {
    activeStudents: toNumber(row?.activeStudents),
    openingActiveStudents: toNumber(row?.openingActiveStudents),
    newSales: toNumber(row?.newSales),
    churn: toNumber(row?.churn),
    leads,
    convertedLeads,
    conversion: leads > 0 ? (convertedLeads / leads) * 100 : 0,
    revenue: toNumber(row?.revenue),
  };
}

function resolvePeriod(periodMonth: string, todayKey: string): CompanyKpiPeriod {
  const start = dateFromKey(`${periodMonth}-01`);
  const nextMonth = addUtcMonths(start, 1);
  const today = dateFromKey(todayKey);
  const totalDays = Math.round((nextMonth.getTime() - start.getTime()) / 86_400_000);
  const hasStarted = start.getTime() <= today.getTime();
  const isComplete = nextMonth.getTime() <= today.getTime();
  const elapsedDays = !hasStarted
    ? 0
    : isComplete
      ? totalDays
      : Math.min(totalDays, today.getUTCDate());

  return {
    elapsedDays,
    totalDays,
    remainingDays: isComplete ? 0 : hasStarted ? totalDays - elapsedDays + 1 : totalDays,
    hasStarted,
    isComplete,
  };
}

function emptyCompanyKpiData(periodMonth: string, period: CompanyKpiPeriod): CompanyKpiData {
  return {
    periodMonth,
    monthLabel: formatMonthLabel(dateFromKey(`${periodMonth}-01`)),
    targets: null,
    baseTargets: null,
    carryIn: null,
    metrics: [],
    period,
    plan: null,
    permissions: { canRead: false, canManage: false },
  };
}

function targetsFromRow(row: {
  activeStudentsTarget: number;
  newSalesTarget: number;
  churnMaxTarget: number;
  leadTarget: number;
  conversionTarget: Prisma.Decimal | number;
  revenueTarget: Prisma.Decimal | number;
}): CompanyKpiTargets {
  return {
    activeStudents: row.activeStudentsTarget,
    newSales: row.newSalesTarget,
    churn: row.churnMaxTarget,
    leads: row.leadTarget,
    conversion: Number(row.conversionTarget),
    revenue: Number(row.revenueTarget),
  };
}

function targetsFromActuals(actuals: CompanyKpiActuals): CompanyKpiTargets {
  return {
    activeStudents: actuals.activeStudents,
    newSales: actuals.newSales,
    churn: actuals.churn,
    leads: actuals.leads,
    conversion: actuals.conversion,
    revenue: actuals.revenue,
  };
}

function emptyActuals(): CompanyKpiActuals {
  return {
    activeStudents: 0,
    openingActiveStudents: 0,
    newSales: 0,
    churn: 0,
    leads: 0,
    convertedLeads: 0,
    conversion: 0,
    revenue: 0,
  };
}

function normalizeMonthKey(value: string | undefined, fallback: string) {
  if (!value || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return fallback;
  const year = Number(value.slice(0, 4));
  return year >= 2020 && year <= 2100 ? value : fallback;
}

function dateFromKey(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function addUtcDays(value: Date, amount: number) {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

function addUtcMonths(value: Date, amount: number) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + amount, 1));
}

function formatMonthLabel(value: Date) {
  return new Intl.DateTimeFormat("az-AZ", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(value);
}

function toNumber(value: unknown) {
  return value === null || value === undefined ? 0 : Number(value);
}
