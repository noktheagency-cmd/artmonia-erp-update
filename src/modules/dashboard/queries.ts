import { Prisma } from "@/generated/prisma/client";
import { unstable_cache } from "next/cache";
import { getPrisma } from "@/server/db/prisma";
import {
  addMonths,
  formatAmount,
  formatCount,
  formatMonth,
  formatShortDate,
  startOfMonth,
  toNumber,
} from "@/modules/shared/format";
import { erpCacheTags } from "@/modules/shared/cache-tags";
import { requireErpActor } from "@/server/auth/actor";
import type { PermissionCode } from "@/server/rbac/permissions";

export type DashboardKpi = {
  label: string;
  value: string;
  delta: string;
  helper: string;
  trend: "up" | "down" | "flat";
  detail?: string;
  tone: "primary" | "light";
};

export type DashboardData = {
  filters: DashboardDateRange;
  kpis: DashboardKpi[];
  revenueBars: Array<{
    label: string;
    value: number;
    rawAmount: number;
    amount: string;
    rawExpense: number;
    expense: string;
    rawProfit: number;
    profit: string;
  }>;
  revenueStats: Array<{
    label: string;
    value: string;
    helper: string;
  }>;
  bestRevenueMonth: {
    label: string;
    amount: string;
    reason: string;
  };
  debtAging: Array<{
    label: string;
    amount: string;
    value: number;
    color: string;
  }>;
  tasks: string[];
  payoutPreview: string;
  payoutHelper: string;
  revenueForecast: string;
  revenueForecastHelper: string;
  waitingFamilies: number;
  waitingHelper: string;
  debtCenter: string;
  
  // New detailed statistics
  recentPayments: Array<{
    id: string;
    studentName: string;
    studentCode: string;
    amount: string;
    paidAt: string;
    method: string;
  }>;
  programStats: Array<{
    name: string;
    count: number;
    percentage: number;
  }>;
  teamPerformance: Array<{
    name: string;
    leads: number;
    sales: number;
    revenue: string;
    conversion: string;
    score: number;
  }>;
  conversionRate: string;
  conversionHelper: string;
  churnRate: string;
  churnCounts: {
    frozen: number;
    stopped: number;
    declined: number;
    total: number;
  };
  studentStatusCounts: Array<{
    label: string;
    count: number;
    tone: "success" | "warning" | "danger" | "info" | "neutral";
  }>;
};

export type DashboardDateRange = {
  from: string;
  to: string;
  label: string;
};

export type DashboardFilters = {
  from?: string;
  to?: string;
};

type DashboardRawRow = {
  activeStudents: unknown;
  activeMrr: unknown;
  previousActiveStudents: unknown;
  previousActiveMrr: unknown;
  periodRevenue: unknown;
  periodExpenses: unknown;
  previousPeriodRevenue: unknown;
  previousPeriodExpenses: unknown;
  debtAmount: unknown;
  revenueRows: unknown;
  expenseRows: unknown;
  taskRows: unknown;
  payoutPreview: unknown;
  waitingLeads: unknown;
  debtBuckets: unknown;
  recentPayments: unknown;
  programStats: unknown;
  totalLeadsThisMonth: unknown;
  convertedLeadsThisMonth: unknown;
  previousConvertedLeads: unknown;
  studentStatusCounts: unknown;
  teamPerformance: unknown;
};

type DashboardRevenueRawRow = {
  paymentMonth: string;
  amount: unknown;
};

type DashboardExpenseRawRow = {
  expenseMonth: string;
  amount: unknown;
};

type DashboardTaskRawRow = {
  title: string;
};

type DashboardDebtBucketRawRow = {
  label: string;
  amount: unknown;
};

type RawPaymentRow = {
  id: string;
  studentName: string;
  studentCode: string;
  amount: unknown;
  paidAt: string;
  method: string;
};

type RawProgramStat = {
  name: string;
  count: unknown;
};

type RawStudentStatusCount = {
  status: string;
  count: unknown;
};

type RawTeamPerformance = {
  name: string;
  leads: unknown;
  sales: unknown;
  revenue: unknown;
};

