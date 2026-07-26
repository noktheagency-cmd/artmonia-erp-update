import type { MarketingContentAction, MarketingContentStatus } from "@/generated/prisma/client";
import { requireErpActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";

export type MarketingContentItemRow = {
  id: string;
  title: string;
  platform: string;
  format: string;
  scheduledAt: string;
  responsibleUserId: string;
  responsibleName: string;
  campaignId: string;
  campaignName: string;
  caption: string;
  notes: string;
  mediaUrl: string;
  mediaPath: string;
  status: `${MarketingContentStatus}`;
  createdByName: string;
  submittedAt: string;
  approvedByName: string;
  approvedAt: string;
  revisionNote: string;
  activities: Array<{
    id: string;
    action: `${MarketingContentAction}`;
    actorName: string;
    note: string;
    createdAt: string;
  }>;
};

export type MarketingContentData = {
  month: string;
  items: MarketingContentItemRow[];
  people: Array<{ id: string; name: string; email: string }>;
  campaigns: Array<{ id: string; name: string }>;
  permissions: { canManage: boolean; canApprove: boolean };
};

export async function getMarketingContentData(requestedMonth?: string): Promise<MarketingContentData> {
  const actor = await requireErpActor("marketing.read");
  const month = validMonth(requestedMonth) ? requestedMonth! : bakuMonthKey(new Date());
  const prisma = getPrisma();

  const [items, people, campaigns] = await Promise.all([
    prisma.marketingContentItem.findMany({
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: 250,
      select: {
        id: true,
        title: true,
        platform: true,
        format: true,
        scheduledAt: true,
        responsibleUserId: true,
        campaignId: true,
        caption: true,
        notes: true,
        mediaUrl: true,
        mediaPath: true,
        status: true,
        submittedAt: true,
        approvedAt: true,
        revisionNote: true,
        responsible: { select: { fullName: true } },
        campaign: { select: { name: true } },
        createdBy: { select: { fullName: true } },
        approvedBy: { select: { fullName: true } },
        activities: {
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            id: true,
            action: true,
            note: true,
            createdAt: true,
            actor: { select: { fullName: true } },
          },
        },
      },
    }),
    prisma.user.findMany({
      where: { isActive: true },
      orderBy: { fullName: "asc" },
      take: 100,
      select: { id: true, fullName: true, email: true },
    }),
    prisma.marketingCampaign.findMany({
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      take: 250,
      select: { id: true, name: true },
    }),
  ]);

  return {
    month,
    items: items.map((item) => ({
      id: item.id,
      title: item.title,
      platform: item.platform,
      format: item.format,
      scheduledAt: item.scheduledAt?.toISOString() ?? "",
      responsibleUserId: item.responsibleUserId ?? "",
      responsibleName: item.responsible?.fullName ?? "Təyin edilməyib",
      campaignId: item.campaignId ?? "",
      campaignName: item.campaign?.name ?? "",
      caption: item.caption ?? "",
      notes: item.notes ?? "",
      mediaUrl: item.mediaUrl ?? "",
      mediaPath: item.mediaPath ?? "",
      status: item.status,
      createdByName: item.createdBy?.fullName ?? "Sistem",
      submittedAt: item.submittedAt?.toISOString() ?? "",
      approvedByName: item.approvedBy?.fullName ?? "",
      approvedAt: item.approvedAt?.toISOString() ?? "",
      revisionNote: item.revisionNote ?? "",
      activities: item.activities.map((activity) => ({
        id: activity.id,
        action: activity.action,
        actorName: activity.actor?.fullName ?? "Sistem",
        note: activity.note ?? "",
        createdAt: activity.createdAt.toISOString(),
      })),
    })),
    people: people.map((person) => ({ id: person.id, name: person.fullName, email: person.email })),
    campaigns,
    permissions: {
      canManage: actor.permissions.has("marketing.manage"),
      canApprove: actor.permissions.has("marketing.content.approve"),
    },
  };
}

function validMonth(value?: string): value is string {
  return Boolean(value && /^\d{4}-(?:0[1-9]|1[0-2])$/.test(value));
}

function bakuMonthKey(value: Date) {
  const baku = new Date(value.getTime() + 4 * 60 * 60 * 1000);
  return `${baku.getUTCFullYear()}-${String(baku.getUTCMonth() + 1).padStart(2, "0")}`;
}
