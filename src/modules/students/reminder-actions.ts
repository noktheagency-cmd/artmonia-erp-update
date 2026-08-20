"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma, TaskStatus } from "@/generated/prisma/client";
import { writeAuditLog } from "@/modules/audit/audit-service";
import {
  broadcastNotificationChange,
  createAssignedTaskNotification,
} from "@/modules/notifications/notification-service";
import {
  getBakuDateInput,
  getStudentReminderKind,
  parseStudentReminderDate,
  STUDENT_REMINDER_ENTITY_TYPE,
  studentReminderKinds,
  studentReminderMeta,
} from "@/modules/students/student-reminders";
import { PublicActionError, safeServerAction } from "@/server/actions/safe-action";
import { requireMutationActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";
import { scopeFor } from "@/server/rbac/permissions";

const createReminderSchema = z.object({
  idempotencyKey: z.string().uuid(),
  studentId: z.string().uuid(),
  kind: z.enum(studentReminderKinds),
  reminderDate: z.string().trim().min(1).max(20),
  note: z.string().trim().min(2, "Qeyd çox qısadır").max(500),
});

const completeReminderSchema = z.object({
  reminderId: z.string().uuid(),
  studentId: z.string().uuid(),
});

async function createStudentReminderActionImpl(formData: FormData) {
  const actor = await requireMutationActor("task.manage");
  const input = createReminderSchema.parse(Object.fromEntries(formData));

  if (!actor.permissions.has("student.read")) {
    throw new PublicActionError("Tələbə məlumatlarını görmək icazəniz yoxdur.", "FORBIDDEN");
  }
  const studentReadScope = scopeFor(actor.permissions, "student.read");
  const taskManageScope = scopeFor(actor.permissions, "task.manage");

  const dueAt = parseStudentReminderDate(input.reminderDate);
  const today = parseStudentReminderDate(getBakuDateInput());
  if (dueAt < today) {
    throw new PublicActionError("Xatırlatma üçün keçmiş tarix seçilə bilməz.");
  }

  const prisma = getPrisma();
  const existing = await prisma.task.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    select: { id: true, entityType: true, entityId: true, type: true, ownerUserId: true },
  });

  if (existing) {
    if (
      existing.entityType !== STUDENT_REMINDER_ENTITY_TYPE ||
      existing.entityId !== input.studentId ||
      !getStudentReminderKind(existing.type)
    ) {
      throw new PublicActionError("Bu əməliyyat artıq başqa məlumat üçün istifadə edilib.");
    }
    if (taskManageScope !== "ALL" && existing.ownerUserId !== actor.id) {
      throw new PublicActionError("Bu xatırlatmaya giriş icazəniz yoxdur.", "FORBIDDEN");
    }
    if (studentReadScope !== "ALL") {
      const assignedStudent = await prisma.student.findFirst({
        where: { id: input.studentId, managerId: actor.id },
        select: { id: true },
      });
      if (!assignedStudent) {
        throw new PublicActionError("Bu tələbə üçün bildiriş yaratmaq icazəniz yoxdur.", "FORBIDDEN");
      }
    }

    return { reminderId: existing.id };
  }

  const reminderMeta = studentReminderMeta[input.kind];

  let reminderId: string;
  let createdRecipientUserId: string | null = null;

  try {
    reminderId = await prisma.$transaction(async (tx) => {
      const student = await tx.student.findUnique({
        where: { id: input.studentId },
        select: {
          id: true,
          code: true,
          managerId: true,
          contact: { select: { fullName: true } },
        },
      });

      if (!student) {
        throw new PublicActionError("Tələbə tapılmadı.", "NOT_FOUND");
      }
      if (studentReadScope !== "ALL" && student.managerId !== actor.id) {
        throw new PublicActionError("Bu tələbə üçün bildiriş yaratmaq icazəniz yoxdur.", "FORBIDDEN");
      }

      const reminder = await tx.task.create({
        data: {
          title:
            input.kind === "PAYMENT"
              ? `Ödəniş izləməsi · ${student.contact.fullName}`
              : `Tələbə ilə əlaqə · ${student.contact.fullName}`,
          description: input.note,
          type: reminderMeta.taskType,
          entityType: STUDENT_REMINDER_ENTITY_TYPE,
          entityId: student.id,
          ownerUserId: actor.id,
          status: TaskStatus.OPEN,
          dueAt,
          idempotencyKey: input.idempotencyKey,
          createdById: actor.id,
        },
        select: {
          id: true,
          title: true,
          description: true,
          type: true,
          ownerUserId: true,
          dueAt: true,
          status: true,
        },
      });

      await createAssignedTaskNotification(tx, {
        id: reminder.id,
        title: reminder.title,
        description: reminder.description,
        ownerUserId: actor.id,
        dueAt: reminder.dueAt,
        status: reminder.status,
      });
      createdRecipientUserId = actor.id;

      await writeAuditLog(tx, {
        actorUserId: actor.id,
        action: "student.reminder.create",
        entityType: STUDENT_REMINDER_ENTITY_TYPE,
        entityId: student.id,
        after: {
          reminderId: reminder.id,
          kind: input.kind,
          taskType: reminder.type,
          dueAt: reminder.dueAt?.toISOString() ?? null,
          status: reminder.status,
        } satisfies Prisma.InputJsonValue,
        reason: input.note,
      });

      return reminder.id;
    });
  } catch (error) {
    const recovered = await prisma.task.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      select: { id: true, entityType: true, entityId: true, type: true, ownerUserId: true },
    });

    if (
      !recovered ||
      recovered.entityType !== STUDENT_REMINDER_ENTITY_TYPE ||
      recovered.entityId !== input.studentId ||
      !getStudentReminderKind(recovered.type) ||
      (taskManageScope !== "ALL" && recovered.ownerUserId !== actor.id)
    ) {
      throw error;
    }

    reminderId = recovered.id;
  }

  if (createdRecipientUserId) {
    await broadcastNotificationChange(createdRecipientUserId);
  }
  revalidateStudentReminderPaths(input.studentId);
  return { reminderId };
}

