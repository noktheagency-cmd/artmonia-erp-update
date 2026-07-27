"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import {
  AttendanceMark,
  GroupWeekday,
  StudentLifecycleStatus,
  type Prisma,
} from "@/generated/prisma/client";
import { getPrisma } from "@/server/db/prisma";
import { isPrivilegedActor, requireMutationActor } from "@/server/auth/actor";
import { writeAuditLog } from "@/modules/audit/audit-service";
import { recalculateTeacherPayoutsForMonth } from "@/modules/hr/teacher-payroll";
import { erpCacheTags } from "@/modules/shared/cache-tags";
import {
  buildStudentStatusUpdateData,
  syncActivationBilling,
} from "@/modules/students/lifecycle-service";
import {
  dateFromInput,
  normalizeGroupCode,
  todayInBaku,
  weekdayFromDate,
} from "@/modules/groups/shared";
import { safeServerAction } from "@/server/actions/safe-action";

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const scheduleSchema = z
  .array(
    z.object({
      weekday: z.enum(GroupWeekday),
      startTime: timeSchema,
      endTime: timeSchema,
    })
  )
  .min(1)
  .max(7)
  .superRefine((schedules, context) => {
    const weekdays = new Set<string>();
    schedules.forEach((schedule, index) => {
      if (weekdays.has(schedule.weekday)) {
        context.addIssue({ code: "custom", message: "Hər gün yalnız bir dəfə seçilə bilər", path: [index, "weekday"] });
      }
      weekdays.add(schedule.weekday);
      if (schedule.endTime <= schedule.startTime) {
        context.addIssue({ code: "custom", message: "Bitmə saatı başlama saatından sonra olmalıdır", path: [index, "endTime"] });
      }
    });
  });

const groupSchema = z.object({
  groupId: z.string().uuid().optional(),
  code: z.string().trim().min(1).max(24),
  capacity: z.preprocess((value) => Number(value), z.number().int().min(1).max(500)),
  schedules: z.string().transform((value, context) => {
    try {
      return scheduleSchema.parse(JSON.parse(value));
    } catch {
      context.addIssue({ code: "custom", message: "Qrup cədvəli düzgün deyil" });
      return z.NEVER;
    }
  }),
});

const membershipSchema = z.object({
  groupId: z.string().uuid(),
  enrollmentId: z.string().uuid(),
  teacherId: z.string().uuid(),
});

const membershipIdSchema = z.object({ membershipId: z.string().uuid() });
const changeTeacherSchema = z.object({
  membershipId: z.string().uuid(),
  teacherId: z.string().uuid(),
});
const attendanceItemSchema = z.object({
  membershipId: z.string().uuid(),
  status: z.enum(["present", "absent"]).nullable(),
  note: z.string().trim().max(500).default(""),
});
const attendanceSchema = z.object({
  groupId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  items: z.string().transform((value, context) => {
    try {
      return z.array(attendanceItemSchema).max(500).parse(JSON.parse(value));
    } catch {
      context.addIssue({ code: "custom", message: "Davamiyyət məlumatı düzgün deyil" });
      return z.NEVER;
    }
  }),
});

async function createGroupActionImpl(formData: FormData) {
  const actor = await requireGroupManager();
  const input = groupSchema.parse(Object.fromEntries(formData));
  const code = normalizeGroupCode(input.code);
  const prisma = getPrisma();

  const existing = await prisma.studentGroup.findUnique({ where: { code }, select: { id: true } });
  if (existing) {
    throw new Error("Bu qrup kodu artıq istifadə olunur");
  }

  const group = await prisma.$transaction(async (tx) => {
    const created = await tx.studentGroup.create({
      data: {
        code,
        capacity: input.capacity,
        createdById: actor.id,
        schedules: { create: input.schedules },
      },
    });
    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "group.create",
      entityType: "group",
      entityId: created.id,
      after: { code, capacity: input.capacity, schedules: input.schedules } as Prisma.InputJsonValue,
      reason: "Qrup yaradıldı",
    });
    return created;
  });

  revalidateGroupSurfaces();
  return { id: group.id };
}

