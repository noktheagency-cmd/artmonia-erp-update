import { createHmac } from "node:crypto";
import { MarketingCampaignStatus, Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/server/db/prisma";
import { getEnv, requireEnv } from "@/server/env";
import { isInvalidMetaAppSecretProof } from "@/modules/meta/appsecret-proof";

const META_GRAPH_HOST = "graph.facebook.com";
const META_PAGE_LIMIT = 500;
const META_AD_METADATA_PAGE_LIMIT = 100;
const MAX_META_PAGES = 50;
const WRITE_BATCH_SIZE = 250;
const CONVERSATION_ACTION_TYPES = [
  "onsite_conversion.messaging_conversation_started_7d",
  "messaging_conversation_started_7d",
] as const;
const LEAD_ACTION_TYPES = [
  "lead",
  "onsite_conversion.lead_grouped",
  "onsite_conversion.lead",
  "offsite_conversion.fb_pixel_lead",
] as const;

type MetaAction = { action_type?: string; value?: string };
type MetaCampaign = {
  id: string;
  name?: string;
  status?: string;
  effective_status?: string;
  objective?: string;
  start_time?: string;
  stop_time?: string;
  created_time?: string;
};
type MetaAdSet = {
  id: string;
  campaign_id?: string;
  name?: string;
  status?: string;
  effective_status?: string;
  optimization_goal?: string;
  start_time?: string;
  end_time?: string;
};
type MetaCreative = {
  id?: string;
  name?: string;
  thumbnail_url?: string;
  effective_object_story_id?: string;
  instagram_permalink_url?: string;
  title?: string;
  body?: string;
  call_to_action_type?: string;
};
type MetaAd = {
  id: string;
  campaign_id?: string;
  adset_id?: string;
  name?: string;
  status?: string;
  effective_status?: string;
  creative?: MetaCreative;
};
type MetaInsight = {
  campaign_id?: string;
  campaign_name?: string;
  date_start?: string;
  date_stop?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  conversations?: string;
  cpc?: string;
  cpm?: string;
  ctr?: string;
  frequency?: string;
  actions?: MetaAction[];
  cost_per_action_type?: MetaAction[];
};
type MetaAdInsight = MetaInsight & {
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
};
type MetaAccount = {
  id: string;
  name?: string;
  currency?: string;
  timezone_name?: string;
  account_status?: number;
};
type MetaPage<T> = {
  data?: T[];
  paging?: { next?: string };
  error?: { message?: string; code?: number; error_subcode?: number; is_transient?: boolean; fbtrace_id?: string };
};

export type MetaSyncResult = {
  accountName: string;
  currency: string;
  since: string;
  until: string;
  campaigns: number;
  adSets: number;
  ads: number;
  insightRows: number;
  adInsightRows: number;
  syncedAt: string;
};

export class MetaAdsApiError extends Error {
  constructor(
    public readonly metaCode: number | null,
    public readonly metaSubcode: number | null,
    public readonly transient: boolean,
    public readonly traceId: string | null,
    status: number,
  ) {
    super(`Meta API sorğusu uğursuz oldu (HTTP ${status}${metaCode ? `, kod ${metaCode}` : ""}).`);
    this.name = "MetaAdsApiError";
  }
}

export function hasMetaAdsConfig() {
  const env = getEnv();
  return Boolean(env.META_AD_ACCOUNT_ID && env.META_ACCESS_TOKEN);
}

export async function syncMetaMarketing(options?: { months?: number; since?: Date; until?: Date }): Promise<MetaSyncResult> {
  const env = getEnv();
  const accountId = requireEnv("META_AD_ACCOUNT_ID");
  requireEnv("META_ACCESS_TOKEN");

  const until = options?.until ? startOfUtcDay(options.until) : todayInBaku();
  const since = startOfUtcDay(options?.since ?? subtractUtcMonths(until, options?.months ?? env.META_SYNC_MONTHS));
  if (since > until) throw new Error("Meta sync tarix aralığı düzgün deyil.");

  const [account, campaigns, adSets, ads] = await Promise.all([
    metaGet<MetaAccount>(`/${accountId}`, {
      fields: "id,name,currency,timezone_name,account_status",
    }),
    metaGetAll<MetaCampaign>(`/${accountId}/campaigns`, {
      fields: "id,name,status,effective_status,objective,start_time,stop_time,created_time",
      limit: String(META_PAGE_LIMIT),
    }),
    metaGetAll<MetaAdSet>(`/${accountId}/adsets`, {
      fields: "id,campaign_id,name,status,effective_status,optimization_goal,start_time,end_time",
      limit: String(META_PAGE_LIMIT),
    }),
    metaGetAll<MetaAd>(`/${accountId}/ads`, {
      fields: [
        "id",
        "campaign_id",
        "adset_id",
        "name",
        "status",
        "effective_status",
        "creative{id,name,thumbnail_url,effective_object_story_id,instagram_permalink_url,title,body,call_to_action_type}",
      ].join(","),
      limit: String(META_AD_METADATA_PAGE_LIMIT),
    }),
  ]);

  const syncedAt = new Date();
  await upsertMetaCampaigns(campaigns, accountId, since, syncedAt);
  const campaignIds = await loadCampaignIdMap(accountId);
  await upsertMetaAdSets(adSets, campaignIds, syncedAt);
  const adSetIds = await loadAdSetIdMap();
  await upsertMetaAds(ads, campaignIds, adSetIds, syncedAt);
  const adIds = await loadAdIdMap();
  const insightRows: MetaInsight[] = [];
  const adInsightRows: MetaAdInsight[] = [];

  for (const window of monthlyWindows(since, until)) {
    const commonParams = {
      time_increment: "1",
      time_range: JSON.stringify({ since: dateKey(window.since), until: dateKey(window.until) }),
      action_report_time: "conversion",
      use_unified_attribution_setting: "true",
      limit: String(META_PAGE_LIMIT),
    };
    const [campaignRows, adRows] = await Promise.all([
      metaGetAll<MetaInsight>(`/${accountId}/insights`, {
        ...commonParams,
        level: "campaign",
        fields: insightFields("campaign"),
      }),
      metaGetAll<MetaAdInsight>(`/${accountId}/insights`, {
        ...commonParams,
        level: "ad",
        fields: insightFields("ad"),
      }),
    ]);
    insightRows.push(...campaignRows);
    adInsightRows.push(...adRows);
  }

  const normalized = insightRows.flatMap((row) => {
    if (!row.campaign_id || !row.date_start) return [];
    const campaignId = campaignIds.get(row.campaign_id);
    if (!campaignId) return [];
    const spend = safeNumber(row.spend);
    const conversations = actionValue(row.actions, CONVERSATION_ACTION_TYPES);
    const leads = metaLeadActionValue(row.actions);
    const reportedCost = actionValue(row.cost_per_action_type, CONVERSATION_ACTION_TYPES);
    return [{
      campaignId,
      metaCampaignId: row.campaign_id,
      recordedOn: row.date_start,
      spend,
      impressions: safeInteger(row.impressions),
      reach: safeInteger(row.reach),
      clicks: safeInteger(row.clicks),
      leads: Math.round(leads),
      conversations: Math.round(conversations),
      costPerConversation: reportedCost || (conversations > 0 ? spend / conversations : 0),
      cpc: safeNumber(row.cpc),
      cpm: safeNumber(row.cpm),
      ctr: safeNumber(row.ctr),
      frequency: safeNumber(row.frequency),
    }];
  });

  await upsertMetaStats(normalized, account.currency ?? "AZN", syncedAt);
  const normalizedAdStats = adInsightRows.flatMap((row) => {
    if (!row.ad_id || !row.date_start) return [];
    const adId = adIds.get(row.ad_id);
    if (!adId) return [];
    const spend = safeNumber(row.spend);
    const conversations = actionValue(row.actions, CONVERSATION_ACTION_TYPES);
    const reportedCost = actionValue(row.cost_per_action_type, CONVERSATION_ACTION_TYPES);
    return [{
      adId,
      recordedOn: row.date_start,
      spend,
      impressions: safeInteger(row.impressions),
      reach: safeInteger(row.reach),
      clicks: safeInteger(row.clicks),
      conversations: Math.round(conversations),
      costPerConversation: reportedCost || (conversations > 0 ? spend / conversations : 0),
      cpc: safeNumber(row.cpc),
      cpm: safeNumber(row.cpm),
      ctr: safeNumber(row.ctr),
      frequency: safeNumber(row.frequency),
    }];
  });
  await upsertMetaAdStats(normalizedAdStats, account.currency ?? "AZN", syncedAt);

  return {
    accountName: account.name ?? accountId,
    currency: account.currency ?? "AZN",
    since: dateKey(since),
    until: dateKey(until),
    campaigns: campaigns.length,
    adSets: adSets.length,
    ads: ads.length,
    insightRows: normalized.length,
    adInsightRows: normalizedAdStats.length,
    syncedAt: syncedAt.toISOString(),
  };
}

async function upsertMetaCampaigns(campaigns: MetaCampaign[], accountId: string, fallbackStart: Date, syncedAt: Date) {
  const prisma = getPrisma();
  for (const batch of chunks(campaigns, WRITE_BATCH_SIZE)) {
    if (!batch.length) continue;
    const values = batch.map((campaign) => {
      const startsAt = isoDate(campaign.start_time ?? campaign.created_time) ?? dateKey(fallbackStart);
      const endsAt = isoDate(campaign.stop_time);
      const status = mapCampaignStatus(campaign.effective_status ?? campaign.status);
      return Prisma.sql`(
        gen_random_uuid(),
        ${campaign.name?.trim() || `Meta kampaniya ${campaign.id}`},
        'Meta Ads',
        'Meta',
        ${campaign.objective ?? null},
        ${`Meta Campaign ID: ${campaign.id}`},
        ${status}::"erp"."MarketingCampaignStatus",
        0,
        ${startsAt}::date,
        ${endsAt}::date,
        ${accountId},
        ${campaign.id},
        ${syncedAt},
        now(),
        now()
      )`;
    });
    await prisma.$executeRaw(Prisma.sql`
      insert into erp.marketing_campaigns (
        id, name, channel, owner, objective, notes, status, budget, starts_at, ends_at,
        meta_ad_account_id, meta_campaign_id, meta_synced_at, created_at, updated_at
      ) values ${Prisma.join(values)}
      on conflict (meta_ad_account_id, meta_campaign_id) do update set
        name = excluded.name,
        channel = excluded.channel,
        owner = excluded.owner,
        objective = excluded.objective,
        status = excluded.status,
        starts_at = excluded.starts_at,
        ends_at = excluded.ends_at,
        meta_synced_at = excluded.meta_synced_at,
        updated_at = now()
    `);
  }
}

async function loadCampaignIdMap(accountId: string) {
  const rows = await getPrisma().marketingCampaign.findMany({
    where: { metaAdAccountId: accountId, metaCampaignId: { not: null } },
    select: { id: true, metaCampaignId: true },
    take: 2_000,
  });
  return new Map(rows.flatMap((row) => row.metaCampaignId ? [[row.metaCampaignId, row.id] as const] : []));
}

async function upsertMetaAdSets(adSets: MetaAdSet[], campaignIds: Map<string, string>, syncedAt: Date) {
  const prisma = getPrisma();
  const validAdSets = adSets.filter((adSet) => adSet.campaign_id && campaignIds.has(adSet.campaign_id));
  for (const batch of chunks(validAdSets, WRITE_BATCH_SIZE)) {
    const values = batch.map((adSet) => Prisma.sql`(
      gen_random_uuid(),
      ${campaignIds.get(adSet.campaign_id!)}::uuid,
      ${adSet.id},
      ${cleanText(adSet.name, 240) || `Meta Ad Set ${adSet.id}`},
      ${adSet.effective_status ?? adSet.status ?? "UNKNOWN"},
      ${adSet.optimization_goal ?? null},
      ${isoTimestamp(adSet.start_time)},
      ${isoTimestamp(adSet.end_time)},
      ${syncedAt},
      now(),
      now()
    )`);
    await prisma.$executeRaw(Prisma.sql`
      insert into erp.marketing_ad_sets (
        id, campaign_id, meta_ad_set_id, name, status, optimization_goal,
        starts_at, ends_at, meta_synced_at, created_at, updated_at
      ) values ${Prisma.join(values)}
      on conflict (meta_ad_set_id) do update set
        campaign_id = excluded.campaign_id,
        name = excluded.name,
        status = excluded.status,
        optimization_goal = excluded.optimization_goal,
        starts_at = excluded.starts_at,
        ends_at = excluded.ends_at,
        meta_synced_at = excluded.meta_synced_at,
        updated_at = now()
    `);
  }
}

async function loadAdSetIdMap() {
  const rows = await getPrisma().marketingAdSet.findMany({
    select: { id: true, metaAdSetId: true },
    take: 5_000,
  });
  return new Map(rows.map((row) => [row.metaAdSetId, row.id] as const));
}

async function upsertMetaAds(
  ads: MetaAd[],
  campaignIds: Map<string, string>,
  adSetIds: Map<string, string>,
  syncedAt: Date,
) {
  const prisma = getPrisma();
  const validAds = ads.filter((ad) => (
    ad.campaign_id && campaignIds.has(ad.campaign_id)
    && ad.adset_id && adSetIds.has(ad.adset_id)
  ));
  for (const batch of chunks(validAds, WRITE_BATCH_SIZE)) {
    const values = batch.map((ad) => {
      const creative = ad.creative;
      return Prisma.sql`(
        gen_random_uuid(),
        ${campaignIds.get(ad.campaign_id!)}::uuid,
        ${adSetIds.get(ad.adset_id!)}::uuid,
        ${ad.id},
        ${cleanText(ad.name, 240) || `Meta reklam ${ad.id}`},
        ${ad.effective_status ?? ad.status ?? "UNKNOWN"},
        ${creative?.id ?? null},
        ${cleanText(creative?.name, 500)},
        ${cleanText(creative?.title, 500)},
        ${cleanText(creative?.body, 10_000)},
        ${creative?.call_to_action_type ?? null},
        ${safeMetaThumbnailUrl(creative?.thumbnail_url)},
        ${safeInstagramUrl(creative?.instagram_permalink_url)},
        ${creative?.effective_object_story_id ?? null},
        ${syncedAt},
        now(),
        now()
      )`;
    });
    await prisma.$executeRaw(Prisma.sql`
      insert into erp.marketing_ads (
        id, campaign_id, ad_set_id, meta_ad_id, name, status,
        meta_creative_id, creative_name, creative_title, creative_body,
        call_to_action_type, thumbnail_url, instagram_permalink_url,
        effective_object_story_id, meta_synced_at, created_at, updated_at
      ) values ${Prisma.join(values)}
      on conflict (meta_ad_id) do update set
        campaign_id = excluded.campaign_id,
        ad_set_id = excluded.ad_set_id,
        name = excluded.name,
        status = excluded.status,
        meta_creative_id = excluded.meta_creative_id,
        creative_name = excluded.creative_name,
        creative_title = excluded.creative_title,
        creative_body = excluded.creative_body,
        call_to_action_type = excluded.call_to_action_type,
        thumbnail_url = excluded.thumbnail_url,
        instagram_permalink_url = excluded.instagram_permalink_url,
        effective_object_story_id = excluded.effective_object_story_id,
        meta_synced_at = excluded.meta_synced_at,
        updated_at = now()
    `);
  }
}

async function loadAdIdMap() {
  const rows = await getPrisma().marketingAd.findMany({
    select: { id: true, metaAdId: true },
    take: 10_000,
  });
  return new Map(rows.map((row) => [row.metaAdId, row.id] as const));
}

async function upsertMetaStats(
  rows: Array<{
    campaignId: string;
    metaCampaignId: string;
    recordedOn: string;
    spend: number;
    impressions: number;
    reach: number;
    clicks: number;
    leads: number;
    conversations: number;
    costPerConversation: number;
    cpc: number;
    cpm: number;
    ctr: number;
    frequency: number;
  }>,
  currency: string,
  syncedAt: Date,
) {
  const prisma = getPrisma();
  for (const batch of chunks(rows, WRITE_BATCH_SIZE)) {
    if (!batch.length) continue;
    const values = batch.map((row) => Prisma.sql`(
      gen_random_uuid(), ${row.campaignId}::uuid, ${row.recordedOn}::date,
      ${row.spend}, ${row.leads}, ${row.impressions}, ${row.reach}, ${row.clicks}, ${row.conversations},
      ${row.costPerConversation}, ${row.cpc}, ${row.cpm}, ${row.ctr}, ${row.frequency},
      ${currency}, 'META', ${syncedAt}, now(), now()
    )`);
    await prisma.$executeRaw(Prisma.sql`
      insert into erp.marketing_campaign_stats (
        id, campaign_id, recorded_on, spend, leads, impressions, reach, clicks, conversations,
        cost_per_conversation, cpc, cpm, ctr, frequency, currency, source, synced_at,
        created_at, updated_at
      ) values ${Prisma.join(values)}
      on conflict (campaign_id, recorded_on) do update set
        spend = excluded.spend,
        leads = excluded.leads,
        impressions = excluded.impressions,
        reach = excluded.reach,
        clicks = excluded.clicks,
        conversations = excluded.conversations,
        cost_per_conversation = excluded.cost_per_conversation,
        cpc = excluded.cpc,
        cpm = excluded.cpm,
        ctr = excluded.ctr,
        frequency = excluded.frequency,
        currency = excluded.currency,
        source = excluded.source,
        synced_at = excluded.synced_at,
        updated_at = now()
    `);
  }
}

async function upsertMetaAdStats(
  rows: Array<{
    adId: string;
    recordedOn: string;
    spend: number;
    impressions: number;
    reach: number;
    clicks: number;
    conversations: number;
    costPerConversation: number;
    cpc: number;
    cpm: number;
    ctr: number;
    frequency: number;
  }>,
  currency: string,
  syncedAt: Date,
) {
  const prisma = getPrisma();
  for (const batch of chunks(rows, WRITE_BATCH_SIZE)) {
    const values = batch.map((row) => Prisma.sql`(
      gen_random_uuid(), ${row.adId}::uuid, ${row.recordedOn}::date,
      ${row.spend}, ${row.impressions}, ${row.reach}, ${row.clicks}, ${row.conversations},
      ${row.costPerConversation}, ${row.cpc}, ${row.cpm}, ${row.ctr}, ${row.frequency},
      ${currency}, ${syncedAt}, now(), now()
    )`);
    await prisma.$executeRaw(Prisma.sql`
      insert into erp.marketing_ad_stats (
        id, ad_id, recorded_on, spend, impressions, reach, clicks, conversations,
        cost_per_conversation, cpc, cpm, ctr, frequency, currency, synced_at,
        created_at, updated_at
      ) values ${Prisma.join(values)}
      on conflict (ad_id, recorded_on) do update set
        spend = excluded.spend,
        impressions = excluded.impressions,
        reach = excluded.reach,
        clicks = excluded.clicks,
        conversations = excluded.conversations,
        cost_per_conversation = excluded.cost_per_conversation,
        cpc = excluded.cpc,
        cpm = excluded.cpm,
        ctr = excluded.ctr,
        frequency = excluded.frequency,
        currency = excluded.currency,
        synced_at = excluded.synced_at,
        updated_at = now()
    `);
  }
}

async function metaGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const page = await metaRequest<T>(buildMetaUrl(path, params));
  const data = page.data;
  if (Array.isArray(data)) {
    const first = data[0];
    if (!first) throw new Error("Meta API boş cavab qaytardı.");
    return first;
  }
  return page as T;
}

