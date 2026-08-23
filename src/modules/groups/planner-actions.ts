"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import {
  AttendanceCaptureSource,
  AttendanceMark,
  ClassShift,
  EnrollmentStatus,
  GroupWeekday,
  Prisma,
  SlotSessionStatus,
  StudentLifecycleStatus,
} from "@/generated/prisma/client";
import { bakuLocalDateTimeToUtc } from "@/modules/attendance/attendance-time";
import { writeAuditLog } from "@/modules/audit/audit-service";
import {
  buildTeacherAvailabilityWhere,
  isTeacherScheduleOverlapError,
} from "@/modules/groups/slot-availability";
import {
  firstSlotOccurrenceDate,
  selectionMatchesAssignedTeacher,
} from "@/modules/groups/planner-assignment";
import {
  dateFromInput,
  formatDateAz,
  todayInBaku,
  weekdayFromDate,
  weekdayMeta,
} from "@/modules/groups/shared";
import { recalculateTeacherPayoutsForMonth } from "@/modules/hr/teacher-payroll";
import { erpCacheTags } from "@/modules/shared/cache-tags";
import {
  buildStudentStatusUpdateData,
  isBillingPausedStatus,
  syncActivationBilling,
} from "@/modules/students/lifecycle-service";
import {
  clearStudentPaymentSchedules,
  restartStudentPaymentScheduleForActiveSlot,
} from "@/modules/students/payment-schedule-service";
import { PublicActionError, safeServerAction } from "@/server/actions/safe-action";
import { requireMutationActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";
import { scopeFor } from "@/server/rbac/permissions";

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const slotSchema = z.object({
  teacherId: z.preprocess(
    (value) => value === "" ? null : value,
    z.string().uuid().nullable(),
  ),
  weekday: z.enum(GroupWeekday),
  shift: z.enum(ClassShift),
  startTime: timeSchema,
  endTime: timeSchema,
  displayName: z.string().trim().max(120).optional(),
  room: z.string().trim().max(80).optional(),
  capacity: z.coerce.number().int().min(1).max(100),
  validFrom: z.string().date(),
}).refine((value) => value.endTime > value.startTime, {
  path: ["endTime"],
  message: "Bitmə saatı başlama saatından sonra olmalıdır",
});

const assignmentSchema = z.object({
  enrollmentId: z.string().uuid(),
  slotIds: z.string().transform((value, context) => {
    try {
      return z.array(z.string().uuid()).max(14).parse(JSON.parse(value));
    } catch {
      context.addIssue({ code: "custom", message: "Slot seçimi düzgün deyil" });
      return z.NEVER;
    }
  }),
  validFrom: z.string().date(),
});

const attendanceItemSchema = z.object({
  enrollmentId: z.string().uuid(),
  status: z.enum(["present", "absent", "excused"]).nullable(),
  note: z.string().trim().max(500).default(""),
});
const attendanceSchema = z.object({
  slotId: z.string().uuid(),
  date: z.string().date(),
  title: z.string().trim().max(160).default(""),
  objective: z.string().trim().max(1000).default(""),
  homeworkTitle: z.string().trim().max(160).default(""),
  homeworkDescription: z.string().trim().max(2000).default(""),
  homeworkDueDate: z.string().date().or(z.literal("")).default(""),
  items: z.string().transform((value, context) => {
    try {
      return z.array(attendanceItemSchema).max(100).parse(JSON.parse(value));
    } catch {
      context.addIssue({ code: "custom", message: "Davamiyyət məlumatı düzgün deyil" });
      return z.NEVER;
    }
  }),
});

const updateSlotSchema = slotSchema.and(z.object({ slotId: z.string().uuid() }));

async function createClassSlotActionImpl(formData: FormData) {
  const actor = await requirePlannerManager();
  const input = slotSchema.parse(Object.fromEntries(formData));
  const prisma = getPrisma();
  const validFrom = dateFromInput(input.validFrom);

  const slot = await withTeacherScheduleConflictHandling(() => prisma.$transaction(async (tx) => {
    if (input.teacherId) {
      await assertActiveTeacher(tx, input.teacherId);
      await assertTeacherAvailability(tx, { ...input, teacherId: input.teacherId }, validFrom);
    }

    const created = await tx.classSlot.create({
      data: {
        teacherId: input.teacherId,
        weekday: input.weekday,
        shift: input.shift,
        startTime: input.startTime,
        endTime: input.endTime,
        displayName: input.displayName || null,
        room: input.room || null,
        capacity: input.capacity,
        validFrom,
        createdById: actor.id,
      },
    });
    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "class_slot.create",
      entityType: "class_slot",
      entityId: created.id,
      after: input as Prisma.InputJsonValue,
      reason: "Həftəlik dərs slotu yaradıldı",
    });
    return created;
  }));

  revalidatePlanner();
  return { id: slot.id };
}

