import {
  HrBonusCampaignStatus,
  Prisma,
} from "@/generated/prisma/client";
import { writeAuditLog } from "@/modules/audit/audit-service";
import { splitBonusPool } from "@/modules/hr/bonus-rules";
import { getPrisma } from "@/server/db/prisma";

type NumericRow = { value: Prisma.Decimal | number | string | null };

export async function calculateBonusCampaignValue(campaignId: string) {
  const prisma = getPrisma();
  const campaign = await prisma.hrBonusCampaign.findUnique({
    where: { id: campaignId },
    include: { adjustments: { select: { amount: true } } },
  });
  if (!campaign) throw new Error("Bonus kampaniyası tapılmadı");

  let baseValue = 0;
  if (campaign.metricKind === "DEPARTMENT_COLLECTED_REVENUE") {
    const [row] = await prisma.$queryRaw<NumericRow[]>(Prisma.sql`
      select coalesce(sum(p.amount), 0) as value
      from erp.payments p
      join erp.students s on s.id = p.student_id
      join erp.hr_employees he on he.user_id = s.manager_id
      where he.department = ${campaign.department}
        and p.paid_at >= ${campaign.startsAt}
        and p.paid_at <= ${campaign.endsAt}
    `);
    baseValue = Number(row?.value ?? 0);
  } else if (campaign.metricKind === "DEPARTMENT_SALES_COUNT") {
    const [row] = await prisma.$queryRaw<NumericRow[]>(Prisma.sql`
      select count(*)::int as value
      from erp.students s
      join erp.hr_employees he on he.user_id = s.manager_id
      where he.department = ${campaign.department}
        and s.registered_at >= ${campaign.startsAt}
        and s.registered_at <= ${campaign.endsAt}
    `);
    baseValue = Number(row?.value ?? 0);
  }

  const adjustmentValue = campaign.adjustments.reduce(
    (sum, adjustment) => sum + Number(adjustment.amount),
    0,
  );
  return {
    baseValue,
    adjustmentValue,
    currentValue: Math.max(0, baseValue + adjustmentValue),
  };
}

export async function syncBonusCampaign(campaignId: string, actorUserId?: string | null) {
  const prisma = getPrisma();
  const campaign = await prisma.hrBonusCampaign.findUnique({
    where: { id: campaignId },
    include: {
      stages: { orderBy: { sortOrder: "asc" } },
      participants: { where: { isEligible: true }, orderBy: { id: "asc" } },
    },
  });
  if (!campaign || campaign.status === "CANCELLED") return null;

  const today = utcDateOnly(new Date());
  if (campaign.startsAt > today) {
    if (campaign.status !== "SCHEDULED") {
      await prisma.hrBonusCampaign.update({ where: { id: campaign.id }, data: { status: "SCHEDULED" } });
    }
    return calculateBonusCampaignValue(campaign.id);
  }

  const progress = await calculateBonusCampaignValue(campaign.id);
  const finalStage = campaign.stages.at(-1);
  let finalReached = Boolean(finalStage?.reachedAt);

  await prisma.$transaction(async (tx) => {
    for (const stage of campaign.stages) {
      if (stage.reachedAt || progress.currentValue < Number(stage.threshold)) continue;

      const unlocked = await tx.hrBonusStage.updateMany({
        where: { id: stage.id, reachedAt: null },
        data: { reachedAt: new Date(), reachedValue: progress.currentValue },
      });
      if (unlocked.count === 0) continue;

      const awards = splitBonusPool(
        Number(stage.bonusPool),
        campaign.participants.map((participant) => participant.id),
      );
      if (awards.length > 0) {
        await tx.hrBonusAward.createMany({
          data: awards.map((award) => ({
            stageId: stage.id,
            participantId: award.participantId,
            amount: award.amount,
          })),
          skipDuplicates: true,
        });
      }

      await writeAuditLog(tx, {
        actorUserId: actorUserId ?? campaign.createdById,
        action: "hr.bonus.stage.unlock",
        entityType: "hr_bonus_stage",
        entityId: stage.id,
        after: {
          campaignId: campaign.id,
          threshold: Number(stage.threshold),
          reachedValue: progress.currentValue,
          bonusPool: Number(stage.bonusPool),
          participantCount: awards.length,
        },
        reason: `${stage.sortOrder + 1}. bonus etapı açıldı`,
      });

      if (stage.id === finalStage?.id) finalReached = true;
    }

    const nextStatus: HrBonusCampaignStatus = finalReached
      ? "ACHIEVED"
      : campaign.endsAt < today
        ? "EXPIRED"
        : "ACTIVE";
    if (nextStatus !== campaign.status) {
      await tx.hrBonusCampaign.update({ where: { id: campaign.id }, data: { status: nextStatus } });
    }
  });

  return progress;
}

export async function syncActiveBonusCampaigns(actorUserId?: string | null) {
  const campaigns = await getPrisma().hrBonusCampaign.findMany({
    where: { status: { in: ["SCHEDULED", "ACTIVE"] } },
    select: { id: true },
    orderBy: { startsAt: "asc" },
  });
  for (const campaign of campaigns) {
    await syncBonusCampaign(campaign.id, actorUserId);
  }
}

export function utcDateOnly(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}
