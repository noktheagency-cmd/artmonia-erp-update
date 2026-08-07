import type { AppRole } from "@/generated/prisma/client";

const protectedTeamRoleCodes = new Set<AppRole>(["SUPER_ADMIN", "ADMIN"]);

export function isProtectedTeamRole(code: AppRole | null | undefined) {
  return code != null && protectedTeamRoleCodes.has(code);
}