async function updateClassSlotActionImpl(formData: FormData) {
  const actor = await requirePlannerManager();
  const input = updateSlotSchema.parse(Object.fromEntries(formData));
  const prisma = getPrisma();
  const validFrom = dateFromInput(input.validFrom);

  const updatedSlot = await withTeacherScheduleConflictHandling(() => prisma.$transaction(async (tx) => {
    await lockSlots(tx, [input.slotId]);
    const current = await tx.classSlot.findUnique({
      where: { id: input.slotId },
      select: {
        id: true,
        teacherId: true,
        weekday: true,
        shift: true,
        startTime: true,
        endTime: true,
        displayName: true,
        room: true,
        capacity: true,
        validFrom: true,
      },
    });
    if (!current) throw new Error("Slot tapılmadı");

    if (input.teacherId) {
      await assertActiveTeacher(tx, input.teacherId);
      await assertTeacherAvailability(tx, { ...input, teacherId: input.teacherId }, validFrom, current.id);
    }

    const assignments = await tx.studentScheduleAssignment.findMany({
      where: {
        slotId: current.id,
        OR: [{ validTo: null }, { validTo: { gte: validFrom } }],
      },
      select: { id: true, validFrom: true, validTo: true },
    });
    if (maxConcurrentAssignments(assignments, validFrom) > input.capacity) {
      throw new Error("Yeni tutum bu tarixdən sonrakı tələbə sayından az ola bilməz");
    }

    const updated = await tx.classSlot.update({
      where: { id: current.id },
      data: {
        teacherId: input.teacherId,
        weekday: input.weekday,
        shift: input.shift,
        startTime: input.startTime,
        endTime: input.endTime,
        displayName: input.displayName || null,
        room: input.room || null,
        capacity: input.capacity,
        validFrom,
      },
    });

    if (validFrom > current.validFrom) {
      await tx.studentScheduleAssignment.updateMany({
        where: { slotId: current.id, validTo: null, validFrom: { lt: validFrom } },
        data: { validFrom },
      });
    }

    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "class_slot.update",
      entityType: "class_slot",
      entityId: updated.id,
      before: current as unknown as Prisma.InputJsonValue,
      after: input as Prisma.InputJsonValue,
      reason: "Dərs slotu yeniləndi",
    });
    return updated;
  }));

  revalidatePlanner();
  return { id: updatedSlot.id };
}

