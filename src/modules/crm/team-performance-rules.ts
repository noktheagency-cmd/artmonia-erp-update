import type { PermissionScope } from "@/server/rbac/permissions";

export type CrmTeamPerformanceAccess = "SALES_TEAM" | "SELF";

export const crmTeamVisibleHrStatuses = [
  "ACTIVE",
  "PROBATION",
  "ON_LEAVE",
] as const;

export function getCrmTeamPerformanceAccess(
  readScope: PermissionScope,
): CrmTeamPerformanceAccess {
  return readScope === "ALL" ? "SALES_TEAM" : "SELF";
}
