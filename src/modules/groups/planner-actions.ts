"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import {
  AttendanceMark,
  ClassShift,
  EnrollmentStatus,
  GroupWeekday,
  Prisma,
  StudentLifecycleStatus,
} from "@/generated/prisma/client";
import { writeAuditLog } from "@/modules/audit/audit-service";
import { recalculateTeacherPayoutsForMonth } from "@/modules/hr/teacher-payroll";
import { erpCacheTags } from "@/modules/shared/cache-tags";
import {
  buildStudentStatusUpdateData,
  isBillingPausedStatus,
  syncActivationBilling,
} from "@/modules/students/lifecycle-service";
import {
  clearStudentPaymentSchedules,
  startStudentPaymentSchedule,
} from "@/modules/students/payment-schedule-service";
import {
  dateFromInput,
  formatDateAz,
  todayInBaku,
  weekdayFromDate,
  weekdayMeta,
} from "@/modules/groups/shared";
import {
  buildTeacherAvailabilityWhere,
  isTeacherScheduleOverlapError,
} from "@/modules/groups/slot-availability";
import { PublicActionError, safeServerAction } from "@/server/actions/safe-action";
import { requireMutationActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";
import { scopeFor } from "@/server/rbac/permissions";

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const slotSchema = z.object({
  teacherId: z.string().uuid(),
  weekday: z.enum(GroupWeekday),
  shift: z.enum(ClassShift),
  startTime: timeSchema,
  endTime: timeSchema,
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
  membershipId: z.string().uuid(),
  status: z.enum(["present", "absent"]).nullable(),
  note: z.string().trim().max(500).default(""),
});
const attendanceSchema = z.object({
  slotId: z.string().uuid(),
  date: z.string().date(),
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
    const teacher = await tx.teacher.findUnique({
      where: { id: input.teacherId },
      select: { id: true, isActive: true },
    });
    if (!teacher?.isActive) throw new Error("Aktiv müəllim tapılmadı");
    await assertTeacherAvailability(tx, input, validFrom, null);

    const group = await tx.studentGroup.create({
      data: {
        code: `SL-${randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`,
        capacity: input.capacity,
        createdById: actor.id,
        schedules: {
          create: {
            weekday: input.weekday,
            startTime: input.startTime,
            endTime: input.endTime,
          },
        },
      },
    });
    const created = await tx.classSlot.create({
      data: {
        groupId: group.id,
        teacherId: input.teacherId,
        weekday: input.weekday,
        shift: input.shift,
        startTime: input.startTime,
        endTime: input.endTime,
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
  const effectiveAt = dateFromInput(input.validFrom);
  const previousDay = previousDate(effectiveAt);

  const updatedSlot = await withTeacherScheduleConflictHandling(() => prisma.$transaction(async (tx) => {
    await lockSlots(tx, [input.slotId]);
    const current = await tx.classSlot.findFirst({
      where: {
        id: input.slotId,
        isActive: true,
        group: { isActive: true },
      },
      select: {
        id: true,
        groupId: true,
        teacherId: true,
        weekday: true,
        shift: true,
        startTime: true,
        endTime: true,
        room: true,
        capacity: true,
        validFrom: true,
        validTo: true,
        isActive: true,
      },
    });
    if (!current?.isActive) throw new Error("Aktiv slot tapılmadı");
    if (effectiveAt < current.validFrom) {
      throw new Error("Dəyişiklik tarixi slotun başlanğıc tarixindən əvvəl ola bilməz");
    }
    if (current.validTo && effectiveAt > current.validTo) {
      throw new Error("Dəyişiklik tarixi slotun bitmə tarixindən sonra ola bilməz");
    }

    const teacher = await tx.teacher.findUnique({
      where: { id: input.teacherId },
      select: { id: true, isActive: true },
    });
    if (!teacher?.isActive) throw new Error("Aktiv müəllim tapılmadı");
    await assertTeacherAvailability(tx, input, effectiveAt, current.validTo, current.id);

    const assignments = await tx.studentScheduleAssignment.findMany({
      where: {
        slotId: current.id,
        OR: [{ validTo: null }, { validTo: { gte: effectiveAt } }],
      },
      select: { id: true, membershipId: true, validFrom: true, validTo: true },
    });
    if (maxConcurrentAssignments(assignments, effectiveAt) > input.capacity) {
      throw new Error("Yeni tutum bu tarixdən sonrakı tələbə sayından az ola bilməz");
    }

    const changes = {
      teacherId: input.teacherId,
      weekday: input.weekday,
      shift: input.shift,
      startTime: input.startTime,
      endTime: input.endTime,
      room: input.room || null,
      capacity: input.capacity,
    };

    if (current.validFrom.getTime() === effectiveAt.getTime()) {
      const updated = await tx.classSlot.update({ where: { id: current.id }, data: changes });
      await tx.studentGroup.update({
        where: { id: current.groupId },
        data: { capacity: input.capacity },
      });
      await writeAuditLog(tx, {
        actorUserId: actor.id,
        action: "class_slot.update",
        entityType: "class_slot",
        entityId: updated.id,
        before: current as unknown as Prisma.InputJsonValue,
        after: { ...input, mode: "in_place" } as Prisma.InputJsonValue,
        reason: "Dərs slotu başlanğıc tarixindən yeniləndi",
      });
      return updated;
    }

    await tx.classSlot.update({ where: { id: current.id }, data: { validTo: previousDay } });
    const replacement = await tx.classSlot.create({
      data: {
        groupId: current.groupId,
        ...changes,
        validFrom: effectiveAt,
        validTo: current.validTo,
        createdById: actor.id,
      },
    });

    const futureAssignmentIds = assignments
      .filter((assignment) => assignment.validFrom >= effectiveAt)
      .map((assignment) => assignment.id);
    const activeAssignmentIds = assignments
      .filter((assignment) => assignment.validFrom < effectiveAt)
      .map((assignment) => assignment.id);
    if (futureAssignmentIds.length) {
      await tx.studentScheduleAssignment.deleteMany({ where: { id: { in: futureAssignmentIds } } });
    }
    if (activeAssignmentIds.length) {
      await tx.studentScheduleAssignment.updateMany({
        where: { id: { in: activeAssignmentIds } },
        data: { validTo: previousDay },
      });
    }
    if (assignments.length) {
      await tx.studentScheduleAssignment.createMany({
        data: assignments.map((assignment) => ({
          slotId: replacement.id,
          membershipId: assignment.membershipId,
          validFrom: assignment.validFrom < effectiveAt ? effectiveAt : assignment.validFrom,
          validTo: assignment.validTo,
          assignedById: actor.id,
        })),
      });
    }

    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "class_slot.version.create",
      entityType: "class_slot",
      entityId: replacement.id,
      before: current as unknown as Prisma.InputJsonValue,
      after: { ...input, replacesSlotId: current.id, migratedAssignments: assignments.length } as Prisma.InputJsonValue,
      reason: "Dərs slotunun tarixçəli yeni versiyası yaradıldı",
    });
    return replacement;
  }));

  revalidatePlanner();
  return { id: updatedSlot.id };
}

async function deleteClassSlotActionImpl(formData: FormData) {
  const actor = await requirePlannerManager();
  const { slotId } = z.object({ slotId: z.string().uuid() }).parse(Object.fromEntries(formData));
  const prisma = getPrisma();

  await prisma.$transaction(async (tx) => {
    await lockSlots(tx, [slotId]);
    const current = await tx.classSlot.findUnique({ where: { id: slotId } });
    if (!current?.isActive) throw new Error("Aktiv slot tapılmadı");
    await tx.classSlot.update({ where: { id: slotId }, data: { isActive: false } });
    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "class_slot.delete",
      entityType: "class_slot",
      entityId: slotId,
      before: current as unknown as Prisma.InputJsonValue,
      after: { isActive: false },
      reason: "Dərs slotu silindi",
    });
  });

  revalidatePlanner();
}

async function replaceStudentScheduleActionImpl(formData: FormData) {
  const actor = await requirePlannerManager();
  const input = assignmentSchema.parse(Object.fromEntries(formData));
  const prisma = getPrisma();
  const validFrom = dateFromInput(input.validFrom);
  const previousDay = previousDate(validFrom);
  const uniqueSlotIds = [...new Set(input.slotIds)];

  const studentId = await prisma.$transaction(async (tx) => {
    const enrollment = await tx.enrollment.findUnique({
      where: { id: input.enrollmentId },
      include: { student: true },
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
          where: {
            id: { in: uniqueSlotIds },
            isActive: true,
            group: { isActive: true },
            validFrom: { lte: validFrom },
            OR: [{ validTo: null }, { validTo: { gte: validFrom } }],
          },
          select: { id: true, groupId: true, teacherId: true, capacity: true },
        })
      : [];
    if (slots.length !== uniqueSlotIds.length) {
      throw new Error("Seçilmiş slotlardan biri aktiv deyil");
    }

    if (uniqueSlotIds.length) {
      const occupancy = await tx.studentScheduleAssignment.groupBy({
        by: ["slotId"],
        where: {
          slotId: { in: uniqueSlotIds },
          membership: { enrollmentId: { not: enrollment.id } },
          validFrom: { lte: validFrom },
          OR: [{ validTo: null }, { validTo: { gte: validFrom } }],
        },
        _count: { _all: true },
      });
      const countBySlot = new Map(occupancy.map((item) => [item.slotId, item._count._all]));
      const fullSlot = slots.find((slot) => (countBySlot.get(slot.id) ?? 0) >= slot.capacity);
      if (fullSlot) throw new Error("Seçilmiş slotlardan birinin tutumu doludur");
    }

    const before = await tx.studentScheduleAssignment.findMany({
      where: {
        membership: { enrollmentId: enrollment.id },
        OR: [{ validTo: null }, { validTo: { gte: validFrom } }],
      },
      select: { id: true, slotId: true, membershipId: true, validFrom: true, validTo: true },
    });
    const futureIds = before.filter((item) => item.validFrom >= validFrom).map((item) => item.id);
    const activeIds = before.filter((item) => item.validFrom < validFrom).map((item) => item.id);
    if (futureIds.length) {
      await tx.studentScheduleAssignment.deleteMany({ where: { id: { in: futureIds } } });
    }
    if (activeIds.length) {
      await tx.studentScheduleAssignment.updateMany({
        where: { id: { in: activeIds } },
        data: { validTo: previousDay },
      });
    }

    const assignments: Array<{
      slotId: string;
      membershipId: string;
      validFrom: Date;
      assignedById: string;
    }> = [];
    for (const slot of slots) {
      let membership = await tx.groupMembership.findFirst({
        where: {
          groupId: slot.groupId,
          enrollmentId: enrollment.id,
          teacherId: slot.teacherId,
          endedAt: null,
        },
        select: { id: true },
      });
      membership ??= await tx.groupMembership.create({
        data: {
          groupId: slot.groupId,
          enrollmentId: enrollment.id,
          teacherId: slot.teacherId,
          joinedAt: validFrom,
          assignedById: actor.id,
        },
        select: { id: true },
      });
      assignments.push({
        slotId: slot.id,
        membershipId: membership.id,
        validFrom,
        assignedById: actor.id,
      });
    }
    if (assignments.length) await tx.studentScheduleAssignment.createMany({ data: assignments });

    const selectedMembershipIds = new Set(assignments.map((assignment) => assignment.membershipId));
    const obsoleteMembershipIds = [...new Set(
      before
        .map((assignment) => assignment.membershipId)
        .filter((membershipId) => !selectedMembershipIds.has(membershipId)),
    )];
    if (obsoleteMembershipIds.length) {
      await tx.groupMembership.updateMany({
        where: { id: { in: obsoleteMembershipIds }, endedAt: null },
        data: { endedAt: validFrom },
      });
    }

    const teacherIds = [...new Set(slots.map((slot) => slot.teacherId))];
    if (teacherIds.length === 1 && enrollment.teacherId !== teacherIds[0]) {
      await tx.enrollment.update({ where: { id: enrollment.id }, data: { teacherId: teacherIds[0] } });
      await tx.teacherAssignmentHistory.create({
        data: {
          enrollmentId: enrollment.id,
          oldTeacherId: enrollment.teacherId,
          newTeacherId: teacherIds[0],
          reason: "Slot planına əsasən müəllim təyin edildi",
          changedById: actor.id,
        },
      });
    }

    if (assignments.length) {
      await syncStudentActivationAndPayment(tx, {
        actorId: actor.id,
        enrollment,
        joinedAt: validFrom,
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
      after: { slotIds: uniqueSlotIds, validFrom: input.validFrom },
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
  const today = todayInBaku();
  if (input.date > today) throw new Error("Gələcək tarix üçün davamiyyət yazmaq olmaz");
  const date = dateFromInput(input.date);
  const prisma = getPrisma();
  const canManageAll = scopeFor(actor.permissions, "attendance.manage") === "ALL";
  const teacherProfile = canManageAll
    ? null
    : await prisma.teacher.findUnique({ where: { userId: actor.id }, select: { id: true } });
  if (!canManageAll && !teacherProfile) throw new Error("Müəllim profili ERP hesabına bağlanmayıb");

  const teacherId = await prisma.$transaction(async (tx) => {
    await lockSlots(tx, [input.slotId]);
    const slot = await tx.classSlot.findUnique({
      where: { id: input.slotId },
      select: {
        id: true,
        groupId: true,
        teacherId: true,
        weekday: true,
        startTime: true,
        endTime: true,
        validFrom: true,
        validTo: true,
        isActive: true,
        group: { select: { isActive: true } },
      },
    });
    if (!slot?.isActive || !slot.group.isActive) throw new Error("Aktiv slot tapılmadı");
    if (slot.weekday !== weekdayFromDate(input.date)) {
      throw new Error("Seçilən tarix slotun dərs gününə uyğun deyil");
    }
    if (date < slot.validFrom || (slot.validTo && date > slot.validTo)) {
      throw new Error("Seçilən tarix slotun aktiv dövrünə daxil deyil");
    }
    if (teacherProfile && slot.teacherId !== teacherProfile.id) {
      throw new Error("Bu slotun davamiyyətini dəyişmək icazəniz yoxdur");
    }

    const memberships = await tx.studentScheduleAssignment.findMany({
      where: {
        slotId: slot.id,
        membershipId: { in: input.items.map((item) => item.membershipId) },
        validFrom: { lte: date },
        OR: [{ validTo: null }, { validTo: { gte: date } }],
      },
      select: { membershipId: true },
    });
    if (memberships.length !== input.items.length) {
      throw new Error("Davamiyyət siyahısında etibarsız tələbə var");
    }

    const hasMarkedItem = input.items.some((item) => item.status !== null);
    let session = await tx.groupSession.findUnique({
      where: { groupId_sessionDate: { groupId: slot.groupId, sessionDate: date } },
    });
    if (!session && hasMarkedItem) {
      session = await tx.groupSession.create({
        data: {
          groupId: slot.groupId,
          sessionDate: date,
          startTime: slot.startTime,
          endTime: slot.endTime,
          createdById: actor.id,
        },
      });
    }

    for (const item of input.items) {
      if (!item.status) {
        if (session) {
          await tx.attendanceRecord.deleteMany({
            where: { sessionId: session.id, membershipId: item.membershipId },
          });
        }
        continue;
      }
      if (!session) throw new Error("Davamiyyət sessiyası yaradıla bilmədi");
      await tx.attendanceRecord.upsert({
        where: {
          sessionId_membershipId: {
            sessionId: session.id,
            membershipId: item.membershipId,
          },
        },
        create: {
          sessionId: session.id,
          membershipId: item.membershipId,
          teacherId: slot.teacherId,
          status: item.status === "present" ? AttendanceMark.PRESENT : AttendanceMark.ABSENT,
          note: item.note || null,
          markedById: actor.id,
        },
        update: {
          teacherId: slot.teacherId,
          status: item.status === "present" ? AttendanceMark.PRESENT : AttendanceMark.ABSENT,
          note: item.note || null,
          markedById: actor.id,
          markedAt: new Date(),
        },
      });
    }

    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "attendance.batch.update",
      entityType: "class_slot",
      entityId: slot.id,
      after: { slotId: slot.id, date: input.date, items: input.items } as Prisma.InputJsonValue,
      reason: "Slot davamiyyəti yeniləndi",
    });
    return slot.teacherId;
  });

  await recalculateTeacherPayoutsForMonth(date, actor.id, [teacherId]);
  revalidatePlanner();
}

async function syncStudentActivationAndPayment(
  tx: Prisma.TransactionClient,
  input: {
    actorId: string;
    joinedAt: Date;
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
  if (student.lifecycleStatus === StudentLifecycleStatus.GROUP_WAITING) {
    await tx.student.update({
      where: { id: student.id },
      data: buildStudentStatusUpdateData(StudentLifecycleStatus.ACTIVE, input.joinedAt),
    });
    await tx.studentStatusHistory.create({
      data: {
        studentId: student.id,
        oldStatus: student.lifecycleStatus,
        newStatus: StudentLifecycleStatus.ACTIVE,
        reason: "Dərs slotuna əlavə edildiyi üçün tələbə aktiv edildi",
        effectiveAt: input.joinedAt,
        changedById: input.actorId,
      },
    });
    await syncActivationBilling(tx, {
      studentId: student.id,
      studentCode: student.code,
      effectiveAt: input.joinedAt,
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
    student.lifecycleStatus === StudentLifecycleStatus.GROUP_WAITING
    || !isBillingPausedStatus(student.lifecycleStatus)
  ) {
    await startStudentPaymentSchedule(tx, {
      studentId: student.id,
      groupStartedAt: input.joinedAt,
    });
  } else {
    await clearStudentPaymentSchedules(tx, [student.id]);
  }
}

async function assertTeacherAvailability(
  tx: Prisma.TransactionClient,
  input: Pick<z.infer<typeof slotSchema>, "teacherId" | "weekday" | "startTime" | "endTime">,
  effectiveAt: Date,
  validTo: Date | null,
  excludeId?: string,
) {
  const conflict = await tx.classSlot.findFirst({
    where: buildTeacherAvailabilityWhere(input, effectiveAt, validTo, excludeId),
    orderBy: [{ validFrom: "asc" }, { startTime: "asc" }],
    select: {
      startTime: true,
      endTime: true,
      validFrom: true,
      validTo: true,
      group: { select: { code: true } },
    },
  });
  if (!conflict) return;

  const activePeriod = conflict.validTo
    ? `${formatDateAz(conflict.validFrom)}–${formatDateAz(conflict.validTo)}`
    : `${formatDateAz(conflict.validFrom)} tarixindən`;
  throw new PublicActionError(
    `Müəllimin ${weekdayMeta[input.weekday].label} günü ${conflict.startTime}–${conflict.endTime} slotu seçilən vaxtla üst-üstə düşür (qrup: ${conflict.group.code}, dövr: ${activePeriod}).`,
    "CONFLICT",
  );
}

async function withTeacherScheduleConflictHandling<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error) {
    if (isTeacherScheduleOverlapError(error)) {
      throw new PublicActionError(
        "Bu müəllim üçün seçilən gün, saat və tarix dövründə artıq başqa aktiv slot var. Səhifəni yeniləyib yenidən yoxlayın.",
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
  updateTag(erpCacheTags.groups);
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