const agingBuckets = [
  { label: "0-3 gün", min: 0, max: 3, color: "#3158ff" },
  { label: "4-7 gün", min: 4, max: 7, color: "#fbbf24" },
  { label: "8-14 gün", min: 8, max: 14, color: "#f97316" },
  { label: "15+ gün", min: 15, max: Number.POSITIVE_INFINITY, color: "#f43f5e" },
] as const;

export async function getOwnerDashboardData(filters: DashboardFilters = {}): Promise<DashboardData> {
  const actor = await requireErpActor();
  const dashboardPermissions: PermissionCode[] = ["dashboard.owner.read", "dashboard.sales.read", "dashboard.finance.read", "dashboard.teacher.read"];
  if (!dashboardPermissions.some((code) => actor.permissions.has(code))) {
    throw new Error("Missing permission: dashboard.read");
  }
  const prisma = getPrisma();
  const dateRange = resolveDashboardDateRange(filters);
  const today = dateRange.toDate;
  const cachedToday = getCacheTimeBucket(today);
  const periodStart = dateRange.fromDate;
  const periodEndExclusive = addUtcDays(dateRange.toDate, 1);
  const previousPeriodStart = shiftUtcMonthClamped(dateRange.fromDate, -1);
  const previousPeriodEndExclusive = addUtcDays(shiftUtcMonthClamped(dateRange.toDate, -1), 1);
  const selectedMonthStart = startOfMonth(today);
  const firstRevenueMonth = addMonths(selectedMonthStart, -11);
  const nextRevenueMonth = addMonths(selectedMonthStart, 1);
  
  const fetchDashboardRawData = async () =>
    prisma.$queryRaw<DashboardRawRow[]>(Prisma.sql`
    select
      coalesce((
        select count(*)::int
        from erp.students s
        where s.lifecycle_status = 'ACTIVE'::"erp"."StudentLifecycleStatus"
      ), 0) as "activeStudents",
      coalesce((
        select sum(e.monthly_fee)
        from erp.enrollments e
        join erp.students s on s.id = e.student_id
        where e.status = 'ACTIVE'::"erp"."EnrollmentStatus"
          and s.lifecycle_status = 'ACTIVE'::"erp"."StudentLifecycleStatus"
      ), 0) as "activeMrr",
      coalesce((
        select count(*)::int
        from erp.students s
        where s.registered_at < ${previousPeriodEndExclusive}
          and coalesce(
            (
              select h.new_status
              from erp.student_status_history h
              where h.student_id = s.id
                and h.effective_at < ${previousPeriodEndExclusive}
              order by h.effective_at desc, h.created_at desc
              limit 1
            ),
            s.lifecycle_status
          ) = 'ACTIVE'::"erp"."StudentLifecycleStatus"
      ), 0) as "previousActiveStudents",
      coalesce((
        select sum(e.monthly_fee)
        from erp.enrollments e
        join erp.students s on s.id = e.student_id
        where e.start_date < ${previousPeriodEndExclusive}
          and e.status = 'ACTIVE'::"erp"."EnrollmentStatus"
          and coalesce(
            (
              select h.new_status
              from erp.student_status_history h
              where h.student_id = s.id
                and h.effective_at < ${previousPeriodEndExclusive}
              order by h.effective_at desc, h.created_at desc
              limit 1
            ),
            s.lifecycle_status
          ) = 'ACTIVE'::"erp"."StudentLifecycleStatus"
      ), 0) as "previousActiveMrr",
      coalesce((
        select sum(p.amount)
        from erp.payments p
        where p.paid_at >= ${periodStart}
          and p.paid_at < ${periodEndExclusive}
      ), 0) as "periodRevenue",
      coalesce((
        select sum(fe.amount)
        from erp.finance_expenses fe
        where fe.expense_date >= ${periodStart}
          and fe.expense_date < ${periodEndExclusive}
      ), 0) as "periodExpenses",
      coalesce((
        select sum(p.amount)
        from erp.payments p
        where p.paid_at >= ${previousPeriodStart}
          and p.paid_at < ${previousPeriodEndExclusive}
      ), 0) as "previousPeriodRevenue",
      coalesce((
        select sum(fe.amount)
        from erp.finance_expenses fe
        where fe.expense_date >= ${previousPeriodStart}
          and fe.expense_date < ${previousPeriodEndExclusive}
      ), 0) as "previousPeriodExpenses",
      coalesce((
        select sum(i.balance_due)
        from erp.invoices i
        where i.balance_due > 0
          and i.status <> 'VOID'::"erp"."InvoiceStatus"
      ), 0) as "debtAmount",
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'paymentMonth', revenue.payment_month,
            'amount', revenue.amount
          )
          order by revenue.payment_month asc
        )
        from (
          select p.payment_month, sum(p.amount) as amount
          from erp.payments p
          where p.payment_month >= ${firstRevenueMonth}
            and p.payment_month < ${nextRevenueMonth}
          group by p.payment_month
        ) revenue
      ), '[]'::jsonb) as "revenueRows",
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'expenseMonth', expense.expense_month,
            'amount', expense.amount
          )
          order by expense.expense_month asc
        )
        from (
          select date_trunc('month', fe.expense_date)::date as expense_month, sum(fe.amount) as amount
          from erp.finance_expenses fe
          where fe.expense_date >= ${firstRevenueMonth}
            and fe.expense_date < ${nextRevenueMonth}
          group by date_trunc('month', fe.expense_date)::date
        ) expense
      ), '[]'::jsonb) as "expenseRows",
      coalesce((
        select jsonb_agg(
          jsonb_build_object('title', task_rows.title)
          order by task_rows.due_at asc nulls last, task_rows.created_at asc
        )
        from (
          select t.title, t.due_at, t.created_at
          from erp.tasks t
          where t.status in (
            'OPEN'::"erp"."TaskStatus",
            'IN_PROGRESS'::"erp"."TaskStatus"
          )
          and (
            t.due_at is null
            or (
              t.due_at >= ${periodStart}
              and t.due_at < ${periodEndExclusive}
            )
          )
          order by t.due_at asc nulls last, t.created_at asc
          limit 4
        ) task_rows
      ), '[]'::jsonb) as "taskRows",
      coalesce((
        select sum(tp.payout_amount)
        from erp.teacher_payouts tp
        where tp.period_month >= ${periodStart}
          and tp.period_month < ${periodEndExclusive}
          and tp.status in (
            'DRAFT'::"erp"."ApprovalStatus",
            'REQUESTED'::"erp"."ApprovalStatus",
            'FINANCE_APPROVED'::"erp"."ApprovalStatus",
            'OWNER_APPROVED'::"erp"."ApprovalStatus",
            'APPROVED'::"erp"."ApprovalStatus"
          )
      ), 0) as "payoutPreview",
      coalesce((
        select count(*)::int
        from erp.leads l
        where l.stage in (
            'NEW'::"erp"."LeadStage",
            'CONTACTED'::"erp"."LeadStage",
            'QUALIFIED'::"erp"."LeadStage",
            'TRIAL_CONSULTATION'::"erp"."LeadStage",
            'NURTURE'::"erp"."LeadStage"
          )
          and (l.next_follow_up_at is null or (
            l.next_follow_up_at >= ${periodStart}
            and l.next_follow_up_at < ${periodEndExclusive}
          ))
      ), 0) as "waitingLeads",
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'label', bucket.label,
            'amount', bucket_amount.amount
          )
          order by bucket.sort_order asc
        )
        from (
          values
            ('0-3 gün', 0, 3, 1),
            ('4-7 gün', 4, 7, 2),
            ('8-14 gün', 8, 14, 3),
            ('15+ gün', 15, null, 4)
        ) bucket(label, min_days, max_days, sort_order)
        left join lateral (
          select coalesce(sum(open_invoice.balance_due), 0) as amount
          from (
            select
              i.balance_due,
              greatest(
                0,
                floor(
                  extract(epoch from (${cachedToday}::timestamp - i.due_date::timestamp))
                  / 86400
                )::int
              ) as age_days
            from erp.invoices i
            where i.balance_due > 0
              and i.status <> 'VOID'::"erp"."InvoiceStatus"
          ) open_invoice
          where open_invoice.age_days >= bucket.min_days
            and (
              bucket.max_days is null
              or open_invoice.age_days <= bucket.max_days
            )
        ) bucket_amount on true
      ), '[]'::jsonb) as "debtBuckets",
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', p.id,
            'studentName', c.full_name,
            'studentCode', s.code,
            'amount', p.amount,
            'paidAt', p.paid_at,
            'method', p.method
          )
        )
        from (
          select p2.id, p2.amount, p2.paid_at, p2.method, p2.student_id, p2.created_at
          from erp.payments p2
          order by p2.created_at desc
          limit 5
        ) p
        join erp.students s on s.id = p.student_id
        join erp.contacts c on c.id = s.contact_id
      ), '[]'::jsonb) as "recentPayments",
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'name', program_counts.name,
            'count', program_counts.count
          )
        )
        from (
          select pr.name, count(*)::int as count
          from erp.enrollments e
          join erp.programs pr on pr.id = e.program_id
          join erp.students s on s.id = e.student_id
          where e.status = 'ACTIVE'::"erp"."EnrollmentStatus"
            and s.lifecycle_status = 'ACTIVE'::"erp"."StudentLifecycleStatus"
          group by pr.name
          order by count desc
          limit 4
        ) program_counts
      ), '[]'::jsonb) as "programStats",
      coalesce((
        select count(*)::int
        from erp.leads l
        where l.created_at >= ${periodStart}
          and l.created_at < ${periodEndExclusive}
      ), 0) as "totalLeadsThisMonth",
      coalesce((
        select count(*)::int
        from erp.leads l
        where l.created_at >= ${periodStart}
          and l.created_at < ${periodEndExclusive}
          and (l.converted_student_id is not null or l.stage = 'REGISTERED'::"erp"."LeadStage")
      ), 0) as "convertedLeadsThisMonth",
      coalesce((
        select count(*)::int
        from erp.leads l
        where l.created_at >= ${previousPeriodStart}
          and l.created_at < ${previousPeriodEndExclusive}
          and (l.converted_student_id is not null or l.stage = 'REGISTERED'::"erp"."LeadStage")
      ), 0) as "previousConvertedLeads",
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'status', status_counts.status,
            'count', status_counts.count
          )
        )
        from (
          select s2.lifecycle_status as status, count(*)::int as count
          from erp.students s2
          group by s2.lifecycle_status
        ) status_counts
      ), '[]'::jsonb) as "studentStatusCounts",
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'name', team_rows.name,
            'leads', team_rows.leads,
            'sales', team_rows.sales,
            'revenue', team_rows.revenue
          )
          order by team_rows.sales desc, team_rows.revenue desc, team_rows.leads desc
        )
        from (
          select
            coalesce(u.full_name, 'Menecer təyin edilməyib') as name,
            count(distinct l.id)::int as leads,
            count(distinct l.id) filter (
              where l.converted_student_id is not null
                or l.stage = 'REGISTERED'::"erp"."LeadStage"
            )::int as sales,
            coalesce(sum(p.amount), 0) as revenue
          from erp.leads l
          left join erp.users u on u.id = l.manager_id
          left join erp.payments p
            on p.student_id = l.converted_student_id
            and p.paid_at >= ${periodStart}
            and p.paid_at < ${periodEndExclusive}
          where l.created_at >= ${periodStart}
            and l.created_at < ${periodEndExclusive}
          group by coalesce(u.full_name, 'Menecer təyin edilməyib')
          limit 5
        ) team_rows
      ), '[]'::jsonb) as "teamPerformance"
  `);
  const getDashboardRawData = unstable_cache(
    fetchDashboardRawData,
    [
      "owner-dashboard-data",
      firstRevenueMonth.toISOString(),
      nextRevenueMonth.toISOString(),
      periodStart.toISOString(),
      periodEndExclusive.toISOString(),
      previousPeriodStart.toISOString(),
      previousPeriodEndExclusive.toISOString(),
      cachedToday.toISOString(),
    ],
    {
      revalidate: 30,
      tags: [erpCacheTags.dashboard],
    }
  );
  let rows: DashboardRawRow[];

  try {
    rows = await getDashboardRawData();
  } catch (error) {
    if (!isMissingIncrementalCacheError(error)) {
      throw error;
    }

    rows = await fetchDashboardRawData();
  }

  const [row] = rows;

  const revenueRows = asJsonArray<DashboardRevenueRawRow>(row?.revenueRows);
  const expenseRows = asJsonArray<DashboardExpenseRawRow>(row?.expenseRows);
  const taskRows = asJsonArray<DashboardTaskRawRow>(row?.taskRows);
  const debtBucketRows = asJsonArray<DashboardDebtBucketRawRow>(row?.debtBuckets);
  const recentPaymentRows = asJsonArray<RawPaymentRow>(row?.recentPayments);
  const rawProgramStats = asJsonArray<RawProgramStat>(row?.programStats);
  const rawStatusCounts = asJsonArray<RawStudentStatusCount>(row?.studentStatusCounts);
  const rawTeamPerformance = asJsonArray<RawTeamPerformance>(row?.teamPerformance);

  const revenueByMonth = new Map(
    revenueRows.map((item) => [
      new Date(item.paymentMonth).toISOString().slice(0, 7),
      toNumber(item.amount),
    ])
  );
  const expenseByMonth = new Map(
    expenseRows.map((item) => [
      new Date(item.expenseMonth).toISOString().slice(0, 7),
      toNumber(item.amount),
    ])
  );
  
  const revenueAmounts = Array.from({ length: 12 }, (_, index) => {
    const month = addMonths(firstRevenueMonth, index);
    const key = month.toISOString().slice(0, 7);

    return {
      month,
      amount: revenueByMonth.get(key) ?? 0,
      expense: expenseByMonth.get(key) ?? 0,
    };
  });
  
  const maxRevenue = Math.max(...revenueAmounts.map((item) => item.amount), 1);
  const totalRevenuePeriod = revenueAmounts.reduce((sum, item) => sum + item.amount, 0);
  const averageMonthlyRevenue = totalRevenuePeriod / revenueAmounts.length;
  const currentMonthRevenue = revenueAmounts.at(-1)?.amount ?? 0;
  const bestRevenue = revenueAmounts.reduce(
    (best, item) => (item.amount > best.amount ? item : best),
    revenueAmounts[0] ?? { month: selectedMonthStart, amount: 0 }
  );
  const bestRevenueIndex = revenueAmounts.findIndex(
    (item) => item.month.getTime() === bestRevenue.month.getTime()
  );
  const previousBestRevenue = bestRevenueIndex > 0 ? revenueAmounts[bestRevenueIndex - 1]?.amount ?? 0 : 0;
  const bestRevenueLift = bestRevenue.amount - previousBestRevenue;
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const daysElapsed = Math.max(1, todayUtc.getUTCDate());
  const daysInMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0)).getUTCDate();
  const forecastAmount = Math.round((currentMonthRevenue / daysElapsed) * daysInMonth);
  
  const debtByBucket = agingBuckets.map((bucket) => {
    const rawBucket = debtBucketRows.find((item) => item.label === bucket.label);

    return {
      label: bucket.label,
      value: toNumber(rawBucket?.amount),
      color: bucket.color,
    };
  });
  
  const activeStudents = toNumber(row?.activeStudents);
  const activeMrr = toNumber(row?.activeMrr);
  const previousActiveStudents = toNumber(row?.previousActiveStudents);
  const previousActiveMrr = toNumber(row?.previousActiveMrr);
  const periodRevenue = toNumber(row?.periodRevenue);
  const periodExpenses = toNumber(row?.periodExpenses);
  const previousPeriodRevenue = toNumber(row?.previousPeriodRevenue);
  const previousPeriodExpenses = toNumber(row?.previousPeriodExpenses);
  const netProfit = periodRevenue - periodExpenses;
  const previousNetProfit = previousPeriodRevenue - previousPeriodExpenses;
  const netProfitMargin = periodRevenue !== 0 ? (netProfit / periodRevenue) * 100 : 0;
  const totalDebt = toNumber(row?.debtAmount);
  const payoutPreview = toNumber(row?.payoutPreview);
  const waitingLeads = toNumber(row?.waitingLeads);
  const totalAging = debtByBucket.reduce((sum, bucket) => sum + bucket.value, 0);

  const totalLeadsThisMonth = toNumber(row?.totalLeadsThisMonth);
  const convertedLeadsThisMonth = toNumber(row?.convertedLeadsThisMonth);
  const previousConvertedLeads = toNumber(row?.previousConvertedLeads);
  const conversionRate = totalLeadsThisMonth > 0 
    ? `${Math.round((convertedLeadsThisMonth / totalLeadsThisMonth) * 100)}%`
    : "0%";
  const churnByStatus = new Map(rawStatusCounts.map((item) => [item.status, toNumber(item.count)]));
  const frozenStudents = churnByStatus.get("FROZEN") ?? 0;
  const stoppedStudents = churnByStatus.get("STOPPED") ?? 0;
  const declinedStudents = churnByStatus.get("DECLINED") ?? 0;
  const totalStudents = rawStatusCounts.reduce((sum, item) => sum + toNumber(item.count), 0);
  const totalChurn = frozenStudents + stoppedStudents + declinedStudents;
  const churnRate = totalStudents > 0 ? `${Math.round((totalChurn / totalStudents) * 100)}%` : "0%";

  const recentPayments = recentPaymentRows.map((item) => ({
    id: item.id,
    studentName: item.studentName,
    studentCode: item.studentCode,
    amount: formatAmount(item.amount),
    paidAt: formatShortDate(item.paidAt),
    method: formatPaymentMethod(item.method),
  }));

  const totalProgramStudents = rawProgramStats.reduce(
    (sum, item) => sum + toNumber(item.count),
    0
  );
  const programStats = rawProgramStats.map((item) => {
    const count = toNumber(item.count);
    return {
      name: item.name,
      count,
      percentage: totalProgramStudents > 0 ? Math.round((count / totalProgramStudents) * 100) : 0,
    };
  });

  const studentStatusCounts = rawStatusCounts.map((item) => {
    const { label, tone } = mapLifecycleStatus(item.status);
    return {
      label,
      count: toNumber(item.count),
      tone,
    };
  }).sort((a, b) => b.count - a.count);

  const teamPerformance = rawTeamPerformance.map((item) => {
    const leads = toNumber(item.leads);
    const sales = toNumber(item.sales);
    const conversion = leads > 0 ? Math.round((sales / leads) * 100) : 0;

    return {
      name: item.name,
      leads,
      sales,
      revenue: formatAmount(item.revenue),
      conversion: `${conversion}%`,
      score: Math.min(100, Math.max(8, conversion)),
    };
  });

  const activeStudentsTrend = calculateKpiTrend(activeStudents, previousActiveStudents);
  const activeMrrTrend = calculateKpiTrend(activeMrr, previousActiveMrr);
  const netProfitTrend = calculateKpiTrend(netProfit, previousNetProfit);
  const salesTrend = calculateKpiTrend(convertedLeadsThisMonth, previousConvertedLeads);

  return {
    filters: {
      from: dateRange.from,
      to: dateRange.to,
      label: dateRange.label,
    },
    kpis: [
      {
        label: "Aktiv tələbə",
        value: formatCount(activeStudents),
        delta: activeStudentsTrend.delta,
        helper: "Ötən aya nisbətən",
        trend: activeStudentsTrend.direction,
        tone: "primary",
      },
      {
        label: "Aylıq dövriyyə (MRR)",
        value: formatAmount(activeMrr),
        delta: activeMrrTrend.delta,
        helper: "Ötən aya nisbətən",
        trend: activeMrrTrend.direction,
        tone: "light",
      },
      {
        label: "Net Profit",
        value: formatAmount(netProfit),
        delta: netProfitTrend.delta,
        helper: "Ötən aya nisbətən",
        trend: netProfitTrend.direction,
        detail: `${formatPercentage(netProfitMargin)} xalis mənfəət marjası`,
        tone: "light",
      },
      {
        label: "Satış sayı",
        value: formatCount(convertedLeadsThisMonth),
        delta: salesTrend.delta,
        helper: "Ötən aya nisbətən",
        trend: salesTrend.direction,
        tone: "light",
      },
    ],
    revenueBars: revenueAmounts.map((item) => ({
      label: formatMonth(item.month),
      value: Math.max(8, Math.round((item.amount / maxRevenue) * 100)),
      rawAmount: item.amount,
      amount: formatAmount(item.amount),
      rawExpense: item.expense,
      expense: formatAmount(item.expense),
      rawProfit: item.amount - item.expense,
      profit: formatAmount(item.amount - item.expense),
    })),
    revenueStats: [
      {
        label: "İllik gəlir dinamikası",
        value: formatAmount(totalRevenuePeriod),
        helper: "İllik ümumi dövriyyə",
      },
      {
        label: "Aylıq orta göstərici",
        value: formatAmount(averageMonthlyRevenue),
        helper: "Son 12 ay üzrə orta dövriyyə",
      },
    ],
    bestRevenueMonth: {
      label: formatMonth(bestRevenue.month),
      amount: formatAmount(bestRevenue.amount),
      reason:
        bestRevenueLift > 0
          ? `Əvvəlki aya nisbətən ${formatAmount(bestRevenueLift)} daha çox ödəniş daxil olub.`
          : "Bu ay seçilən dövrdə ən yüksək ödəniş həcminə sahibdir.",
    },
    debtAging: debtByBucket.map((item) => ({
      label: item.label,
      amount: formatAmount(item.value),
      value: totalAging > 0 ? Math.round((item.value / totalAging) * 100) : 0,
      color: item.color,
    })),
    tasks: taskRows.map((task) => task.title),
    payoutPreview: formatAmount(payoutPreview),
    revenueForecast: formatAmount(forecastAmount),
    revenueForecastHelper: `Cari temp qorunsa, ay sonuna qədər təxminən ${formatAmount(
      Math.max(0, forecastAmount - currentMonthRevenue)
    )} əlavə gəlir gözlənilir.`,
    payoutHelper: "Müəllimlərin cari ay üzrə hesablanmış maaşı.",
    waitingFamilies: waitingLeads,
    waitingHelper: "Növbəti əlaqə tarixi gəlmiş və ya yeni müraciətlər.",
    debtCenter: formatAmount(totalDebt),
    recentPayments,
    programStats,
    teamPerformance,
    conversionRate,
    conversionHelper: `${convertedLeadsThisMonth} satış / ${totalLeadsThisMonth} müraciət`,
    churnRate,
    churnCounts: {
      frozen: frozenStudents,
      stopped: stoppedStudents,
      declined: declinedStudents,
      total: totalChurn,
    },
    studentStatusCounts,
  };
}

