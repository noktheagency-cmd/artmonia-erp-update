import { AppRole, EnrollmentStatus } from "@/generated/prisma/client";
import { requireErpActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";
import {
  formatDateAz,
  latestScheduledDate,
  todayInBaku,
  toDateInput,
  type GroupWeekdayCode,
} from "@/modules/groups/shared";

export type PlannerMember = {
  assignmentId: string;
  membershipId: string;
  enrollmentId: string;
  studentId: string;
  studentCode: string;
  studentName: string;
  program: string;
};

export type PlannerSlot = {
  id: string;
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

export type PlannerEnrollment = {
  id: string;
  studentId: string;
  studentCode: string;
  studentName: string;
  program: string;
  lessonsPerMonth: number | null;
  slotIds: string[];
};

export type PlannerJournalMember = PlannerMember & {
  attendanceStatus: "present" | "absent" | null;
  note: string;
};

export type PlannerWorkspaceData = {
  actorName: string;
  canManage: boolean;
  canManageAttendance: boolean;
  today: string;
  selectedSlotId: string;
  slots: PlannerSlot[];
  teachers: Array<{ id: string; name: string }>;
  enrollments: PlannerEnrollment[];
  journal: {
    slotId: string;
    date: string;
    dateLabel: string;
    members: PlannerJournalMember[];
    presentCount: number;
    absentCount: number;
    unmarkedCount: number;
  };
};

export async function getPlannerWorkspaceData(input?: {
  slotId?: string;
  date?: string;
}): Promise<PlannerWorkspaceData> {
  const actor = await requireErpActor("group.read");
  const prisma = getPrisma();
  const today = todayInBaku();
  const todayDate = new Date(`${today}T00:00:00.000Z`);
  const canManage = actor.permissions.has("group.manage");
  const canManageAttendance = actor.permissions.has("attendance.manage");
  const teacherProfile = actor.roles.includes(AppRole.TEACHER) && !canManage
    ? await prisma.teacher.findUnique({ where: { userId: actor.id }, select: { id: true } })
    : null;
  const teacherId = teacherProfile?.id;

  const [slots, teachers, enrollments] = await Promise.all([
    prisma.classSlot.findMany({
      where: {
        isActive: true,
        group: { isActive: true },
        validFrom: { lte: todayDate },
        OR: [{ validTo: null }, { validTo: { gte: todayDate } }],
        ...(teacherId ? { teacherId } : {}),
      },
      take: 250,
      orderBy: [{ startTime: "asc" }, { weekday: "asc" }],
      select: {
        id: true,
        groupId: true,
        weekday: true,
        shift: true,
        startTime: true,
        endTime: true,
        room: true,
        capacity: true,
        validFrom: true,
        teacher: { select: { id: true, fullName: true } },
        _count: {
          select: {
            assignments: {
              where: {
                validFrom: { lte: todayDate },
                OR: [{ validTo: null }, { validTo: { gte: todayDate } }],
              },
            },
          },
        },
        assignments: {
          where: {
            validFrom: { lte: todayDate },
            OR: [{ validTo: null }, { validTo: { gte: todayDate } }],
          },
          take: 100,
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            membership: {
              select: {
                id: true,
                enrollment: {
                  select: {
                    id: true,
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
      ? prisma.teacher.findMany({
          where: { isActive: true },
          take: 200,
          orderBy: { fullName: "asc" },
          select: { id: true, fullName: true },
        })
      : Promise.resolve([]),
    canManage
      ? prisma.enrollment.findMany({
          where: { status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.PAUSED] } },
          take: 750,
          orderBy: [{ student: { contact: { fullName: "asc" } } }, { createdAt: "desc" }],
          select: {
            id: true,
            lessonsPerMonth: true,
            program: { select: { name: true } },
            student: {
              select: {
                id: true,
                code: true,
                contact: { select: { fullName: true } },
              },
            },
            groupMemberships: {
              where: { endedAt: null },
              select: {
                scheduleAssignments: {
                  where: {
                    validFrom: { lte: todayDate },
                    OR: [{ validTo: null }, { validTo: { gte: todayDate } }],
                    slot: { isActive: true, group: { isActive: true } },
                  },
                  select: { slotId: true },
                },
              },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  const plannerSlots: PlannerSlot[] = slots.map((slot) => ({
    id: slot.id,
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
      enrollmentId: assignment.membership.enrollment.id,
      studentId: assignment.membership.enrollment.student.id,
      studentCode: assignment.membership.enrollment.student.code,
      studentName: assignment.membership.enrollment.student.contact.fullName,
      program: assignment.membership.enrollment.program.name,
    })),
  }));
  const selectedSlot = plannerSlots.find((slot) => slot.id === input?.slotId) ?? plannerSlots[0];
  const selectedSlotRecord = slots.find((slot) => slot.id === selectedSlot?.id);
  const selectedSlotId = selectedSlot?.id ?? "";
  const journalDate = selectedSlot
    ? latestScheduledDate([selectedSlot.weekday], input?.date, today)
    : today;

  const [journalAssignments, journalSession] = selectedSlot && selectedSlotRecord
    ? await Promise.all([
        prisma.studentScheduleAssignment.findMany({
          where: {
            slotId: selectedSlot.id,
            validFrom: { lte: new Date(`${journalDate}T00:00:00.000Z`) },
            OR: [
              { validTo: null },
              { validTo: { gte: new Date(`${journalDate}T00:00:00.000Z`) } },
            ],
          },
          take: 100,
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            membership: {
              select: {
                id: true,
                enrollment: {
                  select: {
                    id: true,
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
        }),
        prisma.groupSession.findUnique({
          where: {
            groupId_sessionDate: {
              groupId: selectedSlotRecord.groupId,
              sessionDate: new Date(`${journalDate}T00:00:00.000Z`),
            },
          },
          select: {
            attendance: {
              select: { membershipId: true, status: true, note: true },
            },
          },
        }),
      ])
    : [[], null] as const;

  const attendanceByMembership = new Map(
    journalSession?.attendance.map((item) => [item.membershipId, item]) ?? [],
  );
  const journalMembers: PlannerJournalMember[] = journalAssignments.map((assignment) => {
    const attendance = attendanceByMembership.get(assignment.membership.id);
    return {
      assignmentId: assignment.id,
      membershipId: assignment.membership.id,
      enrollmentId: assignment.membership.enrollment.id,
      studentId: assignment.membership.enrollment.student.id,
      studentCode: assignment.membership.enrollment.student.code,
      studentName: assignment.membership.enrollment.student.contact.fullName,
      program: assignment.membership.enrollment.program.name,
      attendanceStatus: attendance?.status === "PRESENT"
        ? "present"
        : attendance?.status === "ABSENT"
          ? "absent"
          : null,
      note: attendance?.note ?? "",
    };
  });

  return {
    actorName: actor.fullName,
    canManage,
    canManageAttendance,
    today,
    selectedSlotId,
    slots: plannerSlots,
    teachers: teachers.map((teacher) => ({ id: teacher.id, name: teacher.fullName })),
    enrollments: enrollments.map((enrollment) => ({
      id: enrollment.id,
      studentId: enrollment.student.id,
      studentCode: enrollment.student.code,
      studentName: enrollment.student.contact.fullName,
      program: enrollment.program.name,
      lessonsPerMonth: enrollment.lessonsPerMonth,
      slotIds: [...new Set(
        enrollment.groupMemberships.flatMap((membership) =>
          membership.scheduleAssignments.map((assignment) => assignment.slotId),
        ),
      )],
    })),
    journal: {
      slotId: selectedSlotId,
      date: journalDate,
      dateLabel: formatDateAz(journalDate),
      members: journalMembers,
      presentCount: journalMembers.filter((member) => member.attendanceStatus === "present").length,
      absentCount: journalMembers.filter((member) => member.attendanceStatus === "absent").length,
      unmarkedCount: journalMembers.filter((member) => member.attendanceStatus === null).length,
    },
  };
}

function mapShift(shift: "MORNING" | "AFTERNOON" | "EVENING"): PlannerSlot["shift"] {
  if (shift === "MORNING") return "morning";
  if (shift === "AFTERNOON") return "afternoon";
  return "evening";
}