async function updateGroupActionImpl(formData: FormData) {
  const actor = await requireGroupManager();
  const input = groupSchema.extend({ groupId: z.string().uuid() }).parse(Object.fromEntries(formData));
  const code = normalizeGroupCode(input.code);
  const prisma = getPrisma();

  await prisma.$transaction(async (tx) => {
    await lockGroup(tx, input.groupId);
    const current = await tx.studentGroup.findUnique({
      where: { id: input.groupId },
      include: { schedules: true, _count: { select: { memberships: { where: { endedAt: null } } } } },
    });
    if (!current) throw new Error("Qrup tapılmadı");
    if (input.capacity < current._count.memberships) {
      throw new Error(`Capacity aktiv ${current._count.memberships} tələbədən az ola bilməz`);
    }
    const duplicate = await tx.studentGroup.findFirst({
      where: { code, id: { not: current.id } },
      select: { id: true },
    });
    if (duplicate) throw new Error("Bu qrup kodu artıq istifadə olunur");

    await tx.groupSchedule.deleteMany({ where: { groupId: current.id } });
    await tx.studentGroup.update({
      where: { id: current.id },
      data: {
        code,
        capacity: input.capacity,
        schedules: { create: input.schedules },
      },
    });
    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "group.update",
      entityType: "group",
      entityId: current.id,
      before: { code: current.code, capacity: current.capacity, schedules: current.schedules } as Prisma.InputJsonValue,
      after: { code, capacity: input.capacity, schedules: input.schedules } as Prisma.InputJsonValue,
      reason: "Qrup məlumatları yeniləndi",
    });
  });

  revalidateGroupSurfaces();
}

async function archiveGroupActionImpl(formData: FormData) {
  const actor = await requireGroupManager();
  const { groupId } = z.object({ groupId: z.string().uuid() }).parse(Object.fromEntries(formData));
  const prisma = getPrisma();
  await prisma.$transaction(async (tx) => {
    const current = await tx.studentGroup.findUnique({ where: { id: groupId } });
    if (!current) throw new Error("Qrup tapılmadı");
    await tx.studentGroup.update({ where: { id: groupId }, data: { isActive: false, archivedAt: new Date() } });
    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "group.archive",
      entityType: "group",
      entityId: groupId,
      before: { isActive: current.isActive },
      after: { isActive: false },
      reason: "Qrup arxivləndi",
    });
  });
  revalidateGroupSurfaces();
}

async function addGroupMemberActionImpl(formData: FormData) {
  const actor = await requireGroupManager();
  const input = membershipSchema.parse(Object.fromEntries(formData));
  const prisma = getPrisma();

  const result = await prisma.$transaction(async (tx) => {
    await lockGroup(tx, input.groupId);
    const [group, enrollment, teacher, activeCount, existingMembership] = await Promise.all([
      tx.studentGroup.findUnique({ where: { id: input.groupId } }),
      tx.enrollment.findUnique({
        where: { id: input.enrollmentId },
        include: { student: true },
      }),
      tx.teacher.findUnique({ where: { id: input.teacherId } }),
      tx.groupMembership.count({ where: { groupId: input.groupId, endedAt: null } }),
      tx.groupMembership.findFirst({ where: { enrollmentId: input.enrollmentId, endedAt: null } }),
    ]);
    if (!group || !group.isActive) throw new Error("Aktiv qrup tapılmadı");
    if (!enrollment) throw new Error("Enrollment tapılmadı");
    if (!teacher?.isActive) throw new Error("Aktiv müəllim tapılmadı");
    if (existingMembership) throw new Error("Tələbə artıq aktiv qrupa daxildir");
    if (activeCount >= group.capacity) throw new Error("Qrup capacity-si doludur");

    if (enrollment.teacherId !== teacher.id) {
      await tx.enrollment.update({ where: { id: enrollment.id }, data: { teacherId: teacher.id } });
      await tx.teacherAssignmentHistory.create({
        data: {
          enrollmentId: enrollment.id,
          oldTeacherId: enrollment.teacherId,
          newTeacherId: teacher.id,
          reason: "Qrupa əlavə zamanı müəllim təyin edildi",
          changedById: actor.id,
        },
      });
    }

    const membership = await tx.groupMembership.create({
      data: {
        groupId: group.id,
        enrollmentId: enrollment.id,
        teacherId: teacher.id,
        joinedAt: dateFromInput(todayInBaku()),
        assignedById: actor.id,
      },
    });

    if (enrollment.student.lifecycleStatus === StudentLifecycleStatus.GROUP_WAITING) {
      await activateStudent(tx, {
        actorId: actor.id,
        studentId: enrollment.student.id,
        studentCode: enrollment.student.code,
        oldStatus: enrollment.student.lifecycleStatus,
        oldBillingPaused: enrollment.student.billingPaused,
        effectiveAt: dateFromInput(todayInBaku()),
      });
    }

    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "group.membership.add",
      entityType: "group_membership",
      entityId: membership.id,
      after: {
        groupId: group.id,
        enrollmentId: enrollment.id,
        studentId: enrollment.student.id,
        teacherId: teacher.id,
      },
      reason: "Tələbə qrupa əlavə edildi",
    });
    return { studentId: enrollment.student.id };
  });

  revalidateGroupSurfaces(result.studentId);
}

