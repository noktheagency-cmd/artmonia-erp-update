import type { Prisma } from "@/generated/prisma/client";
import type { PermissionScope } from "@/generated/prisma/enums";

const NO_TEACHER_PROFILE_ID = "00000000-0000-0000-0000-000000000000";

/**
 * Managers load every teacher in the filter UI, so slot reads must match.
 * ASSIGNED applies only to read-only teacher accounts without group.manage.
 */
export function resolvePlannerAccessScope(input: {
  readScope: PermissionScope | null | undefined;
  canManage: boolean;
}): PermissionScope {
  if (input.readScope === "ALL" || input.canManage) return "ALL";
  return "ASSIGNED";
}

/**
 * ASSIGNED access must fail closed. A missing teacher profile is an invalid
 * assignment state, not permission to fall back to the unfiltered directory.
 */
export function buildPlannerSlotScope(
  scope: PermissionScope,
  teacherId: string | undefined,
): Prisma.ClassSlotWhereInput {
  if (scope === "ALL") return {};
  return teacherId ? { teacherId } : { teacherId: NO_TEACHER_PROFILE_ID };
}