async function deleteClassSlotActionImpl(formData: FormData) {
  const actor = await requirePlannerManager();
  const { slotId } = z.object({ slotId: z.string().uuid() }).parse(Object.fromEntries(formData));
  const prisma = getPrisma();

  const affectedStudentIds = await prisma.$transaction(async (tx) => {
    await lockSlots(tx, [slotId]);
    const current = await tx.classSlot.findUnique({
      where: { id: slotId },
      include: {
        assignments: {
          select: { enrollment: { select: { studentId: true } } },
        },
      },
    });
    if (!current) throw new Error("Slot tapılmadı");

    const studentIds = [...new Set(
      current.assignments.map((assignment) => assignment.enrollment.studentId),
    )];
    await tx.classSlot.delete({ where: { id: slotId } });

    if (studentIds.length) {
      const studentsWithAnotherSlot = await tx.studentScheduleAssignment.findMany({
        where: {
          enrollment: { studentId: { in: studentIds } },
          validTo: null,
        },
        distinct: ["enrollmentId"],
        select: { enrollment: { select: { studentId: true } } },
      });
      const retained = new Set(
        studentsWithAnotherSlot.map((assignment) => assignment.enrollment.studentId),
      );
      await clearStudentPaymentSchedules(
        tx,
        studentIds.filter((studentId) => !retained.has(studentId)),
      );
    }

    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "class_slot.delete",
      entityType: "class_slot",
      entityId: slotId,
      before: current as unknown as Prisma.InputJsonValue,
      after: null,
      reason: "Dərs slotu və ona bağlı əməliyyat məlumatları tam silindi",
    });
    return studentIds;
  });

  for (const studentId of affectedStudentIds) revalidatePath(`/students/${studentId}`);
  revalidatePlanner();
}

