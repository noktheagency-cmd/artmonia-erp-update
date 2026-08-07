import { AppRole, EnrollmentStatus } from "@/generated/prisma/client";
import {
  dateFromInput,
  formatDateAz,
  latestScheduledDate,
  todayInBaku,
  toDateInput,
  weekdayFromDate,
  type GroupWeekdayCode,
} from "@/modules/groups/shared";
import { requireErpActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";

export type PlannerMember = {
  assignmentId: string;
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
  const canManage = actor.permissions.has("group.manage");
  const canManageAttendance = actor.permissions.has("attendance.manage");
  const teacherProfile = actor.roles.includes(AppRole.TEACHER) && !canManage
    ? await prisma.teacher.findUnique({ where: { userId: actor.id }, select: { id: true } })
    : null;
  const teacherId = teacherProfile?.id;

  const [slots, teachers, enrollments] = await Promise.all([
    prisma.classSlot.findMany({
      where: { ...(teacherId ? { teacherId } : {}) },
      take: 250,
      orderBy: [{ validFrom: "asc" }, { startTime: "asc" }, { weekday: "asc" }],
      select: {
        id: true,
        weekday: true,
        shift: true,
        startTime: true,
        endTime: true,
        room: true,
        capacity: true,
        validFrom: true,
        teacher: { select: { id: true, fullName: true } },
        assignments: {
          where: { validTo: null },
          take: 100,
          orderBy: { createdAt: "asc" },
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
            scheduleAssignments: {
              where: { validTo: null },
              select: { slotId: true },
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
    assignedCount: slot.assignments.length,
    members: slot.assignments.map((assignment) => ({
      assignmentId: assignment.id,
      enrollmentId: assignment.enrollment.id,
      studentId: assignment.enrollment.student.id,
      studentCode: assignment.enrollment.student.code,
      studentName: assignment.enrollment.student.contact.fullName,
      program: assignment.enrollment.program.name,
    })),
  }));
  const selectedSlot = plannerSlots.find((slot) => slot.id === input?.slotId) ?? plannerSlots[0];
  const selectedSlotId = selectedSlot?.id ?? "";
  const journalDate = selectedSlot
    ? selectedSlot.validFrom > today
      ? firstScheduledDate(selectedSlot.validFrom, selectedSlot.weekday)
      : latestScheduledDate([selectedSlot.weekday], input?.date, today)
    : today;
  const journalDateValue = dateFromInput(journalDate);

  const [journalAssignments, journalSession] = selectedSlot
    ? await Promise.all([
        prisma.studentScheduleAssignment.findMany({
          where: {
            slotId: selectedSlot.id,
            validFrom: { lte: journalDateValue },
            OR: [{ validTo: null }, { validTo: { gte: journalDateValue } }],
          },
          take: 100,
          orderBy: { createdAt: "asc" },
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
        }),
        prisma.slotSession.findUnique({
          where: {
            slotId_sessionDate: {
              slotId: selectedSlot.id,
              sessionDate: journalDateValue,
            },
          },
          select: {
            attendance: {
              select: { enrollmentId: true, status: true, note: true },
            },
          },
        }),
      ])
    : [[], null] as const;

  const attendanceByEnrollment = new Map(
    journalSession?.attendance.map((item) => [item.enrollmentId, item]) ?? [],
  );
  const journalMembers: PlannerJournalMember[] = journalAssignments.map((assignment) => {
    const attendance = attendanceByEnrollment.get(assignment.enrollment.id);
    return {
      assignmentId: assignment.id,
      enrollmentId: assignment.enrollment.id,
      studentId: assignment.enrollment.student.id,
      studentCode: assignment.enrollment.student.code,
      studentName: assignment.enrollment.student.contact.fullName,
      program: assignment.enrollment.program.name,
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
      slotIds: [...new Set(enrollment.scheduleAssignments.map((assignment) => assignment.slotId))],
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

function firstScheduledDate(validFrom: string, weekday: GroupWeekdayCode) {
  const start = dateFromInput(validFrom);
  for (let offset = 0; offset < 7; offset += 1) {
    const candidate = new Date(start);
    candidate.setUTCDate(start.getUTCDate() + offset);
    const value = toDateInput(candidate);
    if (weekdayFromDate(value) === weekday) return value;
  }
  return validFrom;
}

function mapShift(shift: "MORNING" | "AFTERNOON" | "EVENING"): PlannerSlot["shift"] {
  if (shift === "MORNING") return "morning";
  if (shift === "AFTERNOON") return "afternoon";
  return "evening";
}
