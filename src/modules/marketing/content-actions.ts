"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { MarketingContentAction, MarketingContentStatus, Prisma } from "@/generated/prisma/client";
import { writeAuditLog } from "@/modules/audit/audit-service";
import { erpCacheTags } from "@/modules/shared/cache-tags";
import { requireMutationActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";

const optionalText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() ? value.trim() : undefined),
    z.string().max(max).optional(),
  );

const optionalUuid = z.preprocess(
  (value) => (typeof value === "string" && value.trim() ? value.trim() : undefined),
  z.string().uuid().optional(),
);

const optionalMediaUrl = z.preprocess(
  (value) => (typeof value === "string" && value.trim() ? value.trim() : undefined),
  z.string().url().max(1500).refine((value) => value.startsWith("https://") || value.startsWith("http://"), "Media linki http/https olmalıdır").optional(),
);

const optionalMediaPath = z.preprocess(
  (value) => (typeof value === "string" && value.trim() ? value.trim() : undefined),
  z.string().max(500).regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(?:jpg|png|webp|gif|mp4|webm|mov)$/i).optional(),
);

const contentFields = {
  title: z.string().trim().min(2, "Content adı ən azı 2 simvol olmalıdır").max(120),
  platform: z.enum(["Instagram", "Facebook", "TikTok", "YouTube", "LinkedIn", "Digər"]),
  format: z.enum(["Reel", "Story", "Karusel", "Post", "Video"]),
  scheduledDate: z.preprocess(
    (value) => (typeof value === "string" && value.trim() ? value.trim() : undefined),
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  ),
  scheduledTime: z.preprocess(
    (value) => (typeof value === "string" && value.trim() ? value.trim() : undefined),
    z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).optional(),
  ),
  responsibleUserId: optionalUuid,
  campaignId: optionalUuid,
  caption: optionalText(2200),
  notes: optionalText(1000),
  mediaUrl: optionalMediaUrl,
  mediaPath: optionalMediaPath,
  intent: z.enum(["DRAFT", "SUBMIT"]),
};

const saveContentSchema = z.object({
  id: optionalUuid,
  ...contentFields,
});
const idSchema = z.object({ id: z.string().uuid() });
const revisionSchema = z.object({
  id: z.string().uuid(),
  note: z.string().trim().min(3, "Düzəliş qeydi ən azı 3 simvol olmalıdır").max(600),
});
const scheduleSchema = z.object({
  id: z.string().uuid(),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  scheduledTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).default("11:00"),
});

export async function saveMarketingContentAction(formData: FormData) {
  try {
    return await saveMarketingContent(formData);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/can't reach database server|connection terminated|connection timeout|econnrefused/i.test(message)) {
      throw new Error("Database bağlantısı müvəqqəti əlçatan deyil. Bir neçə saniyə sonra yenidən yoxlayın.");
    }
    throw error;
  }
}

