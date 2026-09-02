"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  FinanceCostCenter,
  FinanceFinancialClass,
  FinanceTransactionType,
  HrBonusDistributionMode,
  HrBonusMetricKind,
  PaymentMethod,
  Prisma,
} from "@/generated/prisma/client";
import { writeAuditLog } from "@/modules/audit/audit-service";
import { validateBonusStages } from "@/modules/hr/bonus-rules";
import { syncActiveBonusCampaigns, syncBonusCampaign } from "@/modules/hr/bonus-service";
import { requireMutationActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";
import {
  PublicActionError,
  safeServerAction,
} from "@/server/actions/safe-action";

const teacherChurnRuleSchema = z.object({
  churnThreshold: z.coerce.number().int().positive().max(500),
  deductionAmount: z.coerce.number().nonnegative().max(1_000_000),
});

const stageSchema = z.object({
  threshold: z.coerce.number().positive().max(1_000_000_000),
  bonusPool: z.coerce.number().nonnegative().max(1_000_000).default(0),
  bonusPercent: z.coerce.number().nonnegative().max(100).default(0),
  fixedAmount: z.coerce.number().nonnegative().max(1_000_000).default(0),
  isIncremental: z.boolean().default(false),
  churnRules: z.array(teacherChurnRuleSchema).max(8).default([]),
});

const createCampaignSchema = z.object({
  name: z.string().trim().min(3).max(120),
  department: z.string().trim().min(2).max(80),
  startsAt: z.string().date(),
  endsAt: z.string().date(),
  metricKind: z.enum(["DEPARTMENT_COLLECTED_REVENUE", "DEPARTMENT_SALES_COUNT", "TEACHER_RETENTION_RATE", "MANUAL_KPI"]),
  distributionMode: z.enum(["EQUAL", "HR_APPROVAL"]),
  recursMonthly: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  requiredThreshold: z.coerce.number().nonnegative().max(1_000_000).default(0),
  perUnitBonusPercent: z.coerce.number().nonnegative().max(100).default(0),
  perUnitBonusAmount: z.coerce.number().nonnegative().max(1_000_000).default(0),
  participantIds: z.string().default("[]").transform((value, context) => {
    try {
      return [...new Set(z.array(z.string().uuid()).max(300).parse(JSON.parse(value)))];
    } catch {
      context.addIssue({ code: "custom", message: "Bonus iştirakçıları düzgün seçilməyib" });
      return z.NEVER;
    }
  }),
  stages: z.string().transform((value, context) => {
    try {
      return z.array(stageSchema).parse(JSON.parse(value));
    } catch {
      context.addIssue({ code: "custom", message: "Bonus etapları düzgün deyil" });
      return z.NEVER;
    }
  }),
});

async function createBonusCampaignActionImpl(formData: FormData) {
  const actor = await requireMutationActor("hr.bonus.manage");
  const input = createCampaignSchema.parse(Object.fromEntries(formData));
  const hasPerUnitRule = input.requiredThreshold > 0
    && (input.perUnitBonusPercent > 0 || input.perUnitBonusAmount > 0);
  if (hasPerUnitRule && input.metricKind !== "DEPARTMENT_SALES_COUNT") {
    throw new PublicActionError("Hər satış üçün bonus qaydası yalnız satış sayı göstəricisinə tətbiq olunur");
  }
  if (hasPerUnitRule && !Number.isInteger(input.requiredThreshold)) {
    throw new PublicActionError("Məcburi satış həddi tam ədəd olmalıdır");
  }
  const rawStages = hasPerUnitRule
    ? [{ threshold: input.requiredThreshold + 1, bonusPool: 0, bonusPercent: 0, fixedAmount: 0, isIncremental: true, churnRules: [] }, ...input.stages]
    : input.stages;
  let stages: ReturnType<typeof validateBonusStages>;
  try {
    stages = validateBonusStages(rawStages);
  } catch (error) {
    throw new PublicActionError(
      error instanceof Error ? error.message : "Bonus etapları düzgün deyil",
    );
  }
  const startsAt = parseDate(input.startsAt);
  const endsAt = parseDate(input.endsAt);
  if (endsAt < startsAt) throw new PublicActionError("Bitmə tarixi başlanğıc tarixindən əvvəl ola bilməz");
  if (input.metricKind === "DEPARTMENT_SALES_COUNT" && stages.some((stage) => !Number.isInteger(stage.threshold))) {
    throw new PublicActionError("Satış sayı hədəfləri tam ədəd olmalıdır");
  }
  if (input.metricKind === "TEACHER_RETENTION_RATE" && stages.some((stage) => stage.threshold > 500)) {
    throw new PublicActionError("Müəllim tələbə sayı düzgün deyil");
  }
  if (input.metricKind === "TEACHER_RETENTION_RATE" && stages.some((stage) => !Number.isInteger(stage.threshold) || stage.fixedAmount <= 0 || stage.bonusPercent > 0)) {
    throw new PublicActionError("Müəllim pilləsində tələbə sayı tam ədəd, bonus isə sıfırdan böyük olmalıdır");
  }

  const prisma = getPrisma();
  const participants = await prisma.hrEmployee.findMany({
    where: {
      department: input.department,
      status: { in: ["ACTIVE", "PROBATION"] },
      ...(input.participantIds.length ? { id: { in: input.participantIds } } : {}),
      ...(input.metricKind === "TEACHER_RETENTION_RATE" ? { teacherId: { not: null } } : {}),
    },
    select: { id: true, fullName: true, email: true },
    orderBy: { fullName: "asc" },
  });
  const overlap = participants.length ? await prisma.hrBonusCampaign.findFirst({
    where: {
      metricKind: input.metricKind as HrBonusMetricKind,
      status: { in: ["SCHEDULED", "ACTIVE"] },
      startsAt: { lte: endsAt },
      endsAt: { gte: startsAt },
      participants: { some: { employeeId: { in: participants.map((participant) => participant.id) }, isEligible: true } },
    },
    select: { name: true },
  }) : null;
  if (overlap) throw new PublicActionError(`Bu dövr üçün artıq “${overlap.name}” kampaniyası aktivdir`, "CONFLICT");
  if (participants.length === 0) throw new PublicActionError("Seçilmiş departamentdə uyğun əməkdaş yoxdur", "NOT_FOUND");

  const now = new Date();
  const campaignId = randomUUID();
  const campaign = await prisma.$transaction(async (tx) => {
    const created = await tx.hrBonusCampaign.create({
      data: {
        id: campaignId,
        name: input.name,
        department: input.department,
        startsAt,
        endsAt,
        metricKind: input.metricKind as HrBonusMetricKind,
        distributionMode: input.distributionMode as HrBonusDistributionMode,
        recursMonthly: input.recursMonthly,
        recurrenceGroupId: input.recursMonthly ? campaignId : null,
        requiredThreshold: hasPerUnitRule ? input.requiredThreshold : 0,
        perUnitBonusPercent: hasPerUnitRule ? input.perUnitBonusPercent : 0,
        perUnitBonusAmount: hasPerUnitRule ? input.perUnitBonusAmount : 0,
        status: startsAt > now ? "SCHEDULED" : "ACTIVE",
        createdById: actor.id,
        stages: {
          create: stages.map((stage, index) => ({
            sortOrder: index,
            threshold: stage.threshold,
            bonusPool: stage.bonusPool,
            bonusPercent: stage.bonusPercent,
            fixedAmount: stage.fixedAmount,
            isIncremental: stage.isIncremental ?? false,
            churnRules: input.metricKind === "TEACHER_RETENTION_RATE" ? {
              create: (stage.churnRules ?? []).map((rule, ruleIndex) => ({
                sortOrder: ruleIndex,
                churnThreshold: rule.churnThreshold,
                deductionAmount: rule.deductionAmount,
              })),
            } : undefined,
          })),
        },
        participants: {
          create: participants.map((participant) => ({
            employeeId: participant.id,
            employeeName: participant.fullName,
            employeeEmail: participant.email,
          })),
        },
      },
    });
    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "hr.bonus.campaign.create",
      entityType: "hr_bonus_campaign",
      entityId: created.id,
      after: {
        name: input.name,
        department: input.department,
        metricKind: input.metricKind,
        distributionMode: input.distributionMode,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        recursMonthly: input.recursMonthly,
        requiredThreshold: hasPerUnitRule ? input.requiredThreshold : 0,
        perUnitBonusPercent: hasPerUnitRule ? input.perUnitBonusPercent : 0,
        perUnitBonusAmount: hasPerUnitRule ? input.perUnitBonusAmount : 0,
        stages,
        participantIds: participants.map((participant) => participant.id),
        participantCount: participants.length,
      } as Prisma.InputJsonValue,
      reason: "Bonus kampaniyası yaradıldı",
    });
    return created;
  });

  await syncBonusCampaign(campaign.id, actor.id);
  revalidateBonusPaths();
  return { id: campaign.id };
}

