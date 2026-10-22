import { bonusProgress } from "@/modules/hr/bonus-rules";
import {
  calculateBonusCampaignValues,
  calculateCampaignParticipantMetrics,
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
  baseAmount: number;
  percentAmount: number;
  fixedAmount: number;
  workloadMultiplier: number;
  metricValue: number;
  calculationNote: string;
};

export type HrBonusStageDto = {
  id: string;
  sortOrder: number;
  threshold: number;
  bonusPool: number;
  bonusPercent: number;
  fixedAmount: number;
  isIncremental: boolean;
  churnRules: Array<{ id: string; churnThreshold: number; deductionAmount: number }>;
  reachedAt: string;
  reachedValue: number;
  awards: HrBonusAwardDto[];
};

export type HrBonusParticipantDto = {
  id: string;
  employeeId: string;
  employeeName: string;
  currentValue: number;
  progress: number;
  awardTotal: number;
  isActor: boolean;
};

export type HrBonusCampaignDto = {
  id: string;
  name: string;
  department: string;
  startsAt: string;
  endsAt: string;
  metricKind: "DEPARTMENT_COLLECTED_REVENUE" | "DEPARTMENT_SALES_COUNT" | "TEACHER_RETENTION_RATE" | "MANUAL_KPI";
  distributionMode: "EQUAL" | "HR_APPROVAL";
  status: "SCHEDULED" | "ACTIVE" | "ACHIEVED" | "EXPIRED" | "CANCELLED";
  recursMonthly: boolean;
  requiredThreshold: number;
  perUnitBonusPercent: number;
  perUnitBonusAmount: number;
  currentValue: number;
  scheduledValue?: number;
  baseValue: number;
  adjustmentValue: number;
  maxThreshold: number;
  progress: number;
  totalBonusPool: number;
  participantCount: number;
  ownAwardTotal: number;
  participants: HrBonusParticipantDto[];
  stages: HrBonusStageDto[];
};

