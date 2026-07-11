"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma, TaskStatus } from "@/generated/prisma/client";
import { writeAuditLog } from "@/modules/audit/audit-service";
import { getPrisma } from "@/server/db/prisma";
import { requireMutationActor } from "@/server/auth/actor";
import { scopeFor } from "@/server/rbac/permissions";

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

export async function createTaskAction(formData: FormData) {
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

export async function updateTaskStatusAction(formData: FormData) {
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