async function addBonusProgressAdjustmentActionImpl(formData: FormData) {
  const actor = await requireMutationActor("hr.bonus.manage");
  const input = z.object({
    campaignId: z.string().uuid(),
    amount: z.coerce.number().min(-1_000_000_000).max(1_000_000_000).refine((value) => value !== 0),
    reason: z.string().trim().min(3).max(500),
  }).parse(Object.fromEntries(formData));
  const adjustment = await getPrisma().$transaction(async (tx) => {
    const campaign = await tx.hrBonusCampaign.findUnique({ where: { id: input.campaignId }, select: { id: true, status: true, metricKind: true } });
    if (!campaign || campaign.status === "CANCELLED") throw new PublicActionError("Aktiv bonus kampaniyası tapılmadı", "NOT_FOUND");
    if (campaign.metricKind === "TEACHER_RETENTION_RATE") {
      throw new PublicActionError("Müəllim nəticəsi tələbə və churn məlumatından avtomatik hesablanır və manual dəyişdirilə bilməz", "CONFLICT");
    }
    const created = await tx.hrBonusProgressAdjustment.create({ data: { campaignId: campaign.id, amount: input.amount, reason: input.reason, createdById: actor.id } });
    await writeAuditLog(tx, { actorUserId: actor.id, action: "hr.bonus.progress.adjust", entityType: "hr_bonus_campaign", entityId: campaign.id, after: { amount: input.amount }, reason: input.reason });
    return created;
  });
  await syncBonusCampaign(adjustment.campaignId, actor.id);
  revalidateBonusPaths();
}

