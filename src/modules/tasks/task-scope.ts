import type { Prisma } from "@/generated/prisma/client";
import { STUDENT_REMINDER_TASK_TYPES } from "@/modules/students/student-reminders";

export const CRM_TASK_TYPES = ["lead_follow_up"] as const;
export const CRM_TASK_ENTITY_TYPES = ["lead"] as const;
export const TASK_WORKSPACE_EXCLUDED_TYPES = [
  ...CRM_TASK_TYPES,
  ...STUDENT_REMINDER_TASK_TYPES,
] as const;

export function buildTaskWorkspaceWhere(ownerUserId?: string): Prisma.TaskWhereInput {
  return {
    ...(ownerUserId ? { ownerUserId } : {}),
    type: { notIn: [...TASK_WORKSPACE_EXCLUDED_TYPES] },
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
