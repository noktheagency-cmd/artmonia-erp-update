import { MarketingCampaignStatus, MarketingReportOutcome, Prisma } from "@/generated/prisma/client";
import { requireErpActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";

export type MarketingStatusValue = `${MarketingCampaignStatus}`;
export type MarketingStatRow = { id: string; recordedOn: string; spend: number };
export type MarketingCampaignRow = {
  id: string; name: string; channel: string; owner: string; objective: string; notes: string;
  status: MarketingStatusValue; startsAt: string; endsAt: string; createdAt: string;
  stats: MarketingStatRow[];
  leads: Array<{ createdAt: string }>;
  sales: Array<{ registeredAt: string }>;
  payments: Array<{ paidAt: string; amount: number }>;
  latestReport: { outcome: `${MarketingReportOutcome}`; notes: string; createdAt: string } | null;
};

export type MarketingData = { campaigns: MarketingCampaignRow[]; permissions: { canManage: boolean } };

type MarketingCampaignRawRow = Omit<MarketingCampaignRow, "status"> & {
  status: string;
};

export async function getMarketingData(): Promise<MarketingData> {
  const actor = await requireErpActor("marketing.read");
  const campaigns = await getPrisma().$queryRaw<MarketingCampaignRawRow[]>(Prisma.sql`
    select
      campaign.id::text as id,
      campaign.name,
      campaign.channel,
      coalesce(campaign.owner, 'Marketing') as owner,
      coalesce(campaign.objective, '') as objective,
      coalesce(campaign.notes, '') as notes,
      campaign.status::text as status,
      to_char(campaign.starts_at, 'YYYY-MM-DD') as "startsAt",
      coalesce(to_char(campaign.ends_at, 'YYYY-MM-DD'), '') as "endsAt",
      campaign.created_at::text as "createdAt",
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', stat.id::text,
          'recordedOn', to_char(stat.recorded_on, 'YYYY-MM-DD'),
          'spend', stat.spend::float8
        ) order by stat.recorded_on asc)
        from erp.marketing_campaign_stats stat
        where stat.campaign_id = campaign.id
      ), '[]'::jsonb) as stats,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'createdAt', to_char(lead.created_at, 'YYYY-MM-DD')
        ) order by lead.created_at desc)
        from erp.leads lead
        where lead.campaign_id = campaign.id
      ), '[]'::jsonb) as leads,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'registeredAt', to_char(student.registered_at, 'YYYY-MM-DD')
        ) order by student.registered_at desc)
        from erp.students student
        where student.campaign_id = campaign.id
      ), '[]'::jsonb) as sales,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'paidAt', to_char(payment.paid_at, 'YYYY-MM-DD'),
          'amount', payment.amount::float8
        ) order by payment.paid_at desc)
        from erp.students student
        join erp.payments payment on payment.student_id = student.id
        where student.campaign_id = campaign.id
      ), '[]'::jsonb) as payments,
      (
        select jsonb_build_object(
          'outcome', report.outcome::text,
          'notes', coalesce(report.notes, ''),
          'createdAt', report.created_at::text
        )
        from erp.marketing_campaign_reports report
        where report.campaign_id = campaign.id
        order by report.created_at desc
        limit 1
      ) as "latestReport"
    from erp.marketing_campaigns campaign
    order by campaign.status asc, campaign.updated_at desc
    limit 250
  `);
  return {
    campaigns: campaigns.map((campaign) => ({
      ...campaign,
      status: campaign.status as MarketingStatusValue,
    })),
    permissions: { canManage: actor.permissions.has("marketing.manage") },
  };
}
