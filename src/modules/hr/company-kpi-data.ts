import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { getBakuDateInput } from "@/modules/students/student-reminders";
import {
  buildCompanyKpiMetrics,
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
  metrics: CompanyKpiMetric[];
  period: CompanyKpiPeriod;
  permissions: {
    canRead: boolean;
    canManage: boolean;
  };
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
  const periodEnd = addUtcMonths(periodStart, 1);
  const actualEnd = period.hasStarted
    ? period.isComplete
      ? periodEnd
      : addUtcDays(dateFromKey(todayKey), 1)
    : periodStart;

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
  const actualPromise = period.hasStarted
    ? getActuals(periodStart, actualEnd)
    : Promise.resolve(emptyActuals());
  const [targetRow, actuals] = await Promise.all([targetPromise, actualPromise]);
  const targets = targetRow
    ? {
        activeStudents: targetRow.activeStudentsTarget,
        newSales: targetRow.newSalesTarget,
        churn: targetRow.churnMaxTarget,
        leads: targetRow.leadTarget,
        conversion: Number(targetRow.conversionTarget),
        revenue: Number(targetRow.revenueTarget),
      }
    : null;

  return {
    periodMonth,
    monthLabel: formatMonthLabel(periodStart),
    targets,
    metrics: buildCompanyKpiMetrics(targets, actuals, period),
    period,
    permissions: {
      canRead: true,
      canManage: actor.permissions.has("hr.company_kpi.manage"),
    },
  };
}

async function getActuals(periodStart: Date, actualEnd: Date): Promise<CompanyKpiActuals> {
  const [row] = await getPrisma().$queryRaw<ActualRow[]>(Prisma.sql`
    select
      coalesce((
        select count(*)::int
        from erp.students s
        where s.registered_at < ${actualEnd}
          and s.is_test_data = false
          and coalesce(
            (
              select h.new_status
              from erp.student_status_history h
              where h.student_id = s.id
                and h.effective_at < ${actualEnd}
              order by h.effective_at desc, h.created_at desc
              limit 1
            ),
            s.lifecycle_status
          ) = 'ACTIVE'::"erp"."StudentLifecycleStatus"
      ), 0) as "activeStudents",
      coalesce((
        select count(*)::int
        from erp.students s
        where s.registered_at < ${periodStart}
          and s.is_test_data = false
          and coalesce(
            (
              select h.new_status
              from erp.student_status_history h
              where h.student_id = s.id
                and h.effective_at < ${periodStart}
              order by h.effective_at desc, h.created_at desc
              limit 1
            ),
            s.lifecycle_status
          ) = 'ACTIVE'::"erp"."StudentLifecycleStatus"
      ), 0) as "openingActiveStudents",
      coalesce((
        select count(*)::int
        from erp.students s
        where s.registered_at >= ${periodStart}
          and s.registered_at < ${actualEnd}
          and s.is_test_data = false
      ), 0) as "newSales",
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
              where converted.id = l.converted_student_id
                and converted.registered_at < ${actualEnd}
                and converted.is_test_data = false
            )
          )
      ), 0) as "convertedLeads",
      coalesce((
        select sum(p.amount)
        from erp.payments p
        join erp.students s on s.id = p.student_id
        where p.paid_at >= ${periodStart}
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
    metrics: [],
    period,
    permissions: { canRead: false, canManage: false },
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
