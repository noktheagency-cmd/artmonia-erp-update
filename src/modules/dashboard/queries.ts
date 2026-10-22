import {
  activeStudentsAsOfSql,
  currentActiveStudentsSql,
} from "@/modules/students/active-students-metrics-sql";
import { companySalesCountSql } from "@/modules/students/sales-metrics-sql";
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
import { scopeFor, type PermissionCode } from "@/server/rbac/permissions";
import { retentionCtes, retentionScope, retentionSummarySql } from "@/modules/students/retention-analytics-sql";
import { retentionRate } from "@/modules/students/retention-analytics";
import { todayInBaku } from "@/modules/groups/shared";
import { TASK_WORKSPACE_EXCLUDED_TYPES } from "@/modules/tasks/task-scope";
import { canAdministerTasks } from "@/modules/tasks/task-permissions";

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
  salesCount: number;
  totalLeadCount: number;
  churnRate: string;
  churnCounts: {
    frozen: number;
    stopped: number;
    total: number;
    population: number;
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
  periodRevenue: unknown;
  periodStudentRevenue: unknown;
  periodWorkshopRevenue: unknown;
  periodExpenses: unknown;
  periodOperatingExpenses: unknown;
  periodWorkshopExpenses: unknown;
  previousPeriodRevenue: unknown;
  previousPeriodExpenses: unknown;
  debtAmount: unknown;
  debtStudentCount: unknown;
  revenueRows: unknown;
  expenseRows: unknown;
  taskRows: unknown;
  payoutPreview: unknown;
  waitingLeads: unknown;
  debtBuckets: unknown;
  recentPayments: unknown;
  programStats: unknown;
  totalLeadsThisMonth: unknown;
  companySalesCount: unknown;
  studentStatusCounts: unknown;
  retention: { population: number; frozen: number; stopped: number; total: number };
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
  const canViewAllTasks = await canAdministerTasks(actor);
  
  const fetchDashboardRawData = async () =>
    prisma.$queryRaw<DashboardRawRow[]>(Prisma.sql`
    select
      (${retentionCtes(dateRange.from, dateRange.to, retentionScope(actor))}
        select jsonb_build_object('population', r.population, 'frozen', r.frozen, 'stopped', r.stopped, 'total', r.total)
        from (select ${retentionSummarySql}) r
      ) as retention,
      coalesce(${currentActiveStudentsSql()}, 0) as "activeStudents",
      coalesce((
        select sum(e.monthly_fee)
        from erp.enrollments e
        join erp.students s on s.id = e.student_id
        where e.status = 'ACTIVE'::"erp"."EnrollmentStatus"
          and s.lifecycle_status = 'ACTIVE'::"erp"."StudentLifecycleStatus"
          and s.is_test_data = false
      ), 0) as "activeMrr",
      coalesce(${activeStudentsAsOfSql(Prisma.sql`${previousPeriodEndExclusive}`)}, 0) as "previousActiveStudents",
      coalesce((
        select sum(p.amount)
        from erp.payments p
        join erp.students s on s.id = p.student_id
        where p.paid_at >= ${periodStart}
          and p.paid_at < ${periodEndExclusive}
          and s.is_test_data = false
      ), 0) + coalesce((
        select sum(wp.amount)
        from erp.workshop_payments wp
        where wp.paid_at >= ${periodStart}
          and wp.paid_at < ${periodEndExclusive}
          and wp.voided_at is null
      ), 0) as "periodRevenue",
      coalesce((
        select sum(p.amount)
        from erp.payments p
        join erp.students s on s.id = p.student_id
        where p.paid_at >= ${periodStart}
          and p.paid_at < ${periodEndExclusive}
          and s.is_test_data = false
      ), 0) as "periodStudentRevenue",
      coalesce((
        select sum(wp.amount)
        from erp.workshop_payments wp
        where wp.paid_at >= ${periodStart}
          and wp.paid_at < ${periodEndExclusive}
          and wp.voided_at is null
      ), 0) as "periodWorkshopRevenue",
      coalesce((
        select sum(fe.amount)
        from erp.finance_expenses fe
        where fe.expense_date >= ${periodStart}
          and fe.expense_date < ${periodEndExclusive}
          and fe.voided_at is null
          and fe.financial_class in ('DIRECT_COST'::"erp"."FinanceFinancialClass", 'OPEX'::"erp"."FinanceFinancialClass")
      ), 0) as "periodExpenses",
      coalesce((
        select sum(fe.amount)
        from erp.finance_expenses fe
        where fe.expense_date >= ${periodStart}
          and fe.expense_date < ${periodEndExclusive}
          and fe.voided_at is null
          and fe.workshop_event_id is null
          and fe.financial_class in ('DIRECT_COST'::"erp"."FinanceFinancialClass", 'OPEX'::"erp"."FinanceFinancialClass")
      ), 0) as "periodOperatingExpenses",
      coalesce((
        select sum(fe.amount)
        from erp.finance_expenses fe
        where fe.expense_date >= ${periodStart}
          and fe.expense_date < ${periodEndExclusive}
          and fe.voided_at is null
          and fe.workshop_event_id is not null
          and fe.financial_class in ('DIRECT_COST'::"erp"."FinanceFinancialClass", 'OPEX'::"erp"."FinanceFinancialClass")
      ), 0) as "periodWorkshopExpenses",
      coalesce((
        select sum(p.amount)
        from erp.payments p
        join erp.students s on s.id = p.student_id
        where p.paid_at >= ${previousPeriodStart}
          and p.paid_at < ${previousPeriodEndExclusive}
          and s.is_test_data = false
      ), 0) + coalesce((
        select sum(wp.amount)
        from erp.workshop_payments wp
        where wp.paid_at >= ${previousPeriodStart}
          and wp.paid_at < ${previousPeriodEndExclusive}
          and wp.voided_at is null
      ), 0) as "previousPeriodRevenue",
      coalesce((
        select sum(fe.amount)
        from erp.finance_expenses fe
        where fe.expense_date >= ${previousPeriodStart}
          and fe.expense_date < ${previousPeriodEndExclusive}
          and fe.voided_at is null
          and fe.financial_class in ('DIRECT_COST'::"erp"."FinanceFinancialClass", 'OPEX'::"erp"."FinanceFinancialClass")
      ), 0) as "previousPeriodExpenses",
      coalesce((
        select sum(i.balance_due)
        from erp.invoices i
        join erp.students s on s.id = i.student_id
        where i.balance_due > 0
          and i.status <> 'VOID'::"erp"."InvoiceStatus"
          and i.due_date <= ${cachedToday}::date
          and s.is_test_data = false
          and s.lifecycle_status = 'ACTIVE'::"erp"."StudentLifecycleStatus"
      ), 0) as "debtAmount",
      coalesce((
        select count(distinct i.student_id)::int
        from erp.invoices i
        join erp.students s on s.id = i.student_id
        where i.balance_due > 0
          and i.status <> 'VOID'::"erp"."InvoiceStatus"
          and i.due_date <= ${cachedToday}::date
          and s.is_test_data = false
          and s.lifecycle_status = 'ACTIVE'::"erp"."StudentLifecycleStatus"
      ), 0) as "debtStudentCount",
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'paymentMonth', revenue.payment_month,
            'amount', revenue.amount
          )
          order by revenue.payment_month asc
        )
        from (
          select income.payment_month, sum(income.amount) as amount
          from (
            select date_trunc('month', p.paid_at)::date as payment_month, p.amount
            from erp.payments p
            join erp.students s on s.id = p.student_id
            where p.paid_at >= ${firstRevenueMonth}
              and p.paid_at < ${nextRevenueMonth}
              and s.is_test_data = false
            union all
            select date_trunc('month', wp.paid_at)::date as payment_month, wp.amount
            from erp.workshop_payments wp
            where wp.paid_at >= ${firstRevenueMonth}
              and wp.paid_at < ${nextRevenueMonth}
              and wp.voided_at is null
          ) income
          group by income.payment_month
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
            and fe.voided_at is null
            and fe.financial_class in ('DIRECT_COST'::"erp"."FinanceFinancialClass", 'OPEX'::"erp"."FinanceFinancialClass")
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
          and t.type not in (${Prisma.join([...TASK_WORKSPACE_EXCLUDED_TYPES])})
          and (${canViewAllTasks} or t.owner_user_id = ${actor.id}::uuid)
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
        where l.converted_student_id is null
          and l.stage in (
            'NEW'::"erp"."LeadStage",
            'CONTACTED'::"erp"."LeadStage",
            'QUALIFIED'::"erp"."LeadStage",
            'TRIAL_LESSON'::"erp"."LeadStage",
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
            join erp.students s on s.id = i.student_id
            where i.balance_due > 0
              and i.status <> 'VOID'::"erp"."InvoiceStatus"
              and i.due_date <= ${cachedToday}::date
              and s.is_test_data = false
              and s.lifecycle_status = 'ACTIVE'::"erp"."StudentLifecycleStatus"
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
        where s.is_test_data = false
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
            and s.is_test_data = false
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
      ${companySalesCountSql(Prisma.sql`${periodStart}`, Prisma.sql`${periodEndExclusive}`)} as "companySalesCount",
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
          where s2.is_test_data = false
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
            coalesce(lead_stats.leads, 0)::int as leads,
            coalesce(sale_stats.sales, 0)::int as sales,
            coalesce(sale_stats.revenue, 0) as revenue
          from erp.users u
          left join lateral (
            select count(*)::int as leads
            from erp.leads l
            where l.manager_id = u.id
              and l.created_at >= ${periodStart}
              and l.created_at < ${periodEndExclusive}
          ) lead_stats on true
          left join lateral (
            select
              count(*)::int as sales,
              coalesce(sum(p.amount), 0) as revenue
            from erp.course_sales cs
            join erp.students s on s.id = cs.student_id
            left join erp.payments p
              on p.course_sale_id = cs.id
              and p.refunded_at is null
            where cs.owner_id = u.id
              and s.is_test_data = false
              and cs.cancelled_at is null
              and cs.qualified_at >= ${periodStart}::date
              and cs.qualified_at < ${periodEndExclusive}::date
              and cs.qualified_at <= (now() at time zone 'Asia/Baku')::date
          ) sale_stats on true
          where u.is_active = true
            and (coalesce(lead_stats.leads, 0) > 0 or coalesce(sale_stats.sales, 0) > 0)
          order by coalesce(sale_stats.sales, 0) desc, coalesce(sale_stats.revenue, 0) desc, coalesce(lead_stats.leads, 0) desc
          limit 5
        ) team_rows
      ), '[]'::jsonb) as "teamPerformance"
  `);
  const getDashboardRawData = unstable_cache(
    fetchDashboardRawData,
    [
      "owner-dashboard-data",
      "period-retention-sales-v4",
      actor.id,
      scopeFor(actor.permissions, "student.read") ?? "none",
      scopeFor(actor.permissions, "attendance.read") ?? "none",
      firstRevenueMonth.toISOString(),
      nextRevenueMonth.toISOString(),
      periodStart.toISOString(),
      periodEndExclusive.toISOString(),
      previousPeriodStart.toISOString(),
      previousPeriodEndExclusive.toISOString(),
      cachedToday.toISOString(),
      canViewAllTasks ? "all-tasks" : actor.id,
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
  const bestRevenue = revenueAmounts.reduce(
    (best, item) => (item.amount > best.amount ? item : best),
    revenueAmounts[0] ?? { month: selectedMonthStart, amount: 0 }
  );
  const bestRevenueIndex = revenueAmounts.findIndex(
    (item) => item.month.getTime() === bestRevenue.month.getTime()
  );
  const previousBestRevenue = bestRevenueIndex > 0 ? revenueAmounts[bestRevenueIndex - 1]?.amount ?? 0 : 0;
  const bestRevenueLift = bestRevenue.amount - previousBestRevenue;
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
  const periodRevenue = toNumber(row?.periodRevenue);
  const periodStudentRevenue = toNumber(row?.periodStudentRevenue);
  const periodWorkshopRevenue = toNumber(row?.periodWorkshopRevenue);
  const periodExpenses = toNumber(row?.periodExpenses);
  const periodOperatingExpenses = toNumber(row?.periodOperatingExpenses);
  const periodWorkshopExpenses = toNumber(row?.periodWorkshopExpenses);
  const previousPeriodRevenue = toNumber(row?.previousPeriodRevenue);
  const previousPeriodExpenses = toNumber(row?.previousPeriodExpenses);
  const netProfit = periodRevenue - periodExpenses;
  const previousNetProfit = previousPeriodRevenue - previousPeriodExpenses;
  const netProfitMargin = periodRevenue !== 0 ? (netProfit / periodRevenue) * 100 : 0;
  const totalDebt = toNumber(row?.debtAmount);
  const debtStudentCount = toNumber(row?.debtStudentCount);
  const payoutPreview = toNumber(row?.payoutPreview);
  const waitingLeads = toNumber(row?.waitingLeads);
  const totalAging = debtByBucket.reduce((sum, bucket) => sum + bucket.value, 0);

  const totalLeadsThisMonth = toNumber(row?.totalLeadsThisMonth);
  const companySalesCount = toNumber(row?.companySalesCount);
  // Qeydiyyat = ödənişli satış (course_sales); unpaid converted lead sayılmır.
  const conversionRate = totalLeadsThisMonth > 0
    ? `${Math.round((companySalesCount / totalLeadsThisMonth) * 100)}%`
    : "0%";
  const churnCounts = row?.retention ?? { population: 0, frozen: 0, stopped: 0, total: 0 };
  const churnRate = `${retentionRate(churnCounts.total, churnCounts.population)}%`;

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
  const revenueTrend = calculateKpiTrend(periodRevenue, previousPeriodRevenue);
  const expenseTrend = invertKpiTrend(calculateKpiTrend(periodExpenses, previousPeriodExpenses));
  const netProfitTrend = calculateKpiTrend(netProfit, previousNetProfit);

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
        helper: "Əvvəlki dövrə nisbətən",
        trend: activeStudentsTrend.direction,
        detail: `${formatCount(debtStudentCount)} borclu · ${formatAmount(totalDebt)} açıq borc`,
        tone: "primary",
      },
      {
        label: "Dövriyyə",
        value: formatAmount(periodRevenue),
        delta: revenueTrend.delta,
        helper: "Əvvəlki dövrə nisbətən",
        trend: revenueTrend.direction,
        detail: `Təhsil ${formatAmount(periodStudentRevenue)} · Tədbirlər ${formatAmount(periodWorkshopRevenue)}`,
        tone: "light",
      },
      {
        label: "Xərclər",
        value: formatAmount(periodExpenses),
        delta: expenseTrend.delta,
        helper: "Əvvəlki dövrə nisbətən",
        trend: expenseTrend.direction,
        detail: `Əməliyyat ${formatAmount(periodOperatingExpenses)} · Tədbirlər ${formatAmount(periodWorkshopExpenses)}`,
        tone: "light",
      },
      {
        label: "Xalis mənfəət",
        value: formatAmount(netProfit),
        delta: netProfitTrend.delta,
        helper: "Əvvəlki dövrə nisbətən",
        trend: netProfitTrend.direction,
        detail: `${formatPercentage(netProfitMargin)} xalis mənfəət marjası`,
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
    payoutHelper: "Müəllimlərin cari ay üzrə hesablanmış maaşı.",
    waitingFamilies: waitingLeads,
    waitingHelper: "Növbəti əlaqə tarixi gəlmiş və ya yeni müraciətlər.",
    debtCenter: formatAmount(totalDebt),
    recentPayments,
    programStats,
    teamPerformance,
    conversionRate,
    conversionHelper: `${companySalesCount} satış / ${totalLeadsThisMonth} müraciət`,
    salesCount: companySalesCount,
    totalLeadCount: totalLeadsThisMonth,
    churnRate,
    churnCounts,
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
    case "SLOT_WAITING":
      return { label: "Slot gözləyir", tone: "info" };
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

function invertKpiTrend(trend: ReturnType<typeof calculateKpiTrend>) {
  return {
    ...trend,
    direction: trend.direction === "up" ? "down" : trend.direction === "down" ? "up" : "flat",
  } as const;
}

function formatPercentage(value: number) {
  return `${new Intl.NumberFormat("az-AZ", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(value)}%`;
}

function resolveDashboardDateRange(filters: DashboardFilters) {
  const today = new Date(`${todayInBaku()}T00:00:00Z`);
  const defaultFrom = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const requestedFrom = parseDateInput(filters.from) ?? defaultFrom;
  const requestedTo = parseDateInput(filters.to) ?? today;
  const parsedFrom = requestedFrom > today ? today : requestedFrom;
  const parsedTo = requestedTo > today ? today : requestedTo;
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