async function saveMarketingContent(formData: FormData) {
  const actor = await requireMutationActor("marketing.manage");
  const input = saveContentSchema.parse(Object.fromEntries(formData));
  const prisma = getPrisma();
  const scheduledAt = input.scheduledDate
    ? parseBakuDateTime(input.scheduledDate, input.scheduledTime ?? "11:00")
    : undefined;
  const nextStatus = input.intent === "SUBMIT" ? MarketingContentStatus.PENDING_APPROVAL : MarketingContentStatus.DRAFT;

  await prisma.$transaction(async (tx) => {
    await validateReferences(tx, input.responsibleUserId, input.campaignId);

    if (input.id) {
      const current = await tx.marketingContentItem.findUnique({ where: { id: input.id } });
      if (!current) throw new Error("Content tapılmadı");
      if (current.status !== MarketingContentStatus.DRAFT && current.status !== MarketingContentStatus.REVISION_REQUIRED) {
        throw new Error("Yalnız qaralama və ya düzəliş tələb olunan content dəyişdirilə bilər");
      }

      const updated = await tx.marketingContentItem.update({
        where: { id: input.id },
        data: {
          title: input.title,
          platform: input.platform,
          format: input.format,
          ...(scheduledAt ? { scheduledAt } : {}),
          responsibleUserId: input.responsibleUserId ?? null,
          campaignId: input.campaignId ?? null,
          caption: input.caption ?? null,
          notes: input.notes ?? null,
          mediaUrl: input.mediaUrl ?? null,
          mediaPath: input.mediaPath ?? null,
          status: nextStatus,
          submittedAt: input.intent === "SUBMIT" ? new Date() : null,
          approvedById: null,
          approvedAt: null,
          revisionNote: null,
        },
        select: { id: true, title: true, status: true, scheduledAt: true },
      });
      await tx.marketingContentActivity.createMany({
        data: [
          { contentId: updated.id, action: MarketingContentAction.UPDATED, actorUserId: actor.id },
          ...(input.intent === "SUBMIT"
            ? [{ contentId: updated.id, action: MarketingContentAction.SUBMITTED, actorUserId: actor.id }]
            : []),
        ],
      });
      await writeAuditLog(tx, {
        actorUserId: actor.id,
        action: "marketing.content.update",
        entityType: "marketing_content",
        entityId: updated.id,
        before: { title: current.title, status: current.status, scheduledAt: current.scheduledAt?.toISOString() ?? null },
        after: { title: updated.title, status: updated.status, scheduledAt: updated.scheduledAt?.toISOString() ?? null },
        reason: input.intent === "SUBMIT" ? "Slide founder təsdiqinə göndərildi" : "Slide qaralaması yeniləndi",
      });
      return;
    }

    const created = await tx.marketingContentItem.create({
      data: {
        title: input.title,
        platform: input.platform,
        format: input.format,
        scheduledAt: scheduledAt ?? null,
        responsibleUserId: input.responsibleUserId ?? null,
        campaignId: input.campaignId ?? null,
        caption: input.caption ?? null,
        notes: input.notes ?? null,
        mediaUrl: input.mediaUrl ?? null,
        mediaPath: input.mediaPath ?? null,
        status: nextStatus,
        createdById: actor.id,
        submittedAt: input.intent === "SUBMIT" ? new Date() : null,
      },
      select: { id: true, title: true, status: true, scheduledAt: true },
    });
    await tx.marketingContentActivity.createMany({
      data: [
        { contentId: created.id, action: MarketingContentAction.CREATED, actorUserId: actor.id },
        ...(input.intent === "SUBMIT"
          ? [{ contentId: created.id, action: MarketingContentAction.SUBMITTED, actorUserId: actor.id }]
          : []),
      ],
    });
    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "marketing.content.create",
      entityType: "marketing_content",
      entityId: created.id,
      after: { title: created.title, status: created.status, scheduledAt: created.scheduledAt?.toISOString() ?? null },
      reason: input.intent === "SUBMIT" ? "Slide yaradıldı və founder təsdiqinə göndərildi" : "Slide qaralaması yaradıldı",
    });
  });

  invalidateMarketing();
}

export async function approveMarketingContentAction(formData: FormData) {
  const actor = await requireMutationActor("marketing.content.approve");
  const { id } = idSchema.parse(Object.fromEntries(formData));
  const prisma = getPrisma();

  await prisma.$transaction(async (tx) => {
    const current = await tx.marketingContentItem.findUnique({ where: { id } });
    if (!current) throw new Error("Content tapılmadı");
    if (current.status !== MarketingContentStatus.PENDING_APPROVAL) {
      throw new Error("Yalnız founder təsdiqi gözləyən slide təsdiqlənə bilər");
    }
    const updated = await tx.marketingContentItem.update({
      where: { id },
      data: {
        status: MarketingContentStatus.ACTIVE,
        approvedById: actor.id,
        approvedAt: new Date(),
        revisionNote: null,
      },
      select: { id: true, title: true, status: true },
    });
    await tx.marketingContentActivity.create({
      data: { contentId: id, action: MarketingContentAction.APPROVED, actorUserId: actor.id },
    });
    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "marketing.content.approve",
      entityType: "marketing_content",
      entityId: id,
      before: { status: current.status },
      after: { status: updated.status },
      reason: "Founder slide-ı təsdiqlədi və calendar üçün aktiv etdi",
    });
  });

  invalidateMarketing();
}