async function changeGroupMemberTeacherActionImpl(formData: FormData) {
  const actor = await requireGroupManager();
  const input = changeTeacherSchema.parse(Object.fromEntries(formData));
  const prisma = getPrisma();
  await prisma.$transaction(async (tx) => {
    const membership = await tx.groupMembership.findUnique({
      where: { id: input.membershipId },
      include: { enrollment: true },
    });
    const teacher = await tx.teacher.findUnique({ where: { id: input.teacherId } });
    if (!membership || membership.endedAt) throw new Error("Aktiv qrup üzvlüyü tapılmadı");
    if (!teacher?.isActive) throw new Error("Aktiv müəllim tapılmadı");
    if (membership.teacherId === teacher.id) return;

    await tx.groupMembership.update({ where: { id: membership.id }, data: { teacherId: teacher.id } });
    await tx.enrollment.update({ where: { id: membership.enrollmentId }, data: { teacherId: teacher.id } });
    await tx.teacherAssignmentHistory.create({
      data: {
        enrollmentId: membership.enrollmentId,
        oldTeacherId: membership.teacherId,
        newTeacherId: teacher.id,
        reason: "Qrup roster-ində müəllim dəyişdirildi",
        changedById: actor.id,
      },
    });
    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "group.membership.teacher.change",
      entityType: "group_membership",
      entityId: membership.id,
      before: { teacherId: membership.teacherId },
      after: { teacherId: teacher.id },
      reason: "Qrup müəllim təyinatı dəyişdirildi",
    });
  });
  revalidateGroupSurfaces();
}

async function endGroupMembershipActionImpl(formData: FormData) {
  const actor = await requireGroupManager();
  const input = membershipIdSchema.parse(Object.fromEntries(formData));
  const prisma = getPrisma();
  const membership = await prisma.$transaction(async (tx) => {
    const current = await tx.groupMembership.findUnique({ where: { id: input.membershipId } });
    if (!current || current.endedAt) throw new Error("Aktiv qrup üzvlüyü tapılmadı");
    const endedAt = dateFromInput(todayInBaku());
    const updated = await tx.groupMembership.update({ where: { id: current.id }, data: { endedAt } });
    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "group.membership.end",
      entityType: "group_membership",
      entityId: current.id,
      before: { endedAt: null },
      after: { endedAt: endedAt.toISOString() },
      reason: "Tələbənin qrup üzvlüyü bitirildi",
    });
    return updated;
  });
  revalidateGroupSurfaces(undefined, membership.groupId);
}