export type HrBonusData = {
  asOf: string;
  campaigns: HrBonusCampaignDto[];
  departments: string[];
  teacherDepartments: string[];
  employees: Array<{ id: string; name: string; department: string; position: string; isTeacher: boolean }>;
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
      teacherDepartments: [],
      employees: [],
      actorDepartment: "",
      actorEmployeeId: "",
      permissions: { canManage: false, canApprove: false, canPost: false, canSeeAll: false },
    };
  }
  const prisma = getPrisma();
  const canManage = actor.permissions.has("hr.bonus.manage");
  const canApprove = actor.permissions.has("hr.bonus.approve");
  const canPost = actor.permissions.has("billing.expense.create");
  const canSeeAll = canManage || scopeFor(actor.permissions, "hr.bonus.read") === "ALL";
  const [actorEmployee, departmentRows, teacherDepartmentRows, employeeRows] = await Promise.all([
    prisma.hrEmployee.findUnique({ where: { userId: actor.id }, select: { id: true, department: true, teacherId: true } }),
    canManage
      ? prisma.hrEmployee.findMany({ where: { archivedAt: null, status: { in: ["ACTIVE", "PROBATION"] } }, distinct: ["department"], select: { department: true }, orderBy: { department: "asc" } })
      : Promise.resolve([]),
    canManage
      ? prisma.hrEmployee.findMany({
          where: { teacherId: { not: null }, status: { in: ["ACTIVE", "PROBATION"] } },
          distinct: ["department"],
          select: { department: true },
          orderBy: { department: "asc" },
        })
      : Promise.resolve([]),
    canManage
      ? prisma.hrEmployee.findMany({
          where: { archivedAt: null, status: { in: ["ACTIVE", "PROBATION"] } },
          select: { id: true, fullName: true, department: true, position: true, teacherId: true },
          orderBy: [{ department: "asc" }, { fullName: "asc" }],
        })
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
          churnRules: { orderBy: { sortOrder: "asc" } },
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

  const values = await calculateBonusCampaignValues(campaigns);
  const participantMetricMaps = await Promise.all(
    campaigns.map((campaign) => calculateCampaignParticipantMetrics(campaign.id, campaign.metricKind)),
  );
  return {
    asOf: new Date().toISOString(),
    campaigns: campaigns.map((campaign, campaignIndex) => {
      const value = values.get(campaign.id) ?? {
        baseValue: 0,
        adjustmentValue: 0,
        currentValue: 0,
        scheduledValue: 0,
      };
      const maxThreshold = Number(campaign.stages.at(-1)?.threshold ?? 0);
      const participantMetrics = participantMetricMaps[campaignIndex] ?? new Map<string, number>();
      const ownParticipant = campaign.participants.find((participant) => participant.employeeId === actorEmployee?.id);
      const eligibleParticipants = campaign.participants.filter((participant) => participant.isEligible);
      const participants = eligibleParticipants
        .map((participant) => {
          const currentValue = participantMetrics.get(participant.id) ?? 0;
          const awardTotal = participant.awards
            .filter((award) => award.status !== "VOIDED")
            .reduce((sum, award) => sum + Number(award.amount), 0);
          return {
            id: participant.id,
            employeeId: participant.employeeId ?? "",
            employeeName: participant.employeeName,
            currentValue,
            progress: bonusProgress(currentValue, maxThreshold),
            awardTotal,
            isActor: participant.employeeId === actorEmployee?.id,
          };
        })
        .sort((left, right) => right.progress - left.progress || left.employeeName.localeCompare(right.employeeName, "az"));
      return {
        id: campaign.id,
        name: campaign.name,
        department: campaign.department,
        startsAt: dateInput(campaign.startsAt),
        endsAt: dateInput(campaign.endsAt),
        metricKind: campaign.metricKind,
        distributionMode: campaign.distributionMode,
        status: campaign.status,
        recursMonthly: campaign.recursMonthly,
        requiredThreshold: Number(campaign.requiredThreshold),
        perUnitBonusPercent: Number(campaign.perUnitBonusPercent),
        perUnitBonusAmount: Number(campaign.perUnitBonusAmount),
        currentValue: value.currentValue,
        scheduledValue: value.scheduledValue,
        baseValue: value.baseValue,
        adjustmentValue: value.adjustmentValue,
        maxThreshold,
        progress: bonusProgress(value.currentValue, maxThreshold),
        totalBonusPool: campaign.stages.reduce((sum, stage) => sum + Number(stage.bonusPool), 0),
        participantCount: eligibleParticipants.length,
        ownAwardTotal: ownParticipant?.awards
          .filter((award) => award.status !== "VOIDED")
          .reduce((sum, award) => sum + Number(award.amount), 0) ?? 0,
        participants,
        stages: campaign.stages.map((stage) => ({
          id: stage.id,
          sortOrder: stage.sortOrder,
          threshold: Number(stage.threshold),
          bonusPool: Number(stage.bonusPool),
          bonusPercent: Number(stage.bonusPercent),
          fixedAmount: Number(stage.fixedAmount),
          isIncremental: stage.isIncremental,
          churnRules: stage.churnRules.map((rule) => ({
            id: rule.id,
            churnThreshold: rule.churnThreshold,
            deductionAmount: Number(rule.deductionAmount),
          })),
          reachedAt: stage.reachedAt?.toISOString() ?? "",
          reachedValue: Number(stage.reachedValue ?? 0),
          awards: canManage || canApprove || canPost
            ? stage.awards.map((award) => ({
                id: award.id,
                employeeName: award.participant.employeeName,
                employeeId: award.participant.employeeId ?? "",
                amount: Number(award.amount),
                status: award.status,
                baseAmount: Number(award.baseAmount),
                percentAmount: Number(award.percentAmount),
                fixedAmount: Number(award.fixedAmount),
                workloadMultiplier: Number(award.workloadMultiplier),
                metricValue: Number(award.metricValue ?? 0),
                calculationNote: award.calculationNote ?? "",
              }))
            : [],
        })),
      };
    }),
    departments: canManage
      ? [...new Set(departmentRows.map((row) => normalizeDepartment(row.department, false)))]
      : actorEmployee
        ? [normalizeDepartment(actorEmployee.department, Boolean(actorEmployee.teacherId))]
        : [],
    teacherDepartments: canManage
      ? [...new Set(teacherDepartmentRows.map((row) => normalizeDepartment(row.department, true)))]
      : actorEmployee?.teacherId
        ? [normalizeDepartment(actorEmployee.department, true)]
        : [],
    employees: employeeRows.map((employee) => ({
      id: employee.id,
      name: employee.fullName,
      department: normalizeDepartment(employee.department, Boolean(employee.teacherId)),
      position: employee.position,
      isTeacher: Boolean(employee.teacherId),
    })),
    actorDepartment: actorEmployee
      ? normalizeDepartment(actorEmployee.department, Boolean(actorEmployee.teacherId))
      : "",
    actorEmployeeId: actorEmployee?.id ?? "",
    permissions: { canManage, canApprove, canPost, canSeeAll },
  };
}

function normalizeDepartment(value: string, isTeacher: boolean) {
  return value === "__new" ? (isTeacher ? "Tədris" : "Ümumi") : value;
}

function dateInput(value: Date) {
  return value.toISOString().slice(0, 10);
}