export async function requestMarketingContentRevisionAction(formData: FormData) {
  const actor = await requireMutationActor("marketing.content.approve");
  const input = revisionSchema.parse(Object.fromEntries(formData));
  const prisma = getPrisma();

  await prisma.$transaction(async (tx) => {
    const current = await tx.marketingContentItem.findUnique({ where: { id: input.id } });
    if (!current) throw new Error("Content tapılmadı");
    if (current.status !== MarketingContentStatus.PENDING_APPROVAL) {
      throw new Error("Yalnız founder təsdiqi gözləyən slide düzəlişə qaytarıla bilər");
    }
    const updated = await tx.marketingContentItem.update({
      where: { id: input.id },
      data: {
        status: MarketingContentStatus.REVISION_REQUIRED,
        revisionNote: input.note,
        approvedById: null,
        approvedAt: null,
      },
      select: { id: true, status: true },
    });
    await tx.marketingContentActivity.create({
      data: {
        contentId: input.id,
        action: MarketingContentAction.REVISION_REQUESTED,
        actorUserId: actor.id,
        note: input.note,
      },
    });
    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "marketing.content.revision_request",
      entityType: "marketing_content",
      entityId: input.id,
      before: { status: current.status },
      after: { status: updated.status, revisionNote: input.note },
      reason: "Founder slide-ı düzəliş üçün geri qaytardı",
    });
  });

  invalidateMarketing();
}

export async function scheduleMarketingSlideAction(formData: FormData) {
  const actor = await requireMutationActor("marketing.manage");
  const input = scheduleSchema.parse(Object.fromEntries(formData));
  const scheduledAt = parseBakuDateTime(input.scheduledDate, input.scheduledTime);
  const prisma = getPrisma();

  await prisma.$transaction(async (tx) => {
    const current = await tx.marketingContentItem.findUnique({ where: { id: input.id } });
    if (!current) throw new Error("Slide tapılmadı");
    if (current.status !== MarketingContentStatus.ACTIVE) {
      throw new Error("Calendar-a yalnız founder tərəfindən təsdiqlənmiş slide əlavə edilə bilər");
    }

    await tx.marketingContentItem.update({
      where: { id: input.id },
      data: { scheduledAt },
    });
    await tx.marketingContentActivity.create({
      data: {
        contentId: input.id,
        action: MarketingContentAction.UPDATED,
        actorUserId: actor.id,
        note: `${input.scheduledDate} ${input.scheduledTime} tarixinə planlandı`,
      },
    });
    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "marketing.content.schedule",
      entityType: "marketing_content",
      entityId: input.id,
      before: { scheduledAt: current.scheduledAt?.toISOString() ?? null },
      after: { scheduledAt: scheduledAt.toISOString() },
      reason: "Təsdiqlənmiş slide calendar gününə sürüklənərək planlandı",
    });
  });

  invalidateMarketing();
}

export async function unscheduleMarketingSlideAction(formData: FormData) {
  const actor = await requireMutationActor("marketing.manage");
  const { id } = idSchema.parse(Object.fromEntries(formData));
  const prisma = getPrisma();

  await prisma.$transaction(async (tx) => {
    const current = await tx.marketingContentItem.findUnique({ where: { id } });
    if (!current) throw new Error("Slide tapılmadı");
    if (current.status !== MarketingContentStatus.ACTIVE) {
      throw new Error("Yalnız təsdiqlənmiş slide plandan çıxarıla bilər");
    }

    await tx.marketingContentItem.update({ where: { id }, data: { scheduledAt: null } });
    await tx.marketingContentActivity.create({
      data: {
        contentId: id,
        action: MarketingContentAction.UPDATED,
        actorUserId: actor.id,
        note: "Calendar planından çıxarıldı",
      },
    });
    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "marketing.content.unschedule",
      entityType: "marketing_content",
      entityId: id,
      before: { scheduledAt: current.scheduledAt?.toISOString() ?? null },
      after: { scheduledAt: null },
      reason: "Slide calendar planından çıxarıldı",
    });
  });

  invalidateMarketing();
}

function parseBakuDateTime(date: string, time: string) {
  const value = new Date(`${date}T${time}:00+04:00`);
  if (Number.isNaN(value.getTime())) throw new Error("Plan tarixi etibarsızdır");
  return value;
}

async function validateReferences(
  tx: Prisma.TransactionClient,
  responsibleUserId?: string,
  campaignId?: string,
) {
  const [user, campaign] = await Promise.all([
    responsibleUserId
      ? tx.user.findFirst({ where: { id: responsibleUserId, isActive: true }, select: { id: true } })
      : null,
    campaignId
      ? tx.marketingCampaign.findUnique({ where: { id: campaignId }, select: { id: true } })
      : null,
  ]);
  if (responsibleUserId && !user) throw new Error("Məsul şəxs tapılmadı");
  if (campaignId && !campaign) throw new Error("Kampaniya tapılmadı");
}

function invalidateMarketing() {
  revalidatePath("/marketing");
  updateTag(erpCacheTags.marketing);
}
