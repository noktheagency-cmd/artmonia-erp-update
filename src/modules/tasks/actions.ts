"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma, TaskPriority, TaskStatus } from "@/generated/prisma/client";
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
import { taskStatusUpdateSchema } from "@/modules/tasks/task-status-update";
import { taskEditSchema } from "@/modules/tasks/task-edit";

const createTaskSchema = z.object({
  title: z.string().trim().min(2, "Task adı çox qısadır").max(160),
  description: z.string().trim().max(2000, "Task açıqlaması 2000 simvoldan uzun ola bilməz").optional(),
  ownerUserIds: z.array(z.string().uuid()).min(1, "Ən azı bir əməkdaş seçin").max(50),
  dueDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  priority: z.nativeEnum(TaskPriority).default(TaskPriority.NORMAL),
});

const deleteTaskSchema = z.object({
  taskId: z.string().uuid(),
});

async function createTaskActionImpl(formData: FormData) {
  const actor = await requireMutationActor();
  await assertCanAdministerTasks(actor);
  const submittedOwnerIds = formData.getAll("ownerUserIds").map(String);
  const legacyOwnerId = formData.get("ownerUserId");
  const input = createTaskSchema.parse({
    ...Object.fromEntries(formData),
    ownerUserIds: [...new Set([
      ...submittedOwnerIds,
      ...(typeof legacyOwnerId === "string" && legacyOwnerId ? [legacyOwnerId] : []),
    ])],
  });
  const prisma = getPrisma();
  const dueAt = new Date(`${input.dueDate}T12:00:00.000Z`);

  const created = await prisma.$transaction(async (tx) => {
    const owners = await tx.user.findMany({
      where: {
        ...buildCurrentTaskAssigneeWhere(),
        id: { in: input.ownerUserIds },
      },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true },
    });

    if (owners.length !== input.ownerUserIds.length) {
      throw new PublicActionError("Seçilmiş əməkdaşlardan biri artıq aktiv deyil.", "NOT_FOUND");
    }

    const taskIds: string[] = [];
    for (const owner of owners) {
      const task = await tx.task.create({
        data: {
          title: input.title,
          description: input.description || null,
          type: "manual",
          ownerUserId: owner.id,
          dueAt,
          status: TaskStatus.OPEN,
          priority: input.priority,
          createdById: actor.id,
        },
        select: {
          id: true,
          title: true,
          description: true,
          ownerUserId: true,
          status: true,
          priority: true,
          dueAt: true,
          createdAt: true,
        },
      });

      await createAssignedTaskNotification(tx, { ...task, ownerUserId: owner.id });
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
          priority: task.priority,
          dueAt: task.dueAt?.toISOString() ?? null,
          createdAt: task.createdAt.toISOString(),
        } satisfies Prisma.InputJsonValue,
        reason: owners.length > 1 ? "Task bir neçə əməkdaşa yaradıldı" : "Task yaradıldı",
      });
      taskIds.push(task.id);
    }

    return { taskIds, recipientUserIds: owners.map((owner) => owner.id) };
  });

  await Promise.all(created.recipientUserIds.map(broadcastNotificationChange));
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  return { ids: created.taskIds };
}

async function updateTaskStatusActionImpl(formData: FormData) {
  const actor = await requireMutationActor("task.read");
  const input = taskStatusUpdateSchema.parse(Object.fromEntries(formData));
  const prisma = getPrisma();
  const canManageAnyTask = await canAdministerTasks(actor);

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
        completionNote: input.status === TaskStatus.DONE ? input.completionNote : null,
      },
      select: { id: true, status: true, completionNote: true },
    });

    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "task.status.update",
      entityType: "task",
      entityId: current.id,
      before: { status: current.status },
      after: {
        status: updated.status,
        completionNote: updated.completionNote,
      },
      reason: updated.status === TaskStatus.DONE ? "Task tamamlandı" : "Task statusu yeniləndi",
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
  const canManageAnyTask = canAdminister;

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

async function updateTaskActionImpl(formData: FormData) {
  const actor = await requireMutationActor();
  await assertCanAdministerTasks(actor);
  const input = taskEditSchema.parse(Object.fromEntries(formData));
  const reassignedTo = await getPrisma().$transaction(async (tx) => {
    const current = await tx.task.findFirst({ where: { id: input.taskId, ...buildTaskWorkspaceWhere() } });
    if (!current) throw new PublicActionError("Task tapılmadı.", "NOT_FOUND");
    if (current.ownerUserId !== input.ownerUserId && !await tx.user.findFirst({ where: buildCurrentTaskAssigneeWhere(input.ownerUserId), select: { id: true } })) {
      throw new PublicActionError("Seçilmiş əməkdaş artıq aktiv deyil.", "NOT_FOUND");
    }
    const updated = await tx.task.update({ where: { id: current.id }, data: {
      title: input.title, description: input.description || null, ownerUserId: input.ownerUserId,
      dueAt: new Date(`${input.dueDate}T12:00:00.000Z`), priority: input.priority,
    } });
    if (current.ownerUserId !== updated.ownerUserId) {
      await createAssignedTaskNotification(tx, {
        ...updated, ownerUserId: input.ownerUserId,
        assignmentKey: `task:${updated.id}:assigned:${input.ownerUserId}:${updated.updatedAt.toISOString()}`,
      });
    }
    const snapshot = (task: typeof current) => ({ title: task.title, description: task.description, ownerUserId: task.ownerUserId, dueAt: task.dueAt?.toISOString() ?? null, priority: task.priority });
    await writeAuditLog(tx, { actorUserId: actor.id, action: "task.update", entityType: "task", entityId: current.id, before: snapshot(current), after: snapshot(updated), reason: "Task məlumatları redaktə edildi" });
    return current.ownerUserId !== updated.ownerUserId ? input.ownerUserId : null;
  });
  if (reassignedTo) await broadcastNotificationChange(reassignedTo);
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
}

export const updateTaskAction = safeServerAction(updateTaskActionImpl, "Task yenilənmədi.");
