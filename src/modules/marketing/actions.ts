"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { MarketingCampaignStatus, MarketingReportOutcome, Prisma } from "@/generated/prisma/client";
import { writeAuditLog } from "@/modules/audit/audit-service";
import { syncMetaMarketing, type MetaSyncResult } from "@/modules/marketing/meta-ads";
import { erpCacheTags } from "@/modules/shared/cache-tags";
import { requireMutationActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";

const nullableText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() ? value.trim() : undefined),
    z.string().max(max).optional()
  );

const dateValue = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const money = z.preprocess((value) => Number(String(value).replace(",", ".")), z.number().min(0).max(10_000_000));

const campaignFields = {
  name: z.string().trim().min(2).max(120),
  channel: z.string().trim().min(2).max(60),
  owner: nullableText(80),
  objective: nullableText(240),
  notes: nullableText(1000),
  status: z.nativeEnum(MarketingCampaignStatus),
  startsAt: dateValue,
  endsAt: z.preprocess((value) => (typeof value === "string" && value ? value : undefined), dateValue.optional()),
};

const createCampaignSchema = z.object(campaignFields);

const updateCampaignSchema = z.object({ id: z.string().uuid(), ...campaignFields });
const deleteCampaignSchema = z.object({ id: z.string().uuid() });
const saveStatSchema = z.object({
  campaignId: z.string().uuid(),
  recordedOn: dateValue,
  spend: money,
});
const createReportSchema = z.object({
  campaignId: z.string().uuid(),
  outcome: z.nativeEnum(MarketingReportOutcome),
  notes: nullableText(1500),
  decision: z.enum(["continue", "pause"]),
});

export async function createMarketingCampaignAction(formData: FormData) {
  const actor = await requireMutationActor("marketing.manage");
  const input = createCampaignSchema.parse(Object.fromEntries(formData));
  const prisma = getPrisma();

  await prisma.$transaction(async (tx) => {
    const campaign = await tx.marketingCampaign.create({
      data: {
        name: input.name,
        channel: input.channel,
        owner: input.owner ?? null,
        objective: input.objective ?? null,
        notes: input.notes ?? null,
        status: input.status,
        startsAt: parseDate(input.startsAt),
        endsAt: input.endsAt ? parseDate(input.endsAt) : null,
        createdById: actor.id,
      },
      select: { id: true, name: true, channel: true, status: true },
    });

    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "marketing.campaign.create",
      entityType: "marketing_campaign",
      entityId: campaign.id,
      after: campaign satisfies Prisma.InputJsonValue,
      reason: "Marketing kampaniyası yaradıldı",
    });
  });
  invalidateMarketing();
}

export async function updateMarketingCampaignAction(formData: FormData) {
  const actor = await requireMutationActor("marketing.manage");
  const input = updateCampaignSchema.parse(Object.fromEntries(formData));
  const prisma = getPrisma();

  await prisma.$transaction(async (tx) => {
    const current = await tx.marketingCampaign.findUnique({ where: { id: input.id } });
    if (!current) throw new Error("Kampaniya tapılmadı");
    const updated = await tx.marketingCampaign.update({
      where: { id: input.id },
      data: {
        name: input.name,
        channel: input.channel,
        owner: input.owner ?? null,
        objective: input.objective ?? null,
        notes: input.notes ?? null,
        status: input.status,
        startsAt: parseDate(input.startsAt),
        endsAt: input.endsAt ? parseDate(input.endsAt) : null,
      },
    });
    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "marketing.campaign.update",
      entityType: "marketing_campaign",
      entityId: updated.id,
      before: campaignAuditJson(current),
      after: campaignAuditJson(updated),
      reason: "Marketing kampaniyası yeniləndi",
    });
  });
  invalidateMarketing();
}

export async function deleteMarketingCampaignAction(formData: FormData) {
  const actor = await requireMutationActor("marketing.manage");
  const input = deleteCampaignSchema.parse(Object.fromEntries(formData));
  const prisma = getPrisma();
  await prisma.$transaction(async (tx) => {
    const current = await tx.marketingCampaign.findUnique({ where: { id: input.id } });
    if (!current) throw new Error("Kampaniya tapılmadı");
    await tx.marketingCampaign.delete({ where: { id: input.id } });
    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "marketing.campaign.delete",
      entityType: "marketing_campaign",
      entityId: current.id,
      before: campaignAuditJson(current),
      reason: "Marketing kampaniyası silindi",
    });
  });
  invalidateMarketing();
}

