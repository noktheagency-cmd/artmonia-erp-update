import type { Prisma } from "@/generated/prisma/client";
import type { PermissionScope } from "@/generated/prisma/enums";

const NO_TEACHER_PROFILE_ID = "00000000-0000-0000-0000-000000000000";

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
