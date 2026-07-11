import { bonusProgress } from "@/modules/hr/bonus-rules";
import {
  calculateBonusCampaignValue,
  syncActiveBonusCampaigns,
} from "@/modules/hr/bonus-service";
import { requireErpActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";
import { scopeFor } from "@/server/rbac/permissions";

export type HrBonusAwardDto = {
  id: string;
  employeeName: string;
  employeeId: string;
  amount: number;
  status: "PENDING_HR" | "APPROVED" | "POSTED" | "VOIDED";
};

export type HrBonusStageDto = {
  id: string;
  sortOrder: number;
  threshold: number;
  bonusPool: number;
  reachedAt: string;
  reachedValue: number;
  awards: HrBonusAwardDto[];
};

export type HrBonusCampaignDto = {
  id: string;
  name: string;
  department: string;
  startsAt: string;
  endsAt: string;
  metricKind: "DEPARTMENT_COLLECTED_REVENUE" | "DEPARTMENT_SALES_COUNT" | "MANUAL_KPI";
  distributionMode: "EQUAL" | "HR_APPROVAL";
  status: "SCHEDULED" | "ACTIVE" | "ACHIEVED" | "EXPIRED" | "CANCELLED";
  currentValue: number;
  baseValue: number;
  adjustmentValue: number;
  maxThreshold: number;
  progress: number;
  totalBonusPool: number;
  participantCount: number;
  ownAwardTotal: number;
  stages: HrBonusStageDto[];
};

export type HrBonusData = {
  asOf: string;
  campaigns: HrBonusCampaignDto[];
  departments: string[];
  actorDepartment: string;
  actorEmployeeId: string;
  permissions: {
    canManage: boolean;
    canApprove: boolean;
    canPost: boolean;
    canSeeAll: boolean;
  };
};

export async function getHrBonusData(): Promise<HrBonusData> {
  const actor = await requireErpActor();
  if (!actor.permissions.has("hr.bonus.read")) {
    return {
      asOf: new Date().toISOString(),
      campaigns: [],
      departments: [],
      actorDepartment: "",
      actorEmployeeId: "",
      permissions: { canManage: false, canApprove: false, canPost: false, canSeeAll: false },
    };
  }
  await syncActiveBonusCampaigns(actor.id);

  const prisma = getPrisma();
  const canManage = actor.permissions.has("hr.bonus.manage");
  const canApprove = actor.permissions.has("hr.bonus.approve");
  const canPost = actor.permissions.has("billing.expense.create");
  const canSeeAll = canManage || scopeFor(actor.permissions, "hr.bonus.read") === "ALL";
  const [actorEmployee, departmentRows] = await Promise.all([
    prisma.hrEmployee.findUnique({ where: { userId: actor.id }, select: { id: true, department: true } }),
    canManage
      ? prisma.hrEmployee.findMany({ distinct: ["department"], select: { department: true }, orderBy: { department: "asc" } })
      : Promise.resolve([]),
  ]);

  const campaigns = await prisma.hrBonusCampaign.findMany({
    where: canSeeAll
      ? {}
      : actorEmployee
        ? { department: actorEmployee.department }
        : { id: "__no_access__" },
    include: {
      adjustments: { select: { amount: true } },
      participants: {
        orderBy: { employeeName: "asc" },
        include: { awards: { select: { id: true, amount: true, status: true, stageId: true } } },
      },
      stages: {
        orderBy: { sortOrder: "asc" },
        include: {
          awards: {
            include: { participant: { select: { employeeId: true, employeeName: true } } },
            orderBy: { participant: { employeeName: "asc" } },
          },
        },
      },
    },
    orderBy: [{ status: "asc" }, { startsAt: "desc" }],
    take: 60,
  });

  const values = await Promise.all(campaigns.map((campaign) => calculateBonusCampaignValue(campaign.id)));
  return {
    asOf: new Date().toISOString(),
    campaigns: campaigns.map((campaign, index) => {
      const value = values[index];
      const maxThreshold = Number(campaign.stages.at(-1)?.threshold ?? 0);
      const ownParticipant = campaign.participants.find((participant) => participant.employeeId === actorEmployee?.id);
      return {
        id: campaign.id,
        name: campaign.name,
        department: campaign.department,
        startsAt: dateInput(campaign.startsAt),
        endsAt: dateInput(campaign.endsAt),
        metricKind: campaign.metricKind,
        distributionMode: campaign.distributionMode,
        status: campaign.status,
        currentValue: value.currentValue,
        baseValue: value.baseValue,
        adjustmentValue: value.adjustmentValue,
        maxThreshold,
        progress: bonusProgress(value.currentValue, maxThreshold),
        totalBonusPool: campaign.stages.reduce((sum, stage) => sum + Number(stage.bonusPool), 0),
        participantCount: campaign.participants.filter((participant) => participant.isEligible).length,
        ownAwardTotal: ownParticipant?.awards
          .filter((award) => award.status !== "VOIDED")
          .reduce((sum, award) => sum + Number(award.amount), 0) ?? 0,
        stages: campaign.stages.map((stage) => ({
          id: stage.id,
          sortOrder: stage.sortOrder,
          threshold: Number(stage.threshold),
          bonusPool: Number(stage.bonusPool),
          reachedAt: stage.reachedAt?.toISOString() ?? "",
          reachedValue: Number(stage.reachedValue ?? 0),
          awards: canManage || canApprove || canPost
            ? stage.awards.map((award) => ({
                id: award.id,
                employeeName: award.participant.employeeName,
                employeeId: award.participant.employeeId ?? "",
                amount: Number(award.amount),
                status: award.status,
              }))
            : [],
        })),
      };
    }),
    departments: canManage
      ? departmentRows.map((row) => row.department)
      : actorEmployee
        ? [actorEmployee.department]
        : [],
    actorDepartment: actorEmployee?.department ?? "",
    actorEmployeeId: actorEmployee?.id ?? "",
    permissions: { canManage, canApprove, canPost, canSeeAll },
  };
}

function dateInput(value: Date) {
  return value.toISOString().slice(0, 10);
}