async function replaceStudentScheduleActionImpl(formData: FormData) {
  const actor = await requirePlannerManager();
  const input = assignmentSchema.parse(Object.fromEntries(formData));
  const prisma = getPrisma();
  const requestedValidFrom = dateFromInput(input.validFrom);
  const uniqueSlotIds = [...new Set(input.slotIds)];

  const studentId = await prisma.$transaction(async (tx) => {
    const enrollment = await tx.enrollment.findUnique({
      where: { id: input.enrollmentId },
      select: {
        id: true,
        status: true,
        teacherId: true,
        studentId: true,
        student: {
          select: {
            id: true,
            code: true,
            lifecycleStatus: true,
            billingPaused: true,
          },
        },
      },
    });
    if (
      !enrollment
      || (enrollment.status !== EnrollmentStatus.ACTIVE && enrollment.status !== EnrollmentStatus.PAUSED)
    ) {
      throw new Error("Aktiv tələbə qeydiyyatı tapılmadı");
    }

    await lockSlots(tx, uniqueSlotIds);
    const slots = uniqueSlotIds.length
      ? await tx.classSlot.findMany({
          where: { id: { in: uniqueSlotIds } },
          select: { id: true, teacherId: true, capacity: true, validFrom: true, weekday: true },
        })
      : [];
    if (slots.length !== uniqueSlotIds.length) {
      throw new Error("Seçilmiş slotlardan biri mövcud deyil");
    }
    if (uniqueSlotIds.length && !enrollment.teacherId) {
      throw new PublicActionError(
        "Tələbəyə müəllim təyin edilməyib. Əvvəlcə tələbə profilindən müəllim seçin.",
      );
    }
    if (!selectionMatchesAssignedTeacher(slots, enrollment.teacherId)) {
      throw new PublicActionError(
        "Slot planına yalnız tələbəyə təyin edilmiş müəllimin slotlarını əlavə etmək olar.",
      );
    }

    const startBySlotId = new Map(slots.map((slot) => [
      slot.id,
      dateFromInput(firstSlotOccurrenceDate(input.validFrom, {
        validFrom: slot.validFrom.toISOString().slice(0, 10),
        weekday: slot.weekday,
      })),
    ]));
    const scheduleStartedAt = [...startBySlotId.values()].toSorted(
      (left, right) => left.getTime() - right.getTime(),
    )[0] ?? requestedValidFrom;
    const previousDay = previousDate(scheduleStartedAt);

    if (uniqueSlotIds.length) {
      const latestSlotStart = [...startBySlotId.values()].toSorted(
        (left, right) => right.getTime() - left.getTime(),
      )[0] ?? scheduleStartedAt;
      const occupancy = await tx.studentScheduleAssignment.findMany({
        where: {
          slotId: { in: uniqueSlotIds },
          enrollmentId: { not: enrollment.id },
          validFrom: { lte: latestSlotStart },
          OR: [{ validTo: null }, { validTo: { gte: scheduleStartedAt } }],
        },
        select: { slotId: true, validFrom: true, validTo: true },
      });
      const fullSlot = slots.find((slot) => {
        const slotStartedAt = startBySlotId.get(slot.id) ?? scheduleStartedAt;
        const count = occupancy.filter((item) => (
          item.slotId === slot.id
          && item.validFrom <= slotStartedAt
          && (!item.validTo || item.validTo >= slotStartedAt)
        )).length;
        return count >= slot.capacity;
      });
      if (fullSlot) throw new Error("Seçilmiş slotlardan birinin tutumu doludur");
    }

    const before = await tx.studentScheduleAssignment.findMany({
      where: {
        enrollmentId: enrollment.id,
        OR: [{ validTo: null }, { validTo: { gte: scheduleStartedAt } }],
      },
      select: { id: true, slotId: true, enrollmentId: true, validFrom: true, validTo: true },
    });
    const futureIds = before.filter((item) => item.validFrom >= scheduleStartedAt).map((item) => item.id);
    const activeIds = before.filter((item) => item.validFrom < scheduleStartedAt).map((item) => item.id);
    if (futureIds.length) {
      await tx.studentScheduleAssignment.deleteMany({ where: { id: { in: futureIds } } });
    }
    if (activeIds.length) {
      await tx.studentScheduleAssignment.updateMany({
        where: { id: { in: activeIds } },
        data: { validTo: previousDay },
      });
    }

    if (slots.length) {
      await tx.studentScheduleAssignment.createMany({
        data: slots.map((slot) => ({
          slotId: slot.id,
          enrollmentId: enrollment.id,
          validFrom: startBySlotId.get(slot.id) ?? scheduleStartedAt,
          assignedById: actor.id,
        })),
      });
    }

    if (slots.length) {
      await syncStudentActivationAndPayment(tx, {
        actorId: actor.id,
        enrollment,
        slotStartedAt: scheduleStartedAt,
      });
    } else {
      await clearStudentPaymentSchedules(tx, [enrollment.studentId]);
    }

    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "student_schedule.replace",
      entityType: "enrollment",
      entityId: enrollment.id,
      before: before as unknown as Prisma.InputJsonValue,
      after: {
        slotIds: uniqueSlotIds,
        teacherId: enrollment.teacherId,
        requestedValidFrom: input.validFrom,
        slotStartDates: Object.fromEntries(
          [...startBySlotId].map(([slotId, start]) => [slotId, start.toISOString().slice(0, 10)]),
        ),
      },
      reason: uniqueSlotIds.length
        ? "Tələbənin həftəlik slot planı yeniləndi"
        : "Tələbənin həftəlik slot planı silindi",
    });
    return enrollment.studentId;
  });

  revalidatePlanner(studentId);
}