async function completeStudentReminderActionImpl(formData: FormData) {
  const actor = await requireMutationActor("task.manage");
  const input = completeReminderSchema.parse(Object.fromEntries(formData));
  const manageScope = scopeFor(actor.permissions, "task.manage");

  if (!actor.permissions.has("student.read")) {
    throw new PublicActionError("Tələbə məlumatlarını görmək icazəniz yoxdur.", "FORBIDDEN");
  }
  const studentReadScope = scopeFor(actor.permissions, "student.read");

  await getPrisma().$transaction(async (tx) => {
    const reminder = await tx.task.findUnique({
      where: { id: input.reminderId },
      select: {
        id: true,
        entityType: true,
        entityId: true,
        type: true,
        status: true,
        ownerUserId: true,
      },
    });

    if (
      !reminder ||
      reminder.entityType !== STUDENT_REMINDER_ENTITY_TYPE ||
      reminder.entityId !== input.studentId ||
      !getStudentReminderKind(reminder.type)
    ) {
      throw new PublicActionError("Xatırlatma tapılmadı.", "NOT_FOUND");
    }

    if (manageScope !== "ALL" && reminder.ownerUserId !== actor.id) {
      throw new PublicActionError("Bu xatırlatmanı tamamlamaq icazəniz yoxdur.", "FORBIDDEN");
    }
    if (studentReadScope !== "ALL") {
      const assignedStudent = await tx.student.findFirst({
        where: { id: input.studentId, managerId: actor.id },
        select: { id: true },
      });

      if (!assignedStudent) {
        throw new PublicActionError(
          "Bu tələbənin bildirişini tamamlamaq icazəniz yoxdur.",
          "FORBIDDEN",
        );
      }
    }

    if (reminder.status === TaskStatus.DONE) {
      return;
    }

    if (reminder.status === TaskStatus.CANCELLED) {
      throw new PublicActionError("Ləğv edilmiş xatırlatma tamamlana bilməz.");
    }

    await tx.task.update({
      where: { id: reminder.id },
      data: { status: TaskStatus.DONE, completedAt: new Date() },
    });
    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "student.reminder.complete",
      entityType: STUDENT_REMINDER_ENTITY_TYPE,
      entityId: input.studentId,
      before: { reminderId: reminder.id, status: reminder.status },
      after: { reminderId: reminder.id, status: TaskStatus.DONE },
      reason: "Tələbə xatırlatması tamamlandı",
    });
  });

  revalidateStudentReminderPaths(input.studentId);
  return { reminderId: input.reminderId };
}

function revalidateStudentReminderPaths(studentId: string) {
  revalidatePath("/students");
  revalidatePath(`/students/${studentId}`);
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
}

export const createStudentReminderAction = safeServerAction(
  createStudentReminderActionImpl,
  "Xatırlatma yaradılmadı.",
);

export const completeStudentReminderAction = safeServerAction(
  completeStudentReminderActionImpl,
  "Xatırlatma tamamlanmadı.",
);