export async function saveMarketingStatAction(formData: FormData) {
  const actor = await requireMutationActor("marketing.manage");
  const input = saveStatSchema.parse(Object.fromEntries(formData));
  const prisma = getPrisma();
  await prisma.$transaction(async (tx) => {
    const campaign = await tx.marketingCampaign.findUnique({ where: { id: input.campaignId }, select: { id: true, name: true, metaCampaignId: true } });
    if (!campaign) throw new Error("Kampaniya tapılmadı");
    if (campaign.metaCampaignId) throw new Error("Meta kampaniyasının xərci API-dən avtomatik sinxronlaşdırılır.");
    const stat = await tx.marketingCampaignStat.upsert({
      where: { campaignId_recordedOn: { campaignId: input.campaignId, recordedOn: parseDate(input.recordedOn) } },
      create: { campaignId: input.campaignId, recordedOn: parseDate(input.recordedOn), spend: input.spend },
      update: { spend: input.spend },
    });
    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "marketing.stat.save",
      entityType: "marketing_campaign_stat",
      entityId: stat.id,
      after: { campaignId: campaign.id, campaignName: campaign.name, recordedOn: input.recordedOn, spend: input.spend },
      reason: "Kampaniya performans qeydi əlavə edildi",
    });
  });
  invalidateMarketing();
}

export async function syncMetaMarketingAction(): Promise<MetaSyncResult> {
  const actor = await requireMutationActor("marketing.manage");
  const result = await syncMetaMarketing();
  await writeAuditLog(getPrisma(), {
    actorUserId: actor.id,
    action: "marketing.meta.sync",
    entityType: "marketing_integration",
    entityId: null,
    after: {
      campaigns: result.campaigns,
      adSets: result.adSets,
      ads: result.ads,
      insightRows: result.insightRows,
      adInsightRows: result.adInsightRows,
      since: result.since,
      until: result.until,
      syncedAt: result.syncedAt,
    },
    reason: "Meta reklam nəticələri sinxronlaşdırıldı",
  });
  invalidateMarketing();
  revalidatePath("/dashboard");
  updateTag(erpCacheTags.dashboard);
  return result;
}

export async function createMarketingReportAction(formData: FormData) {
  const actor = await requireMutationActor("marketing.manage");
  const input = createReportSchema.parse(Object.fromEntries(formData));
  const prisma = getPrisma();
  await prisma.$transaction(async (tx) => {
    const campaign = await tx.marketingCampaign.findUnique({ where: { id: input.campaignId }, select: { id: true, name: true, status: true } });
    if (!campaign) throw new Error("Kampaniya tapılmadı");
    const report = await tx.marketingCampaignReport.create({ data: { campaignId: campaign.id, outcome: input.outcome, notes: input.notes ?? null, createdById: actor.id } });
    const status = input.decision === "pause" ? MarketingCampaignStatus.PAUSED : MarketingCampaignStatus.ACTIVE;
    await tx.marketingCampaign.update({ where: { id: campaign.id }, data: { status } });
    await writeAuditLog(tx, { actorUserId: actor.id, action: "marketing.report.create", entityType: "marketing_campaign", entityId: campaign.id, before: { status: campaign.status }, after: { reportId: report.id, outcome: input.outcome, decision: input.decision, status }, reason: input.notes ?? null });
  });
  invalidateMarketing();
}

function campaignAuditJson(campaign: { id: string; name: string; channel: string; status: MarketingCampaignStatus; startsAt: Date; endsAt: Date | null }) {
  return { id: campaign.id, name: campaign.name, channel: campaign.channel, status: campaign.status, startsAt: campaign.startsAt.toISOString(), endsAt: campaign.endsAt?.toISOString() ?? null } satisfies Prisma.InputJsonValue;
}

function parseDate(value: string) { return new Date(`${value}T00:00:00.000Z`); }
function invalidateMarketing() { revalidatePath("/marketing"); updateTag(erpCacheTags.marketing); }
