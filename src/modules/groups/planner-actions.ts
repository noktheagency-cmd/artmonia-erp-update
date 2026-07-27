"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { ClassShift, GroupWeekday, Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/server/db/prisma";
import { isPrivilegedActor, requireMutationActor } from "@/server/auth/actor";
import { writeAuditLog } from "@/modules/audit/audit-service";
import { erpCacheTags } from "@/modules/shared/cache-tags";
import { dateFromInput, todayInBaku } from "@/modules/groups/shared";
import { safeServerAction } from "@/server/actions/safe-action";

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const slotSchema = z.object({
  groupId: z.string().uuid(),
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
  membershipId: z.string().uuid(),
  slotIds: z.string().transform((value, context) => {
    try {
      return z.array(z.string().uuid()).min(1).max(14).parse(JSON.parse(value));
    } catch {
      context.addIssue({ code: "custom", message: "Slot seçimi düzgün deyil" });
      return z.NEVER;
    }
  }),
  validFrom: z.string().date(),
});

const updateSlotSchema = slotSchema.and(z.object({
  slotId: z.string().uuid(),
}));

async function createClassSlotActionImpl(formData: FormData) {
  const actor = await requirePlannerManager();
  const input = slotSchema.parse(Object.fromEntries(formData));
  const prisma = getPrisma();
  const slot = await prisma.$transaction(async (tx) => {
    const [group, teacher] = await Promise.all([
      tx.studentGroup.findUnique({ where: { id: input.groupId }, select: { id: true, isActive: true } }),
      tx.teacher.findUnique({ where: { id: input.teacherId }, select: { id: true, isActive: true } }),
    ]);
    if (!group?.isActive) throw new Error("Aktiv qrup tapılmadı");
    if (!teacher?.isActive) throw new Error("Aktiv müəllim tapılmadı");
    const created = await tx.classSlot.create({
      data: {
        ...input,
        room: input.room || null,
        validFrom: dateFromInput(input.validFrom),
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
  });
  revalidatePlanner();
  return { id: slot.id };
}

async function updateClassSlotActionImpl(formData: FormData) {
  const actor = await requirePlannerManager();
  const input = updateSlotSchema.parse(Object.fromEntries(formData));
  const today = todayInBaku();
  if (input.validFrom < today) {
    throw new Error("Keçmiş tarixdən başlayan slot dəyişikliyi edilə bilməz");
  }

  const prisma = getPrisma();
  const effectiveAt = dateFromInput(input.validFrom);
  const previousDay = new Date(effectiveAt);
  previousDay.setUTCDate(previousDay.getUTCDate() - 1);

  const updatedSlot = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "erp"."class_slots" WHERE id = ${input.slotId}::uuid FOR UPDATE`;
    const current = await tx.classSlot.findUnique({
      where: { id: input.slotId },
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
    if (current.groupId !== input.groupId) throw new Error("Slotun qrupu dəyişdirilə bilməz");
    if (effectiveAt < current.validFrom) {
      throw new Error("Dəyişiklik tarixi slotun başlanğıc tarixindən əvvəl ola bilməz");
    }
    if (current.validTo && effectiveAt > current.validTo) {
      throw new Error("Dəyişiklik tarixi slotun bitmə tarixindən sonra ola bilməz");
    }

    const [group, teacher] = await Promise.all([
      tx.studentGroup.findUnique({
        where: { id: current.groupId },
        select: { id: true, isActive: true },
      }),
      tx.teacher.findUnique({
        where: { id: input.teacherId },
        select: { id: true, isActive: true },
      }),
    ]);
    if (!group?.isActive) throw new Error("Aktiv qrup tapılmadı");
    if (!teacher?.isActive) throw new Error("Aktiv müəllim tapılmadı");

    const assignments = await tx.studentScheduleAssignment.findMany({
      where: {
        slotId: current.id,
        OR: [{ validTo: null }, { validTo: { gte: effectiveAt } }],
      },
      select: {
        id: true,
        membershipId: true,
        validFrom: true,
        validTo: true,
      },
    });
    if (maxConcurrentAssignments(assignments, effectiveAt) > input.capacity) {
      throw new Error("Yeni tutum bu tarixdən sonrakı tələbə sayından az ola bilməz");
    }

    const duplicate = await tx.classSlot.findFirst({
      where: {
        id: { not: current.id },
        groupId: current.groupId,
        teacherId: input.teacherId,
        weekday: input.weekday,
        startTime: input.startTime,
        validFrom: effectiveAt,
      },
      select: { id: true },
    });
    if (duplicate) throw new Error("Bu qrup, müəllim, gün və saat üçün eyni slot artıq mövcuddur");

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
      const updated = await tx.classSlot.update({
        where: { id: current.id },
        data: changes,
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

    await tx.classSlot.update({
      where: { id: current.id },
      data: { validTo: previousDay },
    });
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
      await tx.studentScheduleAssignment.deleteMany({
        where: { id: { in: futureAssignmentIds } },
      });
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
      after: {
        ...input,
        replacesSlotId: current.id,
        migratedAssignments: assignments.length,
      } as Prisma.InputJsonValue,
      reason: "Dərs slotunun tarixçəli yeni versiyası yaradıldı",
    });
    return replacement;
  });

  revalidatePlanner();
  return { id: updatedSlot.id };
}

async function replaceStudentScheduleActionImpl(formData: FormData) {
  const actor = await requirePlannerManager();
  const input = assignmentSchema.parse(Object.fromEntries(formData));
  const prisma = getPrisma();
  const validFrom = dateFromInput(input.validFrom);
  const previousDay = new Date(validFrom);
  previousDay.setUTCDate(previousDay.getUTCDate() - 1);

  await prisma.$transaction(async (tx) => {
    const membership = await tx.groupMembership.findUnique({
      where: { id: input.membershipId },
      select: { id: true, groupId: true, endedAt: true },
    });
    if (!membership || membership.endedAt) throw new Error("Aktiv qrup üzvlüyü tapılmadı");

    const slotIds = input.slotIds.map((id) => Prisma.sql`${id}::uuid`);
    await tx.$queryRaw`SELECT id FROM "erp"."class_slots" WHERE id IN (${Prisma.join(slotIds)}) FOR UPDATE`;
    const slots = await tx.classSlot.findMany({
      where: {
        id: { in: input.slotIds },
        groupId: membership.groupId,
        isActive: true,
        validFrom: { lte: validFrom },
        OR: [{ validTo: null }, { validTo: { gte: validFrom } }],
      },
      select: { id: true, capacity: true },
    });
    if (slots.length !== new Set(input.slotIds).size) {
      throw new Error("Seçilmiş slotlardan biri bu tələbənin qrupuna aid deyil");
    }

    const occupancy = await tx.studentScheduleAssignment.groupBy({
      by: ["slotId"],
      where: {
        slotId: { in: input.slotIds },
        membershipId: { not: membership.id },
        validFrom: { lte: validFrom },
        OR: [{ validTo: null }, { validTo: { gte: validFrom } }],
      },
      _count: { _all: true },
    });
    const countBySlot = new Map(occupancy.map((item) => [item.slotId, item._count._all]));
    const fullSlot = slots.find((slot) => (countBySlot.get(slot.id) ?? 0) >= slot.capacity);
    if (fullSlot) throw new Error("Seçilmiş slotlardan birinin tutumu doludur");

    const before = await tx.studentScheduleAssignment.findMany({
      where: {
        membershipId: membership.id,
        slot: { groupId: membership.groupId },
        OR: [{ validTo: null }, { validTo: { gte: validFrom } }],
      },
      select: { id: true, slotId: true, validFrom: true, validTo: true },
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
    await tx.studentScheduleAssignment.createMany({
      data: input.slotIds.map((slotId) => ({
        slotId,
        membershipId: membership.id,
        validFrom,
        assignedById: actor.id,
      })),
    });
    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "student_schedule.replace",
      entityType: "group_membership",
      entityId: membership.id,
      before: before as unknown as Prisma.InputJsonValue,
      after: { slotIds: input.slotIds, validFrom: input.validFrom },
      reason: "Tələbənin həftəlik dərs planı yeniləndi",
    });
  });

  revalidatePlanner();
}

async function requirePlannerManager() {
  const actor = await requireMutationActor("group.manage");
  if (!isPrivilegedActor(actor)) throw new Error("Planlayıcı üçün Owner/Admin icazəsi tələb olunur");
  return actor;
}

function revalidatePlanner() {
  revalidatePath("/groups");
  updateTag(erpCacheTags.groups);
  updateTag(erpCacheTags.attendance);
}

function maxConcurrentAssignments(
  assignments: Array<{ validFrom: Date; validTo: Date | null }>,
  effectiveAt: Date
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

export const createClassSlotAction = safeServerAction(
  createClassSlotActionImpl,
  "Dərs slotu yaradılmadı.",
);
export const updateClassSlotAction = safeServerAction(
  updateClassSlotActionImpl,
  "Dərs slotu yenilənmədi.",
);
export const replaceStudentScheduleAction = safeServerAction(
  replaceStudentScheduleActionImpl,
  "Tələbə cədvəli yenilənmədi.",
);