async function saveSlotAttendanceActionImpl(formData: FormData) {
  const actor = await requireMutationActor("attendance.manage");
  const input = attendanceSchema.parse(Object.fromEntries(formData));
  if (new Set(input.items.map((item) => item.enrollmentId)).size !== input.items.length) {
    throw new Error("Davamiyyət siyahısında eyni tələbə təkrar olunub");
  }
  const today = todayInBaku();
  if (input.date > today) throw new Error("Gələcək tarix üçün davamiyyət yazmaq olmaz");
  const date = dateFromInput(input.date);
  const prisma = getPrisma();
  const canManageAll = scopeFor(actor.permissions, "attendance.manage") === "ALL";
  const teacherProfile = canManageAll
    ? null
    : await prisma.teacher.findUnique({ where: { userId: actor.id }, select: { id: true } });
  if (!canManageAll && !teacherProfile) throw new Error("Müəllim profili ERP hesabına bağlanmayıb");

  const affectedTeacherIds = await prisma.$transaction(async (tx) => {
    await lockSlots(tx, [input.slotId]);
    const slot = await tx.classSlot.findUnique({
      where: { id: input.slotId },
      select: {
        id: true,
        teacherId: true,
        weekday: true,
        startTime: true,
        endTime: true,
        validFrom: true,
      },
    });
    if (!slot) throw new Error("Slot tapılmadı");
    if (!slot.teacherId) {
      throw new Error("Davamiyyət yazmaq üçün əvvəlcə slota müəllim təyin edilməlidir");
    }
    if (slot.weekday !== weekdayFromDate(input.date)) {
      throw new Error("Seçilən tarix slotun dərs gününə uyğun deyil");
    }
    if (date < slot.validFrom) {
      throw new Error("Seçilən tarix slotun başlanğıc tarixindən əvvəldir");
    }
    if (teacherProfile && slot.teacherId !== teacherProfile.id) {
      throw new Error("Bu slotun davamiyyətini dəyişmək icazəniz yoxdur");
    }

    const assignments = await tx.studentScheduleAssignment.findMany({
      where: {
        slotId: slot.id,
        enrollmentId: { in: input.items.map((item) => item.enrollmentId) },
        validFrom: { lte: date },
        OR: [{ validTo: null }, { validTo: { gte: date } }],
      },
      select: { enrollmentId: true },
    });
    if (assignments.length !== input.items.length) {
      throw new Error("Davamiyyət siyahısında etibarsız tələbə var");
    }

    const hasMarkedItem = input.items.some((item) => item.status !== null);
    const hasLessonContent = Boolean(input.title || input.objective || input.homeworkTitle);
    let session = await tx.slotSession.findUnique({
      where: { slotId_sessionDate: { slotId: slot.id, sessionDate: date } },
    });
    if (!session && (hasMarkedItem || hasLessonContent)) {
      session = await tx.slotSession.create({
        data: {
          slotId: slot.id,
          sessionDate: date,
          startTime: slot.startTime,
          endTime: slot.endTime,
          status: input.date < today ? SlotSessionStatus.COMPLETED : SlotSessionStatus.SCHEDULED,
          title: input.title || null,
          objective: input.objective || null,
          createdById: actor.id,
        },
      });
    }

    if (session) {
      session = await tx.slotSession.update({
        where: { id: session.id },
        data: {
          title: input.title || null,
          objective: input.objective || null,
        },
      });
      if (input.homeworkTitle) {
        await tx.lessonHomework.upsert({
          where: { sessionId: session.id },
          create: {
            sessionId: session.id,
            title: input.homeworkTitle,
            description: input.homeworkDescription || null,
            dueAt: input.homeworkDueDate
              ? bakuLocalDateTimeToUtc(input.homeworkDueDate, "23:59")
              : null,
            createdById: actor.id,
            updatedById: actor.id,
          },
          update: {
            title: input.homeworkTitle,
            description: input.homeworkDescription || null,
            dueAt: input.homeworkDueDate
              ? bakuLocalDateTimeToUtc(input.homeworkDueDate, "23:59")
              : null,
            updatedById: actor.id,
          },
        });
      } else {
        await tx.lessonHomework.deleteMany({ where: { sessionId: session.id } });
      }
    }

    const previousTeacherIds = session
      ? await tx.attendanceRecord.findMany({
          where: {
            sessionId: session.id,
            enrollmentId: { in: input.items.map((item) => item.enrollmentId) },
          },
          select: { teacherId: true },
          distinct: ["teacherId"],
        })
      : [];

    for (const item of input.items) {
      if (!item.status) {
        if (session) {
          await tx.attendanceRecord.deleteMany({
            where: { sessionId: session.id, enrollmentId: item.enrollmentId },
          });
        }
        continue;
      }
      if (!session) throw new Error("Davamiyyət sessiyası yaradıla bilmədi");
      await tx.attendanceRecord.upsert({
        where: {
          sessionId_enrollmentId: {
            sessionId: session.id,
            enrollmentId: item.enrollmentId,
          },
        },
        create: {
          sessionId: session.id,
          enrollmentId: item.enrollmentId,
          teacherId: slot.teacherId,
          status: mapAttendanceInput(item.status),
          source: AttendanceCaptureSource.MANUAL,
          note: item.note || null,
          markedById: actor.id,
        },
        update: {
          teacherId: slot.teacherId,
          status: mapAttendanceInput(item.status),
          source: AttendanceCaptureSource.MANUAL,
          note: item.note || null,
          markedById: actor.id,
          markedAt: new Date(),
        },
      });
    }

    if (session && !hasMarkedItem && !hasLessonContent) {
      await tx.slotSession.delete({ where: { id: session.id } });
    }

    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "attendance.batch.update",
      entityType: "class_slot",
      entityId: slot.id,
      after: { slotId: slot.id, date: input.date, items: input.items } as Prisma.InputJsonValue,
      reason: "Slot davamiyyəti yeniləndi",
    });
    return [...new Set([slot.teacherId, ...previousTeacherIds.map((item) => item.teacherId)])];
  });

  await recalculateTeacherPayoutsForMonth(date, actor.id, affectedTeacherIds);
  revalidatePlanner();
}