async function approveBonusStageAwardsActionImpl(formData: FormData) {
  const actor = await requireMutationActor("hr.bonus.approve");
  const stageId = z.string().uuid().parse(formData.get("stageId"));
  await getPrisma().$transaction(async (tx) => {
    const stage = await tx.hrBonusStage.findUnique({ where: { id: stageId }, include: { campaign: true } });
    if (!stage?.reachedAt) throw new PublicActionError("Açılmış bonus etapı tapılmadı", "NOT_FOUND");
    const result = await tx.hrBonusAward.updateMany({ where: { stageId, status: "PENDING_HR" }, data: { status: "APPROVED", approvedAt: new Date(), approvedById: actor.id } });
    await writeAuditLog(tx, { actorUserId: actor.id, action: "hr.bonus.awards.approve", entityType: "hr_bonus_stage", entityId: stageId, after: { approvedCount: result.count }, reason: `${stage.campaign.name} bonus payları təsdiqləndi` });
  });
  revalidateBonusPaths();
}

async function postBonusStageAwardsActionImpl(formData: FormData) {
  const actor = await requireMutationActor("billing.expense.create");
  const stageId = z.string().uuid().parse(formData.get("stageId"));
  await getPrisma().$transaction(async (tx) => {
    const stage = await tx.hrBonusStage.findUnique({
      where: { id: stageId },
      include: {
        campaign: true,
        awards: { where: { status: "APPROVED" }, include: { participant: true } },
      },
    });
    if (!stage?.reachedAt || stage.awards.length === 0) throw new PublicActionError("Maliyyəyə göndəriləcək təsdiqli bonus yoxdur", "NOT_FOUND");
    if (stage.awards.some((award) => !award.participant.employeeId)) throw new PublicActionError("Bonus iştirakçılarından birinin HR profili artıq mövcud deyil", "CONFLICT");

    const category = await tx.financeExpenseCategory.upsert({
      where: { code: "OP_BONUS_COMMISSION" },
      create: {
        code: "OP_BONUS_COMMISSION",
        name: "Bonus və komissiyalar",
        description: "Satış, performans bonusu və komissiyalar",
        transactionType: FinanceTransactionType.EXPENSE,
        financialClass: FinanceFinancialClass.OPEX,
        isActive: true,
        isSystem: true,
        requiresStaff: true,
      },
      update: { isActive: true, isSystem: true },
    });
    await tx.financeExpense.createMany({
      data: stage.awards.map((award) => ({
          categoryId: category.id,
          transactionType: FinanceTransactionType.EXPENSE,
          financialClass: FinanceFinancialClass.OPEX,
          costCenter: FinanceCostCenter.SALES,
          amount: award.amount,
          expenseDate: new Date(),
          method: PaymentMethod.BANK_TRANSFER,
          vendor: award.participant.employeeName,
          description: `${stage.campaign.name} · ${stage.sortOrder + 1}. etap bonusu`,
          hrEmployeeId: award.participant.employeeId,
          bonusAwardId: award.id,
          createdById: actor.id,
      })),
    });
    await tx.hrBonusAward.updateMany({
      where: { id: { in: stage.awards.map((award) => award.id) } },
      data: { status: "POSTED", postedAt: new Date() },
    });
    await writeAuditLog(tx, { actorUserId: actor.id, action: "hr.bonus.awards.post", entityType: "hr_bonus_stage", entityId: stage.id, after: { postedCount: stage.awards.length }, reason: "Təsdiqlənmiş bonuslar Maliyyə xərclərinə göndərildi" });
  });
  revalidateBonusPaths();
}

