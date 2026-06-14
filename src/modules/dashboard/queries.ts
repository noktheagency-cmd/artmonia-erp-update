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

export type DashboardKpi = {
  label: string;
  value: string;
  delta: string;
  helper: string;
  tone: "primary" | "light";
};

export type DashboardData = {
  kpis: DashboardKpi[];
  revenueBars: Array<{
    label: string;
    value: number;
    amount: string;
  }>;
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
  conversionRate: string;
  studentStatusCounts: Array<{
    label: string;
    count: number;
    tone: "success" | "warning" | "danger" | "info" | "neutral";
  }>;
};

type DashboardRawRow = {
  activeStudents: unknown;
  activeMrr: unknown;
  debtAmount: unknown;
  newLeadsThisMonth: unknown;
  revenueRows: unknown;
  taskRows: unknown;
  payoutPreview: unknown;
  waitingLeads: unknown;
  debtBuckets: unknown;
  recentPayments: unknown;
  programStats: unknown;
  totalLeadsThisMonth: unknown;
  convertedLeadsThisMonth: unknown;
  studentStatusCounts: unknown;
};

type DashboardRevenueRawRow = {
  paymentMonth: string;
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

const agingBuckets = [
  { label: "0-3 gün", min: 0, max: 3, color: "#3158ff" },
  { label: "4-7 gün", min: 4, max: 7, color: "#fbbf24" },
  { label: "8-14 gün", min: 8, max: 14, color: "#f97316" },
  { label: "15+ gün", min: 15, max: Number.POSITIVE_INFINITY, color: "#f43f5e" },
] as const;

export async function getOwnerDashboardData(): Promise<DashboardData> {
  const prisma = getPrisma();
  const today = new Date();
  const cachedToday = getCacheTimeBucket(today);
  const monthStart = startOfMonth(today);
  const nextMonthStart = addMonths(monthStart, 1);
  const firstRevenueMonth = addMonths(monthStart, -6);
  
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
        select sum(i.balance_due)
        from erp.invoices i
        where i.balance_due > 0
          and i.status <> 'VOID'::"erp"."InvoiceStatus"
      ), 0) as "debtAmount",
      coalesce((
        select count(*)::int
        from erp.leads l
        where l.created_at >= ${monthStart}
          and l.created_at < ${nextMonthStart}
      ), 0) as "newLeadsThisMonth",
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
          group by p.payment_month
        ) revenue
      ), '[]'::jsonb) as "revenueRows",
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
          order by t.due_at asc nulls last, t.created_at asc
          limit 4
        ) task_rows
      ), '[]'::jsonb) as "taskRows",
      coalesce((
        select sum(tp.payout_amount)
        from erp.teacher_payouts tp
        where tp.period_month = ${monthStart}
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
          and (l.next_follow_up_at is null or l.next_follow_up_at <= ${cachedToday})
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
        where l.created_at >= ${monthStart}
          and l.created_at < ${nextMonthStart}
      ), 0) as "totalLeadsThisMonth",
      coalesce((
        select count(*)::int
        from erp.leads l
        where l.created_at >= ${monthStart}
          and l.created_at < ${nextMonthStart}
          and (l.converted_student_id is not null or l.stage = 'REGISTERED'::"erp"."LeadStage")
      ), 0) as "convertedLeadsThisMonth",
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
      ), '[]'::jsonb) as "studentStatusCounts"
  `);
  const getDashboardRawData = unstable_cache(
    fetchDashboardRawData,
    [
      "owner-dashboard-data",
      monthStart.toISOString(),
      nextMonthStart.toISOString(),
      firstRevenueMonth.toISOString(),
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
  const taskRows = asJsonArray<DashboardTaskRawRow>(row?.taskRows);
  const debtBucketRows = asJsonArray<DashboardDebtBucketRawRow>(row?.debtBuckets);
  const recentPaymentRows = asJsonArray<RawPaymentRow>(row?.recentPayments);
  const rawProgramStats = asJsonArray<RawProgramStat>(row?.programStats);
  const rawStatusCounts = asJsonArray<RawStudentStatusCount>(row?.studentStatusCounts);

  const revenueByMonth = new Map(
    revenueRows.map((item) => [
      new Date(item.paymentMonth).toISOString().slice(0, 7),
      toNumber(item.amount),
    ])
  );
  
  const revenueAmounts = Array.from({ length: 7 }, (_, index) => {
    const month = addMonths(firstRevenueMonth, index);
    const key = month.toISOString().slice(0, 7);

    return {
      month,
      amount: revenueByMonth.get(key) ?? 0,
    };
  });
  
  const maxRevenue = Math.max(...revenueAmounts.map((item) => item.amount), 1);
  
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
  const totalDebt = toNumber(row?.debtAmount);
  const newLeadsThisMonth = toNumber(row?.newLeadsThisMonth);
  const payoutPreview = toNumber(row?.payoutPreview);
  const waitingLeads = toNumber(row?.waitingLeads);
  const totalAging = debtByBucket.reduce((sum, bucket) => sum + bucket.value, 0);

  const totalLeadsThisMonth = toNumber(row?.totalLeadsThisMonth);
  const convertedLeadsThisMonth = toNumber(row?.convertedLeadsThisMonth);
  const conversionRate = totalLeadsThisMonth > 0 
    ? `${Math.round((convertedLeadsThisMonth / totalLeadsThisMonth) * 100)}%`
    : "0%";

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

  return {
    kpis: [
      {
        label: "Aktiv tələbə",
        value: formatCount(activeStudents),
        delta: "Tədris alan",
        helper: "Bu ay dərslərdə iştirak edənlər",
        tone: "primary",
      },
      {
        label: "Aylıq dövriyyə (MRR)",
        value: formatAmount(activeMrr),
        delta: "Abunəlik",
        helper: "Aktiv müqavilələr üzrə dövriyyə",
        tone: "light",
      },
      {
        label: "Gecikən borclar",
        value: formatAmount(totalDebt),
        delta: "Ödənilməyən",
        helper: "Ümumi faktura qalıqları",
        tone: "light",
      },
      {
        label: "Müraciət çevrilməsi",
        value: conversionRate,
        delta: "Konversiya",
        helper: `${newLeadsThisMonth} yeni müraciət daxil olub`,
        tone: "light",
      },
    ],
    revenueBars: revenueAmounts.map((item) => ({
      label: formatMonth(item.month),
      value: Math.max(8, Math.round((item.amount / maxRevenue) * 100)),
      amount: formatAmount(item.amount),
    })),
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
    conversionRate,
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
