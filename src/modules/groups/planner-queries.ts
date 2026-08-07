import { AppRole, ClassShift } from "@/generated/prisma/client";
import { getPrisma } from "@/server/db/prisma";
import { requireErpActor } from "@/server/auth/actor";
import { todayInBaku, toDateInput, type GroupWeekdayCode } from "@/modules/groups/shared";

export type PlannerMember = {
  assignmentId: string;
  membershipId: string;
  studentId: string;
  studentCode: string;
  studentName: string;
  program: string;
};

export type PlannerSlot = {
  id: string;
  groupId: string;
  groupCode: string;
  weekday: GroupWeekdayCode;
  shift: "morning" | "afternoon" | "evening";
  startTime: string;
  endTime: string;
  teacherId: string;
  teacherName: string;
  room: string;
  capacity: number;
  validFrom: string;
  assignedCount: number;
  members: PlannerMember[];
};

export type PlannerWorkspaceData = {
  actorName: string;
  canManage: boolean;
  today: string;
  slots: PlannerSlot[];
  groups: Array<{ id: string; code: string; capacity: number }>;
  teachers: Array<{ id: string; name: string }>;
  memberships: Array<{
    id: string;
    groupId: string;
    studentId: string;
    studentCode: string;
    studentName: string;
    program: string;
    lessonsPerMonth: number | null;
  }>;
};

export async function getPlannerWorkspaceData(): Promise<PlannerWorkspaceData> {
  const actor = await requireErpActor("group.read");
  const prisma = getPrisma();
  const today = todayInBaku();
  const date = new Date(`${today}T00:00:00.000Z`);
  const canManage = actor.permissions.has("group.manage");
  const teacherProfile = actor.roles.includes(AppRole.TEACHER) && !canManage
    ? await prisma.teacher.findUnique({ where: { userId: actor.id }, select: { id: true } })
    : null;
  const teacherId = teacherProfile?.id;

  const [slots, groups, teachers, memberships] = await Promise.all([
    prisma.classSlot.findMany({
      where: {
        isActive: true,
        validFrom: { lte: date },
        OR: [{ validTo: null }, { validTo: { gte: date } }],
        ...(teacherId ? { teacherId } : {}),
      },
      take: 250,
      orderBy: [{ startTime: "asc" }, { weekday: "asc" }],
      select: {
        id: true,
        weekday: true,
        shift: true,
        startTime: true,
        endTime: true,
        room: true,
        capacity: true,
        validFrom: true,
        group: { select: { id: true, code: true } },
        teacher: { select: { id: true, fullName: true } },
        _count: {
          select: {
            assignments: {
              where: {
                validFrom: { lte: date },
                OR: [{ validTo: null }, { validTo: { gte: date } }],
              },
            },
          },
        },
        assignments: {
          where: {
            validFrom: { lte: date },
            OR: [{ validTo: null }, { validTo: { gte: date } }],
          },
          take: 8,
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            membership: {
              select: {
                id: true,
                enrollment: {
                  select: {
                    program: { select: { name: true } },
                    student: {
                      select: {
                        id: true,
                        code: true,
                        contact: { select: { fullName: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }),
    canManage
      ? prisma.studentGroup.findMany({
          where: { isActive: true },
          take: 100,
          orderBy: { code: "asc" },
          select: { id: true, code: true, capacity: true },
        })
      : Promise.resolve([]),
    canManage
      ? prisma.teacher.findMany({
          where: { isActive: true },
          take: 200,
          orderBy: { fullName: "asc" },
          select: { id: true, fullName: true },
        })
      : Promise.resolve([]),
    canManage
      ? prisma.groupMembership.findMany({
          where: { endedAt: null },
          take: 500,
          orderBy: { joinedAt: "desc" },
          select: {
            id: true,
            groupId: true,
            enrollment: {
              select: {
                lessonsPerMonth: true,
                program: { select: { name: true } },
                student: {
                  select: {
                    id: true,
                    code: true,
                    contact: { select: { fullName: true } },
                  },
                },
              },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  return {
    actorName: actor.fullName,
    canManage,
    today: toDateInput(date),
    slots: slots.map((slot) => ({
      id: slot.id,
      groupId: slot.group.id,
      groupCode: slot.group.code,
      weekday: slot.weekday,
      shift: mapShift(slot.shift),
      startTime: slot.startTime,
      endTime: slot.endTime,
      teacherId: slot.teacher.id,
      teacherName: slot.teacher.fullName,
      room: slot.room ?? "Otaq seçilməyib",
      capacity: slot.capacity,
      validFrom: toDateInput(slot.validFrom),
      assignedCount: slot._count.assignments,
      members: slot.assignments.map((assignment) => ({
        assignmentId: assignment.id,
        membershipId: assignment.membership.id,
        studentId: assignment.membership.enrollment.student.id,
        studentCode: assignment.membership.enrollment.student.code,
        studentName: assignment.membership.enrollment.student.contact.fullName,
        program: assignment.membership.enrollment.program.name,
      })),
    })),
    groups,
    teachers: teachers.map((teacher) => ({ id: teacher.id, name: teacher.fullName })),
    memberships: memberships.map((membership) => ({
      id: membership.id,
      groupId: membership.groupId,
      studentId: membership.enrollment.student.id,
      studentCode: membership.enrollment.student.code,
      studentName: membership.enrollment.student.contact.fullName,
      program: membership.enrollment.program.name,
      lessonsPerMonth: membership.enrollment.lessonsPerMonth,
    })),
  };
}

function mapShift(shift: ClassShift): PlannerSlot["shift"] {
  if (shift === ClassShift.MORNING) return "morning";
  if (shift === ClassShift.AFTERNOON) return "afternoon";
  return "evening";
}