async function saveAttendanceActionImpl(formData: FormData) {
  const actor = await requireMutationActor("attendance.manage");
  const input = attendanceSchema.parse(Object.fromEntries(formData));
  const today = todayInBaku();
  if (input.date > today) throw new Error("Gələcək tarix üçün davamiyyət yazmaq olmaz");
  const prisma = getPrisma();
  const privileged = isPrivilegedActor(actor);
  const teacherProfile = privileged
    ? null
    : await prisma.teacher.findUnique({ where: { userId: actor.id }, select: { id: true } });
  if (!privileged && !teacherProfile) throw new Error("Müəllim profili ERP hesabına bağlanmayıb");

  const affectedTeacherIds = await prisma.$transaction(async (tx) => {
    const group = await tx.studentGroup.findUnique({
      where: { id: input.groupId },
      include: { schedules: true },
    });
    if (!group) throw new Error("Qrup tapılmadı");
    const schedule = group.schedules.find((item) => item.weekday === weekdayFromDate(input.date));
    if (!schedule) throw new Error("Seçilən tarix qrupun dərs gününə uyğun deyil");
    const date = dateFromInput(input.date);
    const memberships = await tx.groupMembership.findMany({
      where: {
        id: { in: input.items.map((item) => item.membershipId) },
        groupId: group.id,
        joinedAt: { lte: date },
        OR: [{ endedAt: null }, { endedAt: { gte: date } }],
        ...(teacherProfile ? { teacherId: teacherProfile.id } : {}),
      },
    });
    if (memberships.length !== input.items.length) {
      throw new Error("Davamiyyət siyahısında icazəsiz və ya etibarsız tələbə var");
    }
    const membershipById = new Map(memberships.map((membership) => [membership.id, membership]));
    const hasMarkedItem = input.items.some((item) => item.status !== null);
    let session = await tx.groupSession.findUnique({
      where: { groupId_sessionDate: { groupId: group.id, sessionDate: date } },
    });
    if (!session && hasMarkedItem) {
      session = await tx.groupSession.create({
        data: {
          groupId: group.id,
          scheduleId: schedule.id,
          sessionDate: date,
          startTime: schedule.startTime,
          endTime: schedule.endTime,
          createdById: actor.id,
        },
      });
    }

    for (const item of input.items) {
      const membership = membershipById.get(item.membershipId)!;
      if (!item.status) {
        if (session) {
          await tx.attendanceRecord.deleteMany({
            where: { sessionId: session.id, membershipId: membership.id },
          });
        }
        continue;
      }
      if (!session) throw new Error("Jurnal sessiyası yaradıla bilmədi");
      await tx.attendanceRecord.upsert({
        where: { sessionId_membershipId: { sessionId: session.id, membershipId: membership.id } },
        create: {
          sessionId: session.id,
          membershipId: membership.id,
          teacherId: membership.teacherId,
          status: item.status === "present" ? AttendanceMark.PRESENT : AttendanceMark.ABSENT,
          note: item.note || null,
          markedById: actor.id,
        },
        update: {
          teacherId: membership.teacherId,
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
      entityType: "group_session",
      entityId: session?.id ?? null,
      after: { groupId: group.id, date: input.date, items: input.items } as Prisma.InputJsonValue,
      reason: "Qrup jurnalı yeniləndi",
    });
    return [...new Set(memberships.map((membership) => membership.teacherId))];
  });

  await recalculateTeacherPayoutsForMonth(dateFromInput(input.date), actor.id, affectedTeacherIds);

  revalidateGroupSurfaces();
}

async function requireGroupManager() {
  const actor = await requireMutationActor("group.manage");
  if (!isPrivilegedActor(actor)) throw new Error("Qrup idarəetməsi üçün Owner/Admin icazəsi tələb olunur");
  return actor;
}

async function lockGroup(tx: Prisma.TransactionClient, groupId: string) {
  await tx.$queryRaw`SELECT id FROM "erp"."groups" WHERE id = ${groupId}::uuid FOR UPDATE`;
}

async function activateStudent(
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
  await tx.student.update({
    where: { id: input.studentId },
    data: buildStudentStatusUpdateData(StudentLifecycleStatus.ACTIVE, input.effectiveAt),
  });
  await tx.studentStatusHistory.create({
    data: {
      studentId: input.studentId,
      oldStatus: input.oldStatus,
      newStatus: StudentLifecycleStatus.ACTIVE,
      reason: "Qrupa əlavə edildiyi üçün tələbə aktiv edildi",
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
    before: { lifecycleStatus: input.oldStatus, billingPaused: input.oldBillingPaused },
    after: { lifecycleStatus: StudentLifecycleStatus.ACTIVE, billingPaused: false },
    reason: "Qrupa əlavə edildiyi üçün tələbə aktiv edildi",
  });
}

function revalidateGroupSurfaces(studentId?: string, groupId?: string) {
  revalidatePath("/groups");
  revalidatePath("/hr");
  revalidatePath("/students");
  revalidatePath("/dashboard");
  revalidatePath("/finance");
  if (studentId) revalidatePath(`/students/${studentId}`);
  if (groupId) revalidatePath(`/groups?group=${groupId}`);
  updateTag(erpCacheTags.groups);
  updateTag(erpCacheTags.attendance);
  updateTag(erpCacheTags.students);
  updateTag(erpCacheTags.dashboard);
  updateTag(erpCacheTags.finance);
}

export const createGroupAction = safeServerAction(
  createGroupActionImpl,
  "Qrup yaradılmadı.",
);
export const updateGroupAction = safeServerAction(
  updateGroupActionImpl,
  "Qrup yenilənmədi.",
);
export const archiveGroupAction = safeServerAction(
  archiveGroupActionImpl,
  "Qrup arxivlənmədi.",
);
export const addGroupMemberAction = safeServerAction(
  addGroupMemberActionImpl,
  "Tələbə qrupa əlavə edilmədi.",
);
export const changeGroupMemberTeacherAction = safeServerAction(
  changeGroupMemberTeacherActionImpl,
  "Müəllim təyinatı yenilənmədi.",
);
export const endGroupMembershipAction = safeServerAction(
  endGroupMembershipActionImpl,
  "Qrup üzvlüyü bitirilmədi.",
);
export const saveAttendanceAction = safeServerAction(
  saveAttendanceActionImpl,
  "Davamiyyət saxlanmadı.",
);