function mapAttendanceInput(status: "present" | "absent" | "excused") {
  if (status === "present") return AttendanceMark.PRESENT;
  if (status === "excused") return AttendanceMark.EXCUSED;
  return AttendanceMark.ABSENT;
}

async function syncStudentActivationAndPayment(
  tx: Prisma.TransactionClient,
  input: {
    actorId: string;
    slotStartedAt: Date;
    enrollment: {
      student: {
        id: string;
        code: string;
        lifecycleStatus: StudentLifecycleStatus;
        billingPaused: boolean;
      };
    };
  },
) {
  const student = input.enrollment.student;
  if (student.lifecycleStatus === StudentLifecycleStatus.SLOT_WAITING) {
    await tx.student.update({
      where: { id: student.id },
      data: buildStudentStatusUpdateData(StudentLifecycleStatus.ACTIVE, input.slotStartedAt),
    });
    await tx.studentStatusHistory.create({
      data: {
        studentId: student.id,
        oldStatus: student.lifecycleStatus,
        newStatus: StudentLifecycleStatus.ACTIVE,
        reason: "Dərs slotuna əlavə edildiyi üçün tələbə aktiv edildi",
        effectiveAt: input.slotStartedAt,
        changedById: input.actorId,
      },
    });
    await syncActivationBilling(tx, {
      studentId: student.id,
      studentCode: student.code,
      effectiveAt: input.slotStartedAt,
    });
    await writeAuditLog(tx, {
      actorUserId: input.actorId,
      action: "student.status.change",
      entityType: "student",
      entityId: student.id,
      before: { lifecycleStatus: student.lifecycleStatus, billingPaused: student.billingPaused },
      after: { lifecycleStatus: StudentLifecycleStatus.ACTIVE, billingPaused: false },
      reason: "Dərs slotuna əlavə edildiyi üçün tələbə aktiv edildi",
    });
  }

  if (
    student.lifecycleStatus === StudentLifecycleStatus.SLOT_WAITING
    || !isBillingPausedStatus(student.lifecycleStatus)
  ) {
    await restartStudentPaymentScheduleForActiveSlot(tx, {
      studentId: student.id,
    });
  } else {
    await clearStudentPaymentSchedules(tx, [student.id]);
  }
}

async function assertActiveTeacher(tx: Prisma.TransactionClient, teacherId: string) {
  const teacher = await tx.teacher.findUnique({
    where: { id: teacherId },
    select: { isActive: true },
  });
  if (!teacher?.isActive) throw new Error("Aktiv müəllim tapılmadı");
}