async function metaGetAll<T>(path: string, params: Record<string, string>): Promise<T[]> {
  let nextUrl: URL | null = buildMetaUrl(path, params);
  const result: T[] = [];
  for (let pageNumber = 0; nextUrl && pageNumber < MAX_META_PAGES; pageNumber += 1) {
    const page = await metaRequest<T>(nextUrl);
    result.push(...(page.data ?? []));
    nextUrl = safeNextUrl(page.paging?.next);
  }
  return result;
}

async function metaRequest<T>(url: URL): Promise<MetaPage<T>> {
  const env = getEnv();
  const accessToken = requireEnv("META_ACCESS_TOKEN");
  const requestUrl = new URL(url);
  const attachedAppSecretProof = Boolean(env.META_APP_SECRET && !requestUrl.searchParams.has("appsecret_proof"));
  if (attachedAppSecretProof && env.META_APP_SECRET) {
    requestUrl.searchParams.set("appsecret_proof", createHmac("sha256", env.META_APP_SECRET).update(accessToken).digest("hex"));
  }

  let { response, payload } = await fetchMetaPage<T>(requestUrl, accessToken);
  if (attachedAppSecretProof && isInvalidMetaAppSecretProof(payload.error)) {
    const retryUrl = new URL(requestUrl);
    retryUrl.searchParams.delete("appsecret_proof");
    ({ response, payload } = await fetchMetaPage<T>(retryUrl, accessToken));
  }

  if (!response.ok || payload.error) {
    throw new MetaAdsApiError(
      payload.error?.code ?? null,
      payload.error?.error_subcode ?? null,
      Boolean(payload.error?.is_transient),
      payload.error?.fbtrace_id ?? null,
      response.status,
    );
  }
  return payload;
}

