"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import {
  EnrollmentStatus,
  LessonStatus,
  StudentLifecycleStatus,
} from "@/generated/prisma/client";
import type { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/server/db/prisma";
import { requireMutationActor } from "@/server/auth/actor";
import { writeAuditLog } from "@/modules/audit/audit-service";
import { erpCacheTags } from "@/modules/shared/cache-tags";
import {
  buildStudentStatusUpdateData,
  syncActivationBilling,
} from "@/modules/students/lifecycle-service";

const optionalText = (max: number) =>
  z.preprocess(
    (value) => {
      if (typeof value !== "string") {
        return undefined;
      }

      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    },
    z.string().max(max).optional()
  );

const reservationSchema = z.object({
  studentId: z.string().uuid(),
  bookingDate: z.string().trim().min(1).max(20),
  bookingTime: z.string().trim().regex(/^\d{2}:\d{2}$/),
  durationMinutes: z.preprocess(
    (value) => Number.parseInt(String(value), 10),
    z.number().int().min(30).max(300)
  ),
  room: z.string().trim().min(1).max(80),
  note: optionalText(500),
});

const attendanceSchema = z.object({
  lessonId: z.string().uuid(),
  status: z.enum(["attended", "absent"]),
});

export async function createLessonReservationAction(formData: FormData) {
  const actor = await requireMutationActor("student.status.change");
  const input = reservationSchema.parse(Object.fromEntries(formData));
  const lessonDate = parseDateInput(input.bookingDate, "Dərs tarixi");
  const prisma = getPrisma();

  await prisma.$transaction(async (tx) => {
    const student = await tx.student.findUnique({
      where: { id: input.studentId },
      select: {
        id: true,
        code: true,
        lifecycleStatus: true,
        billingPaused: true,
        enrollments: {
          where: {
            status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.PAUSED] },
          },
          orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
          take: 1,
          select: {
            id: true,
            teacherId: true,
          },
        },
      },
    });

    if (!student) {
      throw new Error("Tələbə tapılmadı");
    }

    const enrollment = student.enrollments[0];
    if (!enrollment) {
      throw new Error("Bron yaratmaq üçün tələbənin enrollment məlumatı tapılmadı");
    }

    const existingSlot = await tx.lesson.findFirst({
      where: {
        lessonDate,
        startTime: input.bookingTime,
        room: input.room,
        status: { not: LessonStatus.CANCELLED },
      },
      select: { id: true },
    });

    if (existingSlot) {
      throw new Error("Bu otaq və saat üçün artıq bron var");
    }

    const lesson = await tx.lesson.create({
      data: {
        studentId: student.id,
        enrollmentId: enrollment.id,
        teacherId: enrollment.teacherId,
        lessonDate,
        startTime: input.bookingTime,
        durationMinutes: input.durationMinutes,
        room: input.room,
        note: input.note ?? null,
        status: LessonStatus.RESERVED,
        createdById: actor.id,
      },
      select: {
        id: true,
        studentId: true,
        enrollmentId: true,
        teacherId: true,
        lessonDate: true,
        startTime: true,
        room: true,
        status: true,
      },
    });

    if (student.lifecycleStatus === StudentLifecycleStatus.GROUP_WAITING) {
      await activateStudentFromReservation(tx, {
        actorId: actor.id,
        studentId: student.id,
        studentCode: student.code,
        oldStatus: student.lifecycleStatus,
        oldBillingPaused: student.billingPaused,
        effectiveAt: lessonDate,
      });
    }

    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "lesson.reservation.create",
      entityType: "lesson",
      entityId: lesson.id,
      after: {
        studentId: lesson.studentId,
        enrollmentId: lesson.enrollmentId,
        teacherId: lesson.teacherId,
        lessonDate: lesson.lessonDate.toISOString(),
        startTime: lesson.startTime,
        room: lesson.room,
        status: lesson.status,
      } satisfies Prisma.InputJsonValue,
      reason: input.note ?? "Dərs bronu yaradıldı",
    });
  });

  revalidateBookingSurfaces(input.studentId);
}

export async function markLessonAttendanceAction(formData: FormData) {
  const actor = await requireMutationActor("student.status.change");
  const input = attendanceSchema.parse(Object.fromEntries(formData));
  const nextStatus =
    input.status === "attended" ? LessonStatus.ATTENDED : LessonStatus.ABSENT;
  const prisma = getPrisma();

  const lesson = await prisma.$transaction(async (tx) => {
    const current = await tx.lesson.findUnique({
      where: { id: input.lessonId },
      select: {
        id: true,
        studentId: true,
        status: true,
      },
    });

    if (!current) {
      throw new Error("Dərs bronu tapılmadı");
    }

    const updated = await tx.lesson.update({
      where: { id: current.id },
      data: { status: nextStatus },
      select: {
        id: true,
        studentId: true,
        status: true,
      },
    });

    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "lesson.attendance.update",
      entityType: "lesson",
      entityId: current.id,
      before: { status: current.status },
      after: { status: updated.status },
      reason: nextStatus === LessonStatus.ATTENDED ? "Tələbə dərsə gəldi" : "Tələbə dərsə gəlmədi",
    });

    return updated;
  });

  revalidateBookingSurfaces(lesson.studentId);
}

async function activateStudentFromReservation(
  tx: Prisma.TransactionClient,
  input: {
    actorId: string;
    studentId: string;
    studentCode: string;
    oldStatus: StudentLifecycleStatus;
    oldBillingPaused: boolean;
    effectiveAt: Date;
  }
) {
  const updateData = buildStudentStatusUpdateData(StudentLifecycleStatus.ACTIVE, input.effectiveAt);

  await tx.student.update({
    where: { id: input.studentId },
    data: updateData,
  });

  await tx.studentStatusHistory.create({
    data: {
      studentId: input.studentId,
      oldStatus: input.oldStatus,
      newStatus: StudentLifecycleStatus.ACTIVE,
      reason: "Rezerv yaradıldığı üçün tələbə aktiv edildi",
      effectiveAt: input.effectiveAt,
      changedById: input.actorId,
    },
  });

  await syncActivationBilling(tx, {
    studentId: input.studentId,
    studentCode: input.studentCode,
    effectiveAt: input.effectiveAt,
  });

  await writeAuditLog(tx, {
    actorUserId: input.actorId,
    action: "student.status.change",
    entityType: "student",
    entityId: input.studentId,
    before: {
      lifecycleStatus: input.oldStatus,
      billingPaused: input.oldBillingPaused,
    },
    after: {
      lifecycleStatus: StudentLifecycleStatus.ACTIVE,
      billingPaused: false,
      effectiveAt: input.effectiveAt.toISOString(),
    },
    reason: "Rezerv yaradıldığı üçün tələbə aktiv edildi",
  });
}

function revalidateBookingSurfaces(studentId?: string) {
  revalidatePath("/bookings");
  revalidatePath("/students");
  revalidatePath("/dashboard");
  revalidatePath("/finance");

  if (studentId) {
    revalidatePath(`/students/${studentId}`);
  }

  updateTag(erpCacheTags.students);
  updateTag(erpCacheTags.dashboard);
  updateTag(erpCacheTags.finance);
}

function parseDateInput(value: string, fieldName: string) {
  const normalized = normalizeDateValue(value);
  const date = normalized ? new Date(`${normalized}T00:00:00.000Z`) : null;

  if (!date || Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} düzgün deyil`);
  }

  return date;
}

function normalizeDateValue(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return trimmed;
  }

  const azMatch = trimmed.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (azMatch) {
    const [, day, month, year] = azMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  throw new Error("Tarix DD.MM.YYYY formatında olmalıdır");
}
