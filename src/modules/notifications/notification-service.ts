import "server-only";

import {
  PersonalNotificationType,
  Prisma,
  TaskStatus,
} from "@/generated/prisma/client";
import { taskNotificationTypes } from "@/modules/notifications/notification-types";
import {
  buildTaskDeadlineDedupeKey,
  getTaskDeadlineStage,
} from "@/modules/notifications/notification-rules";
import { formatBakuDate } from "@/modules/notifications/notification-date";
import { getPrisma } from "@/server/db/prisma";
import { buildTaskWorkspaceWhere } from "@/modules/tasks/task-scope";
import { getSupabaseAdminClient } from "@/server/supabase/admin";

type NotificationTransaction = Prisma.TransactionClient;

type AssignedTaskNotificationInput = {
  id: string;
  title: string;
  description: string | null;
  ownerUserId: string;
  dueAt: Date | null;
  status: TaskStatus;
  assignmentKey?: string;
};

export async function createAssignedTaskNotification(
  tx: NotificationTransaction,
  task: AssignedTaskNotificationInput,
) {
  return tx.personalNotification.create({
    data: {
      recipientUserId: task.ownerUserId,
      type: PersonalNotificationType.TASK_ASSIGNED,
      title: "Yeni task təyin edildi",
      message: task.description
        ? `${task.title} · ${task.description}`
        : task.title,
      href: `/tasks?task=${task.id}`,
      relatedEntityType: "task",
      relatedEntityId: task.id,
      taskId: task.id,
      metadata: {
        taskTitle: task.title,
        deadline: task.dueAt?.toISOString() ?? null,
        status: task.status,
        stage: "assigned",
      },
      dedupeKey:
        task.assignmentKey ?? `task:${task.id}:assigned:${task.ownerUserId}`,
    },
    select: { id: true },
  });
}

export async function generateTaskDeadlineNotifications({
  recipientUserId,
  now = new Date(),
}: {
  recipientUserId?: string;
  now?: Date;
} = {}) {
  const prisma = getPrisma();
  const soonThreshold = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const tasks = await prisma.task.findMany({
    where: {
      ...buildTaskWorkspaceWhere(),
      ...(recipientUserId ? { ownerUserId: recipientUserId } : { ownerUserId: { not: null } }),
      dueAt: { not: null, lte: soonThreshold },
      status: { in: [TaskStatus.OPEN, TaskStatus.IN_PROGRESS] },
    },
    select: {
      id: true,
      title: true,
      ownerUserId: true,
      dueAt: true,
      status: true,
    },
    take: recipientUserId ? 500 : 5_000,
  });

  const candidates = tasks.flatMap((task) => {
    if (!task.ownerUserId || !task.dueAt) return [];
    const stage = getTaskDeadlineStage(task.dueAt, now);
    if (!stage) return [];
    const isOverdue = stage === "overdue";
    const type = isOverdue
      ? PersonalNotificationType.TASK_OVERDUE
      : PersonalNotificationType.TASK_DUE_SOON;

    return [{
      recipientUserId: task.ownerUserId,
      type,
      title: isOverdue
        ? "Task gecikib"
        : stage === "two-days"
          ? "Task deadline-na 2 gün qalıb"
          : "Task deadline-na 1 gün qalıb",
      message: `${task.title} · Deadline: ${formatBakuDate(task.dueAt)} · ${stage === "two-days" ? "2 gün qalıb" : stage === "one-day" ? "1 gün qalıb" : "gecikib"} · Status: ${task.status}`,
      href: `/tasks?task=${task.id}`,
      relatedEntityType: "task",
      relatedEntityId: task.id,
      taskId: task.id,
      metadata: {
        taskTitle: task.title,
        deadline: task.dueAt.toISOString(),
        status: task.status,
        stage,
      } satisfies Prisma.InputJsonValue,
      dedupeKey: buildTaskDeadlineDedupeKey({ taskId: task.id, dueAt: task.dueAt, stage }),
    }];
  });

  if (!candidates.length) return { created: 0, recipientUserIds: [] as string[] };

  let result: { count: number };
  try {
    result = await prisma.personalNotification.createMany({
      data: candidates,
      skipDuplicates: true,
    });
  } catch (error) {
    if (isPersonalNotificationSchemaMissing(error)) {
      return { created: 0, recipientUserIds: [] as string[] };
    }
    throw error;
  }
  const recipientUserIds = [...new Set(candidates.map((item) => item.recipientUserId))];

  if (result.count > 0) {
    await Promise.all(recipientUserIds.map(broadcastNotificationChange));
  }

  return { created: result.count, recipientUserIds };
}

export async function getUnreadNotificationCounts(recipientUserId: string) {
  const [personalCounts, hr] = await Promise.all([
    Promise.all([
      getPrisma().personalNotification.count({
        where: { recipientUserId, readAt: null },
      }),
      getPrisma().personalNotification.count({
        where: {
          recipientUserId,
          readAt: null,
          type: { in: [...taskNotificationTypes] },
        },
      }),
    ]).catch((error: unknown) => {
      if (isPersonalNotificationSchemaMissing(error)) return [0, 0] as const;
      throw error;
    }),
    getPrisma().hrStaffNotification.count({
      where: {
        employee: { userId: recipientUserId },
        status: "SENT",
      },
    }),
  ]);

  const [personal, tasks] = personalCounts;
  return { all: personal + hr, tasks };
}

export function isPersonalNotificationSchemaMissing(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String(error.code) : "";
  const message = "message" in error ? String(error.message) : "";
  return (code === "P2021" || code === "42P01") && message.includes("personal_notifications");
}

export async function broadcastNotificationChange(recipientUserId: string) {
  try {
    const client = getSupabaseAdminClient();
    const channel = client.channel(`app-notifications:${recipientUserId}`);
    await channel.httpSend("changed", {});
    await client.removeChannel(channel);
  } catch {
    // Polling is the fallback; the database write remains authoritative.
  }
}
