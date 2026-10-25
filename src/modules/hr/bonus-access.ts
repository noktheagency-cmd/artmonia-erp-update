import type { Prisma } from "@/generated/prisma/client";
import { scopeFor, type EffectivePermissions } from "@/server/rbac/permissions";

export function canReadAllBonuses(permissions: EffectivePermissions) {
  return permissions.has("hr.bonus.read")
    && (permissions.has("hr.bonus.manage") || scopeFor(permissions, "hr.bonus.read") === "ALL");
}

export function bonusParticipantReadWhere(canSeeAll: boolean, employeeId?: string): Prisma.HrBonusParticipantWhereInput {
  if (canSeeAll) return {};
  return employeeId ? { employeeId, isEligible: true } : { id: { in: [] } };
}

export function bonusCampaignReadWhere(canSeeAll: boolean, employeeId?: string): Prisma.HrBonusCampaignWhereInput {
  return canSeeAll ? {} : { participants: { some: bonusParticipantReadWhere(false, employeeId) } };
}

export function bonusAwardReadWhere(canSeeAll: boolean, employeeId?: string): Prisma.HrBonusAwardWhereInput {
  return canSeeAll ? {} : { participant: bonusParticipantReadWhere(false, employeeId) };
}

type CampaignValue = { baseValue: number; adjustmentValue: number; currentValue: number; scheduledValue: number };

export function visibleBonusValue(input: {
  canSeeAll: boolean;
  metricKind: string;
  aggregate: CampaignValue;
  ownMetric: number;
}): CampaignValue & { metricScope: "TEAM" | "PERSONAL" } {
  if (!input.canSeeAll && input.metricKind === "DEPARTMENT_SALES_COUNT") {
    return { baseValue: input.ownMetric, adjustmentValue: 0, currentValue: input.ownMetric, scheduledValue: 0, metricScope: "PERSONAL" };
  }
  return { ...input.aggregate, metricScope: "TEAM" };
}
