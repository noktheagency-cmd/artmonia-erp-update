"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma, TaskStatus } from "@/generated/prisma/client";
import { writeAuditLog } from "@/modules/audit/audit-service";
import { getPrisma } from "@/server/db/prisma";
import { requireMutationActor } from "@/server/auth/actor";
import { scopeFor } from "@/server/rbac/permissions";
import { PublicActionError, safeServerAction } from "@/server/actions/safe-action";

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
  const actor = await requireMutationActor("task.manage");
  const input = createTaskSchema.parse(Object.fromEntries(formData));
  const prisma = getPrisma();
  const dueAt = new Date(`${input.dueDate}T12:00:00.000Z`);
  const manageScope = scopeFor(actor.permissions, "task.manage");
  const ownerUserId = manageScope === "ALL" ? input.ownerUserId : actor.id;

  await prisma.$transaction(async (tx) => {
    const owner = await tx.user.findFirst({
      where: { id: ownerUserId, isActive: true },
      select: { id: true, fullName: true },
    });

    if (!owner) {
      throw new Error("Seçilmiş işçi tapılmadı");
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
      select: { id: true, title: true, status: true, dueAt: true },
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
      } satisfies Prisma.InputJsonValue,
      reason: "Task yaradıldı",
    });
  });

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
}

async function updateTaskStatusActionImpl(formData: FormData) {
  const actor = await requireMutationActor("task.read");
  const input = updateStatusSchema.parse(Object.fromEntries(formData));
  const prisma = getPrisma();

  await prisma.$transaction(async (tx) => {
    const current = await tx.task.findUnique({
      where: { id: input.taskId },
      select: { id: true, ownerUserId: true, status: true },
    });

    if (!current) {
      throw new Error("Task tapılmadı");
    }

    const manageScope = scopeFor(actor.permissions, "task.manage");
    if (manageScope !== "ALL" && current.ownerUserId !== actor.id) {
      throw new Error("Bu taskın statusunu dəyişmək icazəniz yoxdur");
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
  const actor = await requireMutationActor("task.manage");
  const input = deleteTaskSchema.parse(Object.fromEntries(formData));
  const manageScope = scopeFor(actor.permissions, "task.manage");

  await getPrisma().$transaction(async (tx) => {
    const task = await tx.task.findUnique({
      where: { id: input.taskId },
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

    if (manageScope !== "ALL" && task.ownerUserId !== actor.id) {
      throw new PublicActionError("Bu taskı silmək icazəniz yoxdur.", "FORBIDDEN");
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