function formatPaymentMethod(method: string) {
  switch (method) {
    case "CASH":
      return "Nağd";
    case "CARD":
      return "Kart";
    case "BANK_TRANSFER":
      return "Bank köç.";
    case "ONLINE":
      return "Onlayn";
    default:
      return "Digər";
  }
}

function mapLifecycleStatus(status: string): { label: string; tone: "success" | "warning" | "danger" | "info" | "neutral" } {
  switch (status) {
    case "ACTIVE":
      return { label: "Aktiv", tone: "success" };
    case "GROUP_WAITING":
      return { label: "Qrup gözləyir", tone: "info" };
    case "DEBT":
      return { label: "Borclu", tone: "danger" };
    case "FROZEN":
      return { label: "Dondurulub", tone: "warning" };
    case "STOPPED":
      return { label: "Dayandırılıb", tone: "neutral" };
    case "DECLINED":
      return { label: "İmtina edib", tone: "danger" };
    case "COMPLETED":
      return { label: "Məzun", tone: "neutral" };
    default:
      return { label: status, tone: "neutral" };
  }
}

function getCacheTimeBucket(value: Date) {
  const bucketMs = 30_000;
  return new Date(Math.floor(value.getTime() / bucketMs) * bucketMs);
}

function calculateKpiTrend(current: number, previous: number) {
  const direction = current > previous ? "up" : current < previous ? "down" : "flat";
  const change = previous === 0
    ? (current === 0 ? 0 : 100)
    : Math.abs(((current - previous) / Math.abs(previous)) * 100);
  const prefix = direction === "up" ? "+" : direction === "down" ? "−" : "";

  return {
    direction,
    delta: `${prefix}${formatPercentage(change)}`,
  } as const;
}