async function assertTeacherAvailability(
  tx: Prisma.TransactionClient,
  input: {
    teacherId: string;
    weekday: GroupWeekday;
    startTime: string;
    endTime: string;
  },
  validFrom: Date,
  excludeId?: string,
) {
  const conflict = await tx.classSlot.findFirst({
    where: buildTeacherAvailabilityWhere(input, excludeId),
    orderBy: [{ validFrom: "asc" }, { startTime: "asc" }],
    select: { startTime: true, endTime: true, validFrom: true, room: true },
  });
  if (!conflict) return;

  const location = conflict.room ? `, otaq: ${conflict.room}` : "";
  throw new PublicActionError(
    `Müəllimin ${weekdayMeta[input.weekday].label} günü ${conflict.startTime}–${conflict.endTime} slotu seçilən vaxtla üst-üstə düşür (başlanğıc: ${formatDateAz(conflict.validFrom)}${location}).`,
    "CONFLICT",
  );
}

async function withTeacherScheduleConflictHandling<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error) {
    if (isTeacherScheduleOverlapError(error)) {
      throw new PublicActionError(
        "Bu müəllim üçün seçilən gün və saatda artıq başqa slot var. Slot siyahısını yeniləyib mövcud slotu yoxlayın.",
        "CONFLICT",
      );
    }
    throw error;
  }
}

async function lockSlots(tx: Prisma.TransactionClient, slotIds: string[]) {
  if (!slotIds.length) return;
  const ids = slotIds.map((id) => Prisma.sql`${id}::uuid`);
  await tx.$queryRaw`SELECT id FROM "erp"."class_slots" WHERE id IN (${Prisma.join(ids)}) FOR UPDATE`;
}

function previousDate(date: Date) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() - 1);
  return result;
}

function maxConcurrentAssignments(
  assignments: Array<{ validFrom: Date; validTo: Date | null }>,
  effectiveAt: Date,
) {
  const events = new Map<number, number>();
  for (const assignment of assignments) {
    const start = Math.max(assignment.validFrom.getTime(), effectiveAt.getTime());
    events.set(start, (events.get(start) ?? 0) + 1);
    if (assignment.validTo) {
      const afterEnd = new Date(assignment.validTo);
      afterEnd.setUTCDate(afterEnd.getUTCDate() + 1);
      events.set(afterEnd.getTime(), (events.get(afterEnd.getTime()) ?? 0) - 1);
    }
  }
  let current = 0;
  let maximum = 0;
  for (const [, delta] of [...events.entries()].toSorted(([left], [right]) => left - right)) {
    current += delta;
    maximum = Math.max(maximum, current);
  }
  return maximum;
}

async function requirePlannerManager() {
  return requireMutationActor("group.manage");
}

function revalidatePlanner(studentId?: string) {
  revalidatePath("/groups");
  revalidatePath("/students");
  revalidatePath("/dashboard");
  revalidatePath("/finance");
  revalidatePath("/hr");
  if (studentId) revalidatePath(`/students/${studentId}`);
  updateTag(erpCacheTags.slots);
  updateTag(erpCacheTags.attendance);
  updateTag(erpCacheTags.students);
  updateTag(erpCacheTags.dashboard);
  updateTag(erpCacheTags.finance);
}

export const createClassSlotAction = safeServerAction(
  createClassSlotActionImpl,
  "Dərs slotu yaradılmadı.",
);
export const updateClassSlotAction = safeServerAction(
  updateClassSlotActionImpl,
  "Dərs slotu yenilənmədi.",
);
export const deleteClassSlotAction = safeServerAction(
  deleteClassSlotActionImpl,
  "Dərs slotu silinmədi.",
);
export const replaceStudentScheduleAction = safeServerAction(
  replaceStudentScheduleActionImpl,
  "Tələbə cədvəli yenilənmədi.",
);
export const saveSlotAttendanceAction = safeServerAction(
  saveSlotAttendanceActionImpl,
  "Davamiyyət saxlanmadı.",
);