async function fetchMetaPage<T>(url: URL, accessToken: string) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json().catch(() => ({})) as MetaPage<T>;
  return { response, payload };
}

function buildMetaUrl(path: string, params: Record<string, string>) {
  const version = getEnv().META_GRAPH_API_VERSION;
  const url = new URL(`https://${META_GRAPH_HOST}/${version}${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return url;
}

function safeNextUrl(value?: string) {
  if (!value) return null;
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== META_GRAPH_HOST) {
    throw new Error("Meta pagination ünvanı etibarlı deyil.");
  }
  return url;
}

function mapCampaignStatus(value?: string): MarketingCampaignStatus {
  if (value === "ACTIVE") return MarketingCampaignStatus.ACTIVE;
  if (value === "PAUSED" || value === "CAMPAIGN_PAUSED" || value === "ADSET_PAUSED") return MarketingCampaignStatus.PAUSED;
  if (value === "ARCHIVED" || value === "DELETED") return MarketingCampaignStatus.COMPLETED;
  return MarketingCampaignStatus.DRAFT;
}

function insightFields(level: "campaign" | "ad") {
  const dimensions = level === "ad"
    ? ["campaign_id", "campaign_name", "adset_id", "ad_id", "ad_name"]
    : ["campaign_id", "campaign_name"];
  return [
    ...dimensions,
    "date_start",
    "date_stop",
    "spend",
    "impressions",
    "reach",
    "clicks",
    "cpc",
    "cpm",
    "ctr",
    "frequency",
    "actions",
    "cost_per_action_type",
  ].join(",");
}

function actionValue(actions: MetaAction[] | undefined, candidates: readonly string[]) {
  for (const candidate of candidates) {
    const match = actions?.find((action) => action.action_type === candidate);
    if (match) return safeNumber(match.value);
  }
  return 0;
}

export function metaLeadActionValue(actions: MetaAction[] | undefined) {
  return actionValue(actions, LEAD_ACTION_TYPES);
}

function safeNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function safeInteger(value: unknown) {
  return Math.round(safeNumber(value));
}

function startOfUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function todayInBaku() {
  const bakuNow = new Date(Date.now() + 4 * 60 * 60 * 1000);
  return new Date(Date.UTC(bakuNow.getUTCFullYear(), bakuNow.getUTCMonth(), bakuNow.getUTCDate()));
}

function subtractUtcMonths(value: Date, months: number) {
  const result = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() - months, 1));
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(value.getUTCDate(), lastDay));
  return result;
}

function monthlyWindows(since: Date, until: Date) {
  const windows: Array<{ since: Date; until: Date }> = [];
  let cursor = since;
  while (cursor <= until) {
    const endOfMonth = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0));
    const windowUntil = endOfMonth < until ? endOfMonth : until;
    windows.push({ since: cursor, until: windowUntil });
    cursor = new Date(windowUntil);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return windows;
}

function isoDate(value?: string) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : dateKey(parsed);
}

function isoTimestamp(value?: string) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function cleanText(value: string | undefined, maxLength: number) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function safeMetaThumbnailUrl(value?: string) {
  return safeExternalUrl(value, (hostname) => (
    hostname.endsWith(".fbcdn.net")
    || hostname.endsWith(".cdninstagram.com")
    || hostname === "lookaside.fbsbx.com"
  ));
}

function safeInstagramUrl(value?: string) {
  return safeExternalUrl(value, (hostname) => hostname === "instagram.com" || hostname.endsWith(".instagram.com"));
}

function safeExternalUrl(value: string | undefined, allowedHost: (hostname: string) => boolean) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && allowedHost(url.hostname) ? url.toString() : null;
  } catch {
    return null;
  }
}

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function chunks<T>(values: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}
