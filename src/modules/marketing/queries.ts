import { MarketingCampaignStatus, MarketingReportOutcome, Prisma } from "@/generated/prisma/client";
import { resolveMarketingDateRange } from "@/modules/marketing/date-range";
import { hasMetaAdsConfig } from "@/modules/marketing/meta-ads";
import { requireErpActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";
import { getEnv } from "@/server/env";

export type MarketingStatusValue = `${MarketingCampaignStatus}`;
export type MarketingStatSummary = {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  conversations: number;
  costPerConversation: number;
  currency: string;
  lastSyncedAt: string;
};
export type MarketingCampaignRow = {
  id: string;
  name: string;
  channel: string;
  owner: string;
  objective: string;
  notes: string;
  status: MarketingStatusValue;
  startsAt: string;
  endsAt: string;
  createdAt: string;
  metaCampaignId: string;
  metaSyncedAt: string;
  adCount: number;
  stats: MarketingStatSummary;
  leadCount: number;
  saleCount: number;
  revenue: number;
  latestReport: { outcome: `${MarketingReportOutcome}`; notes: string; createdAt: string } | null;
};

export type MarketingData = {
  campaigns: MarketingCampaignRow[];
  permissions: { canManage: boolean };
  meta: { configured: boolean; defaultMonths: number; lastSyncedAt: string };
  period: { from: string; to: string; defaultFrom: string; defaultTo: string };
};

export type MarketingAdRow = {
  id: string;
  name: string;
  metaAdId: string;
  status: string;
  adSetName: string;
  optimizationGoal: string;
  creativeName: string;
  creativeTitle: string;
  creativeBody: string;
  callToActionType: string;
  thumbnailUrl: string;
  instagramPermalinkUrl: string;
  effectiveObjectStoryId: string;
  stats: MarketingStatSummary;
};

type MarketingCampaignRawRow = Omit<MarketingCampaignRow, "status"> & { status: string };

export async function getMarketingData(filters?: { from?: string; to?: string }): Promise<MarketingData> {
  const actor = await requireErpActor("marketing.read");
  const env = getEnv();
  const {
    from: rangeStartKey,
    to: rangeEndKey,
    defaultFrom,
    defaultTo,
    rangeStart,
    rangeEndExclusive,
    businessStart: businessRangeStart,
    businessEnd: businessRangeEndExclusive,
  } = resolveMarketingDateRange(filters);
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
      coalesce(campaign.meta_campaign_id, '') as "metaCampaignId",
      coalesce(campaign.meta_synced_at::text || 'Z', '') as "metaSyncedAt",
      coalesce(ad_summary.count, 0)::int as "adCount",
      jsonb_build_object(
        'spend', coalesce(stat_summary.spend, 0),
        'impressions', coalesce(stat_summary.impressions, 0),
        'reach', coalesce(stat_summary.reach, 0),
        'clicks', coalesce(stat_summary.clicks, 0),
        'conversations', coalesce(stat_summary.conversations, 0),
        'costPerConversation', coalesce(stat_summary.spend / nullif(stat_summary.conversations, 0), 0),
        'currency', coalesce(stat_summary.currency, 'AZN'),
        'lastSyncedAt', coalesce(stat_summary.last_synced_at, '')
      ) as stats,
      coalesce(lead_summary.count, 0)::int as "leadCount",
      coalesce(sale_summary.count, 0)::int as "saleCount",
      coalesce(payment_summary.revenue, 0)::float8 as revenue,
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
    left join lateral (
      select count(*)::int as count
      from erp.marketing_ads ad
      where ad.campaign_id = campaign.id
    ) ad_summary on true
    left join lateral (
      select
        coalesce(sum(stat.spend), 0)::float8 as spend,
        coalesce(sum(stat.impressions), 0)::int as impressions,
        coalesce(sum(stat.reach), 0)::int as reach,
        coalesce(sum(stat.clicks), 0)::int as clicks,
        coalesce(sum(stat.conversations), 0)::int as conversations,
        coalesce(max(stat.currency) filter (where stat.source = 'META'), 'AZN') as currency,
        coalesce(max(stat.synced_at)::text || 'Z', '') as last_synced_at
      from erp.marketing_campaign_stats stat
      where stat.campaign_id = campaign.id
        and stat.recorded_on >= ${rangeStart}
        and stat.recorded_on < ${rangeEndExclusive}
    ) stat_summary on true
    left join lateral (
      select count(*)::int as count
      from erp.leads lead
      where lead.campaign_id = campaign.id
        and lead.created_at >= ${businessRangeStart}
        and lead.created_at < ${businessRangeEndExclusive}
    ) lead_summary on true
    left join lateral (
      select count(*)::int as count
      from erp.students student
      where student.campaign_id = campaign.id
        and student.registered_at >= ${businessRangeStart}
        and student.registered_at < ${businessRangeEndExclusive}
    ) sale_summary on true
    left join lateral (
      select coalesce(sum(payment.amount), 0)::float8 as revenue
      from erp.students student
      join erp.payments payment on payment.student_id = student.id
      where student.campaign_id = campaign.id
        and payment.paid_at >= ${businessRangeStart}
        and payment.paid_at < ${businessRangeEndExclusive}
    ) payment_summary on true
    order by (campaign.meta_campaign_id is not null) desc, campaign.status asc, campaign.updated_at desc
    limit 250
  `);

  const lastSyncedAt = campaigns.reduce((latest, campaign) => {
    const candidate = campaign.stats.lastSyncedAt || campaign.metaSyncedAt;
    return candidate && candidate > latest ? candidate : latest;
  }, "");
  const metaCurrency = campaigns.find((campaign) => campaign.metaCampaignId && campaign.stats.spend > 0)?.stats.currency ?? "AZN";

  return {
    campaigns: campaigns.map((campaign) => ({
      ...campaign,
      status: campaign.status as MarketingStatusValue,
      stats: campaign.metaCampaignId ? { ...campaign.stats, currency: metaCurrency } : campaign.stats,
    })),
    permissions: { canManage: actor.permissions.has("marketing.manage") },
    meta: { configured: hasMetaAdsConfig(), defaultMonths: env.META_SYNC_MONTHS, lastSyncedAt },
    period: { from: rangeStartKey, to: rangeEndKey, defaultFrom, defaultTo },
  };
}

export async function getMarketingCampaignAds(
  campaignId: string,
  filters?: { from?: string; to?: string },
): Promise<{ ads: MarketingAdRow[]; period: { from: string; to: string } }> {
  await requireErpActor("marketing.read");
  const { from, to, rangeStart, rangeEndExclusive } = resolveMarketingDateRange(filters);

  const ads = await getPrisma().$queryRaw<MarketingAdRow[]>(Prisma.sql`
    select
      ad.id::text as id,
      ad.name,
      ad.meta_ad_id as "metaAdId",
      ad.status,
      ad_set.name as "adSetName",
      coalesce(ad_set.optimization_goal, '') as "optimizationGoal",
      coalesce(ad.creative_name, '') as "creativeName",
      coalesce(ad.creative_title, '') as "creativeTitle",
      coalesce(ad.creative_body, '') as "creativeBody",
      coalesce(ad.call_to_action_type, '') as "callToActionType",
      coalesce(ad.thumbnail_url, '') as "thumbnailUrl",
      coalesce(ad.instagram_permalink_url, '') as "instagramPermalinkUrl",
      coalesce(ad.effective_object_story_id, '') as "effectiveObjectStoryId",
      jsonb_build_object(
        'spend', coalesce(stat_summary.spend, 0),
        'impressions', coalesce(stat_summary.impressions, 0),
        'reach', coalesce(stat_summary.reach, 0),
        'clicks', coalesce(stat_summary.clicks, 0),
        'conversations', coalesce(stat_summary.conversations, 0),
        'costPerConversation', coalesce(stat_summary.spend / nullif(stat_summary.conversations, 0), 0),
        'currency', coalesce(stat_summary.currency, 'AZN'),
        'lastSyncedAt', coalesce(stat_summary.last_synced_at, '')
      ) as stats
    from erp.marketing_ads ad
    join erp.marketing_ad_sets ad_set on ad_set.id = ad.ad_set_id
    left join lateral (
      select
        coalesce(sum(stat.spend), 0)::float8 as spend,
        coalesce(sum(stat.impressions), 0)::int as impressions,
        coalesce(sum(stat.reach), 0)::int as reach,
        coalesce(sum(stat.clicks), 0)::int as clicks,
        coalesce(sum(stat.conversations), 0)::int as conversations,
        coalesce(max(stat.currency), 'AZN') as currency,
        coalesce(max(stat.synced_at)::text || 'Z', '') as last_synced_at
      from erp.marketing_ad_stats stat
      where stat.ad_id = ad.id
        and stat.recorded_on >= ${rangeStart}
        and stat.recorded_on < ${rangeEndExclusive}
    ) stat_summary on true
    where ad.campaign_id = ${campaignId}::uuid
    order by stat_summary.spend desc, ad.updated_at desc
    limit 500
  `);

  return { ads, period: { from, to } };
}
