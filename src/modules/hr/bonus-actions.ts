"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
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

const stageSchema = z.object({
  threshold: z.coerce.number().positive().max(1_000_000_000),
  bonusPool: z.coerce.number().nonnegative().max(1_000_000).default(0),
  bonusPercent: z.coerce.number().nonnegative().max(100).default(0),
  fixedAmount: z.coerce.number().nonnegative().max(1_000_000).default(0),
});

const createCampaignSchema = z.object({
  name: z.string().trim().min(3).max(120),
  department: z.string().trim().min(2).max(80),
  startsAt: z.string().date(),
  endsAt: z.string().date(),
  metricKind: z.enum(["DEPARTMENT_COLLECTED_REVENUE", "DEPARTMENT_SALES_COUNT", "TEACHER_RETENTION_RATE", "MANUAL_KPI"]),
  distributionMode: z.enum(["EQUAL", "HR_APPROVAL"]),
  teacherMinCohortSize: z.coerce.number().int().min(5).max(100).default(10),
  teacherMinTenureDays: z.coerce.number().int().min(0).max(90).default(14),
  teacherReferenceStudentCount: z.coerce.number().int().min(5).max(200).default(20),
  stages: z.string().transform((value, context) => {
    try {
      return z.array(stageSchema).parse(JSON.parse(value));
    } catch {
      context.addIssue({ code: "custom", message: "Bonus etapları düzgün deyil" });
      return z.NEVER;
    }
  }),
});

