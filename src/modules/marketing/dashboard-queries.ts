import { Prisma } from "@/generated/prisma/client";
import { requireErpActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";
import { hasMetaAdsConfig } from "@/modules/marketing/meta-ads";
import { resolveMarketingDateRange } from "@/modules/marketing/date-range";

export type MarketingDashboardData = {
  period: { from: string; to: string; defaultFrom: string; defaultTo: string };
  meta: { configured: boolean; lastSyncedAt: string };
  permissions: { canManage: boolean };
  totals: {
    adExpense: number;
    contentExpense: number;
    marketingExpense: number;
    metaLeads: number;
    qualifiedLeads: number;
    firstPayingStudents: number;
    cpl: number | null;
    cac: number | null;
  };
  trend: Array<{
    month: string;
    label: string;
    metaLeads: number;
    qualifiedLeads: number;
    firstPayments: number;
  }>;
  campaigns: Array<{
    id: string;
    name: string;
    metaLeads: number;
    qualifiedLeads: number;
    firstPayments: number;
    leadToPaymentRate: number;
  }>;
};

type TotalRow = {
  adExpense: number;
  contentExpense: number;
  metaLeads: number;
  qualifiedLeads: number;
  firstPayingStudents: number;
  lastSyncedAt: string;
};

type TrendRow = {
  month: string;
  metaLeads: number;
  qualifiedLeads: number;
  firstPayments: number;
};

type CampaignRow = MarketingDashboardData["campaigns"][number];

export async function getMarketingDashboardData(filters?: { from?: string; to?: string }): Promise<MarketingDashboardData> {
  const actor = await requireErpActor("marketing.read");
  const { from, to, defaultFrom, defaultTo, rangeStart, rangeEndExclusive, businessStart, businessEnd } = resolveMarketingDateRange(filters);
  const prisma = getPrisma();

  const [totalsRows, trendRows, campaigns] = await Promise.all([
    prisma.$queryRaw<TotalRow[]>(Prisma.sql`
      select
        coalesce((select sum(expense.amount)::float8
          from erp.finance_expenses expense
          join erp.finance_expense_categories category on category.id = expense.category_id
          where expense.voided_at is null
            and expense.workshop_event_id is null
            and expense.cost_center = 'MARKETING'
            and expense.expense_date >= ${rangeStart}
            and expense.expense_date < ${rangeEndExclusive}
            and category.code = 'OP_MARKETING_ADS'), 0)::float8 as "adExpense",
        coalesce((select sum(expense.amount)::float8
          from erp.finance_expenses expense
          join erp.finance_expense_categories category on category.id = expense.category_id
          where expense.voided_at is null
            and expense.workshop_event_id is null
            and expense.cost_center = 'MARKETING'
            and expense.expense_date >= ${rangeStart}
            and expense.expense_date < ${rangeEndExclusive}
            and category.code = 'OP_MARKETING_CONTENT'), 0)::float8 as "contentExpense",
        coalesce((select sum(stat.leads)::int
          from erp.marketing_campaign_stats stat
          where stat.source = 'META'
            and stat.recorded_on >= ${rangeStart}
            and stat.recorded_on < ${rangeEndExclusive}), 0)::int as "metaLeads",
        coalesce((select count(*)::int
          from erp.leads lead
          where lead.created_at >= ${businessStart}
            and lead.created_at < ${businessEnd}), 0)::int as "qualifiedLeads",
        coalesce((select count(*)::int from (
          select payment.student_id
          from erp.payments payment
          join erp.students student on student.id = payment.student_id
          where payment.receipt_purpose <> 'ONE_OFF' and student.is_test_data = false
            and (student.campaign_id is not null or exists (
              select 1 from erp.leads lead
              where lead.converted_student_id = student.id and lead.source is not null
            ))
          group by payment.student_id
          having min(payment.paid_at) >= ${businessStart}
            and min(payment.paid_at) < ${businessEnd}
        ) first_payers), 0)::int as "firstPayingStudents",
        coalesce((select max(stat.synced_at)::text || 'Z'
          from erp.marketing_campaign_stats stat where stat.source = 'META'), '') as "lastSyncedAt"
    `),
    prisma.$queryRaw<TrendRow[]>(Prisma.sql`
      with months as (
        select generate_series(
          date_trunc('month', ${rangeStart}::timestamp),
          date_trunc('month', (${rangeEndExclusive}::timestamp - interval '1 day')),
          interval '1 month'
        )::date as month
      ), meta as (
        select date_trunc('month', recorded_on)::date as month, sum(leads)::int as count
        from erp.marketing_campaign_stats
        where source = 'META' and recorded_on >= ${rangeStart} and recorded_on < ${rangeEndExclusive}
        group by 1
      ), qualified as (
        select date_trunc('month', created_at + interval '4 hours')::date as month, count(*)::int as count
        from erp.leads
        where created_at >= ${businessStart} and created_at < ${businessEnd}
        group by 1
      ), first_payment as (
        select date_trunc('month', first_paid_at + interval '4 hours')::date as month, count(*)::int as count
        from (
          select payment.student_id, min(payment.paid_at) as first_paid_at
          from erp.payments payment
          join erp.students student on student.id = payment.student_id
          where payment.receipt_purpose <> 'ONE_OFF' and student.is_test_data = false
            and (student.campaign_id is not null or exists (
              select 1 from erp.leads lead
              where lead.converted_student_id = student.id and lead.source is not null
            ))
          group by payment.student_id
        ) paid
        where first_paid_at >= ${businessStart} and first_paid_at < ${businessEnd}
        group by 1
      )
      select to_char(months.month, 'YYYY-MM') as month,
        coalesce(meta.count, 0)::int as "metaLeads",
        coalesce(qualified.count, 0)::int as "qualifiedLeads",
        coalesce(first_payment.count, 0)::int as "firstPayments"
      from months
      left join meta using (month)
      left join qualified using (month)
      left join first_payment using (month)
      order by months.month
    `),
    prisma.$queryRaw<CampaignRow[]>(Prisma.sql`
      select campaign.id::text as id, campaign.name,
        coalesce(meta.count, 0)::int as "metaLeads",
        coalesce(qualified.count, 0)::int as "qualifiedLeads",
        coalesce(first_payment.count, 0)::int as "firstPayments",
        coalesce(first_payment.count * 100.0 / nullif(meta.count, 0), 0)::float8 as "leadToPaymentRate"
      from erp.marketing_campaigns campaign
      left join lateral (
        select sum(stat.leads)::int as count
        from erp.marketing_campaign_stats stat
        where stat.campaign_id = campaign.id and stat.source = 'META'
          and stat.recorded_on >= ${rangeStart} and stat.recorded_on < ${rangeEndExclusive}
      ) meta on true
      left join lateral (
        select count(*)::int as count from erp.leads lead
        where lead.campaign_id = campaign.id
          and lead.created_at >= ${businessStart} and lead.created_at < ${businessEnd}
      ) qualified on true
      left join lateral (
        select count(*)::int as count from (
          select student.id
          from erp.students student
          join erp.payments payment on payment.student_id = student.id
          where payment.receipt_purpose <> 'ONE_OFF' and student.campaign_id = campaign.id and student.is_test_data = false
          group by student.id
          having min(payment.paid_at) >= ${businessStart} and min(payment.paid_at) < ${businessEnd}
        ) paid
      ) first_payment on true
      where coalesce(meta.count, 0) + coalesce(qualified.count, 0) + coalesce(first_payment.count, 0) > 0
      order by coalesce(meta.count, 0) desc, coalesce(qualified.count, 0) desc, campaign.name
      limit 8
    `),
  ]);

  const row = totalsRows[0] ?? {
    adExpense: 0,
    contentExpense: 0,
    metaLeads: 0,
    qualifiedLeads: 0,
    firstPayingStudents: 0,
    lastSyncedAt: "",
  };
  const marketingExpense = row.adExpense + row.contentExpense;

  return {
    period: { from, to, defaultFrom, defaultTo },
    meta: { configured: hasMetaAdsConfig(), lastSyncedAt: row.lastSyncedAt },
    permissions: { canManage: actor.permissions.has("marketing.manage") },
    totals: {
      ...row,
      marketingExpense,
      cpl: row.qualifiedLeads > 0 ? row.adExpense / row.qualifiedLeads : null,
      cac: row.firstPayingStudents > 0 ? marketingExpense / row.firstPayingStudents : null,
    },
    trend: trendRows.map((item) => ({ ...item, label: monthLabel(item.month) })),
    campaigns,
  };
}

function monthLabel(value: string) {
  const [year, month] = value.split("-").map(Number);
  const names = ["Yan", "Fev", "Mar", "Apr", "May", "İyn", "İyl", "Avq", "Sen", "Okt", "Noy", "Dek"];
  return `${names[(month ?? 1) - 1]} ${String(year ?? "").slice(-2)}`;
}