function formatPercentage(value: number) {
  return `${new Intl.NumberFormat("az-AZ", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(value)}%`;
}

function resolveDashboardDateRange(filters: DashboardFilters) {
  const today = startOfUtcDay(new Date());
  const defaultFrom = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const parsedFrom = parseDateInput(filters.from) ?? defaultFrom;
  const parsedTo = parseDateInput(filters.to) ?? today;
  const fromDate = parsedFrom <= parsedTo ? parsedFrom : parsedTo;
  const toDate = parsedFrom <= parsedTo ? parsedTo : parsedFrom;
  const from = toDateInput(fromDate);
  const to = toDateInput(toDate);
  const label = buildDateRangeLabel(fromDate, toDate, today);

  return {
    from,
    to,
    label,
    fromDate,
    toDate,
  };
}

function parseDateInput(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return null;
  }

  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return parsed;
}

function buildDateRangeLabel(from: Date, to: Date, today: Date) {
  const currentMonthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const previousMonthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
  const previousMonthEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
  const last30Start = addUtcDays(today, -29);

  if (sameUtcDay(from, today) && sameUtcDay(to, today)) {
    return "Bu gün";
  }

  if (sameUtcDay(from, currentMonthStart) && sameUtcDay(to, today)) {
    return "Bu ay";
  }

  if (sameUtcDay(from, last30Start) && sameUtcDay(to, today)) {
    return "Son 30 gün";
  }

  if (sameUtcDay(from, previousMonthStart) && sameUtcDay(to, previousMonthEnd)) {
    return "Keçən ay";
  }

  return `${formatDateLabel(from)} - ${formatDateLabel(to)}`;
}

function startOfUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function addUtcDays(value: Date, days: number) {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function shiftUtcMonthClamped(value: Date, amount: number) {
  const targetMonth = value.getUTCMonth() + amount;
  const targetMonthStart = new Date(Date.UTC(value.getUTCFullYear(), targetMonth, 1));
  const targetMonthEnd = new Date(Date.UTC(
    targetMonthStart.getUTCFullYear(),
    targetMonthStart.getUTCMonth() + 1,
    0
  ));

  return new Date(Date.UTC(
    targetMonthStart.getUTCFullYear(),
    targetMonthStart.getUTCMonth(),
    Math.min(value.getUTCDate(), targetMonthEnd.getUTCDate())
  ));
}

function sameUtcDay(left: Date, right: Date) {
  return toDateInput(left) === toDateInput(right);
}

function toDateInput(value: Date) {
  return [
    value.getUTCFullYear().toString(),
    (value.getUTCMonth() + 1).toString().padStart(2, "0"),
    value.getUTCDate().toString().padStart(2, "0"),
  ].join("-");
}

function formatDateLabel(value: Date) {
  const day = value.getUTCDate().toString().padStart(2, "0");
  const month = (value.getUTCMonth() + 1).toString().padStart(2, "0");
  const year = value.getUTCFullYear();

  return `${day}.${month}.${year}`;
}

function isMissingIncrementalCacheError(error: unknown) {
  return error instanceof Error && error.message.includes("incrementalCache missing");
}

function asJsonArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }

  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }

  return [];
}