export async function createBonusCampaignAction(formData: FormData) {
  const actor = await requireMutationActor("hr.bonus.manage");
  const input = createCampaignSchema.parse(Object.fromEntries(formData));
  const stages = validateBonusStages(input.stages);
  const startsAt = parseDate(input.startsAt);
  const endsAt = parseDate(input.endsAt);
  if (endsAt < startsAt) throw new Error("Bitmə tarixi başlanğıc tarixindən əvvəl ola bilməz");
  if (input.metricKind === "DEPARTMENT_SALES_COUNT" && stages.some((stage) => !Number.isInteger(stage.threshold))) {
    throw new Error("Satış sayı hədəfləri tam ədəd olmalıdır");
  }
  if (input.metricKind === "TEACHER_RETENTION_RATE" && stages.some((stage) => stage.threshold > 100)) {
    throw new Error("Müəllim retention hədəfi 100%-dən böyük ola bilməz");
  }

  const prisma = getPrisma();
  const [overlap, participants] = await Promise.all([
    prisma.hrBonusCampaign.findFirst({
      where: {
        department: input.department,
        metricKind: input.metricKind as HrBonusMetricKind,
        status: { in: ["SCHEDULED", "ACTIVE"] },
        startsAt: { lte: endsAt },
        endsAt: { gte: startsAt },
      },
      select: { name: true },
    }),
    prisma.hrEmployee.findMany({
      where: {
        department: input.department,
        status: { in: ["ACTIVE", "PROBATION"] },
        ...(input.metricKind === "TEACHER_RETENTION_RATE" ? { teacherId: { not: null } } : {}),
      },
      select: { id: true, fullName: true, email: true },
      orderBy: { fullName: "asc" },
    }),
  ]);
  if (overlap) throw new Error(`Bu dövr üçün artıq “${overlap.name}” kampaniyası aktivdir`);
  if (participants.length === 0) throw new Error("Seçilmiş departamentdə uyğun əməkdaş yoxdur");

  const now = new Date();
  const campaign = await prisma.$transaction(async (tx) => {
    const created = await tx.hrBonusCampaign.create({
      data: {
        name: input.name,
        department: input.department,
        startsAt,
        endsAt,
        metricKind: input.metricKind as HrBonusMetricKind,
        distributionMode: input.distributionMode as HrBonusDistributionMode,
        teacherMinCohortSize: input.teacherMinCohortSize,
        teacherMinTenureDays: input.teacherMinTenureDays,
        teacherReferenceStudentCount: input.teacherReferenceStudentCount,
        status: startsAt > now ? "SCHEDULED" : "ACTIVE",
        createdById: actor.id,
        stages: {
          create: stages.map((stage, index) => ({
            sortOrder: index,
            threshold: stage.threshold,
            bonusPool: stage.bonusPool,
            bonusPercent: stage.bonusPercent,
            fixedAmount: stage.fixedAmount,
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
        stages,
        teacherPolicy: input.metricKind === "TEACHER_RETENTION_RATE" ? {
          minCohortSize: input.teacherMinCohortSize,
          minTenureDays: input.teacherMinTenureDays,
          referenceStudentCount: input.teacherReferenceStudentCount,
        } : null,
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

export async function addBonusProgressAdjustmentAction(formData: FormData) {
  const actor = await requireMutationActor("hr.bonus.manage");
  const input = z.object({
    campaignId: z.string().uuid(),
    amount: z.coerce.number().min(-1_000_000_000).max(1_000_000_000).refine((value) => value !== 0),
    reason: z.string().trim().min(3).max(500),
  }).parse(Object.fromEntries(formData));
  const adjustment = await getPrisma().$transaction(async (tx) => {
    const campaign = await tx.hrBonusCampaign.findUnique({ where: { id: input.campaignId }, select: { id: true, status: true, metricKind: true } });
    if (!campaign || campaign.status === "CANCELLED") throw new Error("Aktiv bonus kampaniyası tapılmadı");
    if (campaign.metricKind === "TEACHER_RETENTION_RATE") {
      throw new Error("Müəllim retention nəticəsi auditli lifecycle məlumatından hesablanır və manual dəyişdirilə bilməz");
    }
    const created = await tx.hrBonusProgressAdjustment.create({ data: { campaignId: campaign.id, amount: input.amount, reason: input.reason, createdById: actor.id } });
    await writeAuditLog(tx, { actorUserId: actor.id, action: "hr.bonus.progress.adjust", entityType: "hr_bonus_campaign", entityId: campaign.id, after: { amount: input.amount }, reason: input.reason });
    return created;
  });
  await syncBonusCampaign(adjustment.campaignId, actor.id);
  revalidateBonusPaths();
}

export async function approveBonusStageAwardsAction(formData: FormData) {
  const actor = await requireMutationActor("hr.bonus.approve");
  const stageId = z.string().uuid().parse(formData.get("stageId"));
  await getPrisma().$transaction(async (tx) => {
    const stage = await tx.hrBonusStage.findUnique({ where: { id: stageId }, include: { campaign: true } });
    if (!stage?.reachedAt) throw new Error("Açılmış bonus etapı tapılmadı");
    const result = await tx.hrBonusAward.updateMany({ where: { stageId, status: "PENDING_HR" }, data: { status: "APPROVED", approvedAt: new Date(), approvedById: actor.id } });
    await writeAuditLog(tx, { actorUserId: actor.id, action: "hr.bonus.awards.approve", entityType: "hr_bonus_stage", entityId: stageId, after: { approvedCount: result.count }, reason: `${stage.campaign.name} bonus payları təsdiqləndi` });
  });
  revalidateBonusPaths();
}

export async function postBonusStageAwardsAction(formData: FormData) {
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
    if (!stage?.reachedAt || stage.awards.length === 0) throw new Error("Maliyyəyə göndəriləcək təsdiqli bonus yoxdur");
    if (stage.awards.some((award) => !award.participant.employeeId)) throw new Error("Bonus iştirakçılarından birinin HR profili artıq mövcud deyil");

    const category = await tx.financeExpenseCategory.upsert({
      where: { name: "Əməkdaş bonusu" },
      create: { name: "Əməkdaş bonusu", description: "HR bonus kampaniyalarından təsdiqlənmiş ödənişlər", isSystem: true },
      update: { isSystem: true },
    });
    await tx.financeExpense.createMany({
      data: stage.awards.map((award) => ({
          categoryId: category.id,
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

export async function cancelBonusCampaignAction(formData: FormData) {
  const actor = await requireMutationActor("hr.bonus.manage");
  const input = z.object({ campaignId: z.string().uuid(), reason: z.string().trim().min(3).max(500) }).parse(Object.fromEntries(formData));
  await getPrisma().$transaction(async (tx) => {
    const campaign = await tx.hrBonusCampaign.findUnique({ where: { id: input.campaignId }, include: { stages: { include: { awards: true } } } });
    if (!campaign) throw new Error("Bonus kampaniyası tapılmadı");
    if (campaign.stages.some((stage) => stage.awards.some((award) => award.status === "POSTED"))) throw new Error("Maliyyəyə göndərilmiş kampaniya ləğv edilə bilməz");
    await tx.hrBonusAward.updateMany({ where: { stage: { campaignId: campaign.id }, status: { in: ["PENDING_HR", "APPROVED"] } }, data: { status: "VOIDED", voidReason: input.reason } });
    await tx.hrBonusCampaign.update({ where: { id: campaign.id }, data: { status: "CANCELLED" } });
    await writeAuditLog(tx, { actorUserId: actor.id, action: "hr.bonus.campaign.cancel", entityType: "hr_bonus_campaign", entityId: campaign.id, before: { status: campaign.status }, after: { status: "CANCELLED" }, reason: input.reason });
  });
  revalidateBonusPaths();
}

export async function refreshBonusCampaignsAction() {
  const actor = await requireMutationActor("hr.bonus.manage");
  await syncActiveBonusCampaigns(actor.id);
  revalidateBonusPaths();
}

function parseDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function revalidateBonusPaths() {
  revalidatePath("/hr");
  revalidatePath("/finance");
  revalidatePath("/", "layout");
}
