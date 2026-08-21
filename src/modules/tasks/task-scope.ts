import type { Prisma } from "@/generated/prisma/client";

export const CRM_TASK_TYPES = ["lead_follow_up"] as const;
export const CRM_TASK_ENTITY_TYPES = ["lead"] as const;

export function buildTaskWorkspaceWhere(ownerUserId?: string): Prisma.TaskWhereInput {
  return {
    ...(ownerUserId ? { ownerUserId } : {}),
    type: { notIn: [...CRM_TASK_TYPES] },
    OR: [
      { entityType: null },
      { entityType: { notIn: [...CRM_TASK_ENTITY_TYPES] } },
    ],
  };
}

export function buildCurrentTaskAssigneeWhere(userId?: string): Prisma.UserWhereInput {
  return {
    ...(userId ? { id: userId } : {}),
    isActive: true,
    hrEmployeeProfile: {
      is: {
        status: { in: ["ACTIVE", "PROBATION"] },
        archivedAt: null,
      },
    },
  };
}
