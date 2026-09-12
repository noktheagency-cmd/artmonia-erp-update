import { randomUUID } from "node:crypto";
import type { Prisma, TaskStatus } from "@/generated/prisma/client";
import { taskStatusLabels } from "./notification-types";

// Only these ERP identities receive status updates, regardless of role/name changes.
export const taskStatusRecipientIds = [
  "d0fb9ad2-ec06-4bc6-8dc9-5c037775486a", // İsmet
  "f74ddcf3-fed2-4d36-86e5-5e75ab94f225", // Vaqif
] as const;

type StatusChange = {
  taskId: string;
  taskTitle: string;
  createdById: string | null;
  previousStatus: TaskStatus;
  status: TaskStatus;
  actorId: string;
  actorName: string;
};

type NotificationDb = {
  user: {
    findMany(args: {
      where: { id: { in: string[] }; isActive: true };
      select: { id: true };
    }): Promise<{ id: string }[]>;
  };
  personalNotification: {
    createMany(args: { data: Prisma.PersonalNotificationCreateManyInput[] }): Promise<{ count: number }>;
  };
};

export async function createTaskStatusNotifications(
  tx: NotificationDb,
  change: StatusChange,
) {
  if (change.previousStatus === change.status
    || !taskStatusRecipientIds.some((id) => id === change.createdById)) return [];

  const recipients = await tx.user.findMany({
    where: { id: { in: [...taskStatusRecipientIds] }, isActive: true },
    select: { id: true },
  });
  if (!recipients.length) return [];

  // Each real transition is distinct, including a later return to an earlier status.
  const eventId = randomUUID();
  await tx.personalNotification.createMany({
    data: recipients.map(({ id }) => ({
      recipientUserId: id,
      type: "SYSTEM",
      title: "Taskın statusu dəyişdi",
      message: `${change.taskTitle} · ${taskStatusLabels[change.previousStatus]} → ${taskStatusLabels[change.status]} · Dəyişən: ${change.actorName}`,
      href: `/tasks?task=${change.taskId}`,
      relatedEntityType: "task",
      relatedEntityId: change.taskId,
      taskId: change.taskId,
      metadata: {
        taskTitle: change.taskTitle,
        previousStatus: change.previousStatus,
        status: change.status,
        actorUserId: change.actorId,
        stage: "status-changed",
      },
      dedupeKey: `task:${change.taskId}:status:${eventId}:${id}`,
    })),
  });
  return recipients.map(({ id }) => id);
}
