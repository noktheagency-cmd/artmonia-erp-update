"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AppRole, Prisma, TaskStatus } from "@/generated/prisma/client";
import { writeAuditLog } from "@/modules/audit/audit-service";
import {
  broadcastNotificationChange,
  createAssignedTaskNotification,
} from "@/modules/notifications/notification-service";
import { getPrisma } from "@/server/db/prisma";
import { requireMutationActor } from "@/server/auth/actor";
import { PublicActionError, safeServerAction } from "@/server/actions/safe-action";
import {
  buildCurrentTaskAssigneeWhere,
  buildTaskWorkspaceWhere,
} from "@/modules/tasks/task-scope";
import {
  assertCanAdministerTasks,
  canAdministerTasks,
} from "@/modules/tasks/task-permissions";

const createTaskSchema = z.object({
  title: z.string().trim().min(2, "Task adı çox qısadır").max(160),
  description: z.string().trim().max(500).optional(),
  ownerUserId: z.string().uuid(),
  dueDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const updateStatusSchema = z.object({
  taskId: z.string().uuid(),
  status: z.nativeEnum(TaskStatus),
});

const deleteTaskSchema = z.object({
  taskId: z.string().uuid(),
});

async function createTaskActionImpl(formData: FormData) {
  const actor = await requireMutationActor();
  await assertCanAdministerTasks(actor);
  const input = createTaskSchema.parse(Object.fromEntries(formData));
  const prisma = getPrisma();
  const dueAt = new Date(`${input.dueDate}T12:00:00.000Z`);

  const created = await prisma.$transaction(async (tx) => {
    const owner = await tx.user.findFirst({
      where: buildCurrentTaskAssigneeWhere(input.ownerUserId),
      select: { id: true, fullName: true },
    });

    if (!owner) {
      throw new PublicActionError("Seçilmiş əməkdaş artıq aktiv deyil.", "NOT_FOUND");
    }

    const task = await tx.task.create({
      data: {
        title: input.title,
        description: input.description || null,
        type: "manual",
        ownerUserId: owner.id,
        dueAt,
        status: TaskStatus.OPEN,
        createdById: actor.id,
      },
      select: {
        id: true,
        title: true,
        description: true,
        ownerUserId: true,
        status: true,
        dueAt: true,
        createdAt: true,
      },
    });

    await createAssignedTaskNotification(tx, {
      ...task,
      ownerUserId: owner.id,
    });

    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "task.create",
      entityType: "task",
      entityId: task.id,
      after: {
        title: task.title,
        ownerUserId: owner.id,
        ownerName: owner.fullName,
        status: task.status,
        dueAt: task.dueAt?.toISOString() ?? null,
        createdAt: task.createdAt.toISOString(),
      } satisfies Prisma.InputJsonValue,
      reason: "Task yaradıldı",
    });

    return { taskId: task.id, recipientUserId: owner.id };
  });

  await broadcastNotificationChange(created.recipientUserId);
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  return { id: created.taskId };
}

async function updateTaskStatusActionImpl(formData: FormData) {
  const actor = await requireMutationActor("task.read");
  const input = updateStatusSchema.parse(Object.fromEntries(formData));
  const prisma = getPrisma();
  const canManageAnyTask = actor.roles.includes(AppRole.SUPER_ADMIN);

  await prisma.$transaction(async (tx) => {
    const current = await tx.task.findFirst({
      where: { id: input.taskId, ...buildTaskWorkspaceWhere() },
      select: { id: true, ownerUserId: true, status: true },
    });

    if (!current) {
      throw new Error("Task tapılmadı");
    }

    if (current.ownerUserId !== actor.id && !canManageAnyTask) {
      throw new PublicActionError(
        "Bu taskın statusunu dəyişmək icazəniz yoxdur.",
        "FORBIDDEN",
      );
    }

    const updated = await tx.task.update({
      where: { id: current.id },
      data: {
        status: input.status,
        completedAt: input.status === TaskStatus.DONE ? new Date() : null,
      },
      select: { id: true, status: true },
    });

    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "task.status.update",
      entityType: "task",
      entityId: current.id,
      before: { status: current.status },
      after: { status: updated.status },
      reason: "Task statusu yeniləndi",
    });
  });

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
}

async function deleteTaskActionImpl(formData: FormData) {
  const actor = await requireMutationActor();
  const canAdminister = await canAdministerTasks(actor);
  if (!canAdminister) await assertCanAdministerTasks(actor);
  const input = deleteTaskSchema.parse(Object.fromEntries(formData));
  const canManageAnyTask = actor.roles.includes(AppRole.SUPER_ADMIN);

  await getPrisma().$transaction(async (tx) => {
    const task = await tx.task.findFirst({
      where: {
        id: input.taskId,
        ...buildTaskWorkspaceWhere(canManageAnyTask ? undefined : actor.id),
      },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        dueAt: true,
        ownerUserId: true,
        createdById: true,
      },
    });

    if (!task) {
      throw new PublicActionError("Task tapılmadı.", "NOT_FOUND");
    }

    await tx.task.delete({ where: { id: task.id } });
    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "task.delete",
      entityType: "task",
      entityId: task.id,
      before: {
        ...task,
        dueAt: task.dueAt?.toISOString() ?? null,
      } satisfies Prisma.InputJsonValue,
      reason: "Task tamamilə silindi",
    });
  });

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
}

export const createTaskAction = safeServerAction(
  createTaskActionImpl,
  "Task yaradılmadı.",
);

export const updateTaskStatusAction = safeServerAction(
  updateTaskStatusActionImpl,
  "Task statusu yenilənmədi.",
);

export const deleteTaskAction = safeServerAction(
  deleteTaskActionImpl,
  "Task silinmədi.",
);