async function cancelBonusCampaignActionImpl(formData: FormData) {
  const actor = await requireMutationActor("hr.bonus.manage");
  const input = z.object({ campaignId: z.string().uuid(), reason: z.string().trim().min(3).max(500) }).parse(Object.fromEntries(formData));
  await getPrisma().$transaction(async (tx) => {
    const campaign = await tx.hrBonusCampaign.findUnique({ where: { id: input.campaignId }, include: { stages: { include: { awards: true } } } });
    if (!campaign) throw new PublicActionError("Bonus kampaniyası tapılmadı", "NOT_FOUND");
    if (campaign.stages.some((stage) => stage.awards.some((award) => award.status === "POSTED"))) throw new PublicActionError("Maliyyəyə göndərilmiş kampaniya ləğv edilə bilməz", "CONFLICT");
    await tx.hrBonusAward.updateMany({ where: { stage: { campaignId: campaign.id }, status: { in: ["PENDING_HR", "APPROVED"] } }, data: { status: "VOIDED", voidReason: input.reason } });
    await tx.hrBonusCampaign.update({ where: { id: campaign.id }, data: { status: "CANCELLED" } });
    await writeAuditLog(tx, { actorUserId: actor.id, action: "hr.bonus.campaign.cancel", entityType: "hr_bonus_campaign", entityId: campaign.id, before: { status: campaign.status }, after: { status: "CANCELLED" }, reason: input.reason });
  });
  revalidateBonusPaths();
}

async function deleteBonusCampaignActionImpl(formData: FormData) {
  const actor = await requireMutationActor("hr.bonus.manage");
  const input = z.object({
    campaignId: z.string().uuid(),
    reason: z.string().trim().min(3).max(500),
  }).parse(Object.fromEntries(formData));

  await getPrisma().$transaction(async (tx) => {
    const campaign = await tx.hrBonusCampaign.findUnique({
      where: { id: input.campaignId },
      include: {
        stages: {
          include: { awards: { select: { id: true, status: true } } },
        },
      },
    });
    if (!campaign) throw new PublicActionError("Bonus kampaniyası tapılmadı", "NOT_FOUND");

    const awardIds = campaign.stages.flatMap((stage) => stage.awards.map((award) => award.id));
    const postedExpenseCount = awardIds.length
      ? await tx.financeExpense.count({ where: { bonusAwardId: { in: awardIds } } })
      : 0;
    if (postedExpenseCount > 0) {
      throw new PublicActionError(
        "Maliyyəyə göndərilmiş bonus kampaniyası hüquqi maliyyə tarixçəsinə görə birdəfəlik silinə bilməz. Onu ləğv edin.",
        "CONFLICT",
      );
    }

    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "hr.bonus.campaign.delete",
      entityType: "hr_bonus_campaign",
      entityId: campaign.id,
      before: {
        name: campaign.name,
        department: campaign.department,
        startsAt: campaign.startsAt.toISOString(),
        endsAt: campaign.endsAt.toISOString(),
        status: campaign.status,
        stageCount: campaign.stages.length,
        awardCount: awardIds.length,
      },
      after: { permanentlyDeleted: true },
      reason: input.reason,
    });
    await tx.hrBonusCampaign.delete({ where: { id: campaign.id } });
  });
  revalidateBonusPaths();
}

async function refreshBonusCampaignsActionImpl() {
  const actor = await requireMutationActor("hr.bonus.manage");
  await syncActiveBonusCampaigns(actor.id);
  revalidateBonusPaths();
}

export const createBonusCampaignAction = safeServerAction(
  createBonusCampaignActionImpl,
  "Bonus kampaniyası yaradıla bilmədi.",
);
export const addBonusProgressAdjustmentAction = safeServerAction(
  addBonusProgressAdjustmentActionImpl,
  "Bonus göstəricisi yenilənə bilmədi.",
);
export const approveBonusStageAwardsAction = safeServerAction(
  approveBonusStageAwardsActionImpl,
  "Bonus təsdiqlənə bilmədi.",
);
export const postBonusStageAwardsAction = safeServerAction(
  postBonusStageAwardsActionImpl,
  "Bonus Maliyyəyə göndərilə bilmədi.",
);
export const cancelBonusCampaignAction = safeServerAction(
  cancelBonusCampaignActionImpl,
  "Bonus kampaniyası ləğv edilə bilmədi.",
);
export const deleteBonusCampaignAction = safeServerAction(
  deleteBonusCampaignActionImpl,
  "Bonus kampaniyası birdəfəlik silinə bilmədi.",
);
export const refreshBonusCampaignsAction = safeServerAction(
  refreshBonusCampaignsActionImpl,
  "Bonus məlumatları yenilənə bilmədi.",
);

function parseDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function revalidateBonusPaths() {
  revalidatePath("/hr");
  revalidatePath("/finance");
  revalidatePath("/", "layout");
}
