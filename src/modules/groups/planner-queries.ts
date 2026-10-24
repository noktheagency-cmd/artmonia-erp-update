import { EnrollmentStatus, StudentLifecycleStatus } from "@/generated/prisma/client";
import {
  dateFromInput,
  formatDateAz,
  todayInBaku,
  toDateInput,
  type GroupWeekdayCode,
} from "@/modules/groups/shared";
import { canEditAttendanceToday, recentScheduledDates } from "@/modules/groups/planner-journal";
import { resolveFirstLessonActivationWarning } from "@/modules/students/activation-from-attendance";
import { formatAmount } from "@/modules/shared/format";
import { requireErpActor } from "@/server/auth/actor";
import { scopeFor } from "@/server/rbac/permissions";
import {
  buildPlannerSlotScope,
  resolvePlannerAccessScope,
} from "@/modules/groups/planner-scope";
import { getPrisma } from "@/server/db/prisma";


export type PlannerMember = {
  assignmentId: string;
  enrollmentId: string;
  studentId: string;
  studentCode: string;
  studentName: string;
  program: string;
  reserved?: boolean;
};

export type PlannerSlot = {
  id: string;
  weekday: GroupWeekdayCode;
  shift: "morning" | "afternoon" | "evening";
  startTime: string;
  endTime: string;
  teacherId: string | null;
  teacherName: string;
  displayName: string | null;
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
  teacherId: string | null;
  teacherName: string | null;
  lessonsPerMonth: number | null;
  firstLessonDate: string | null;
  slotIds: string[];
  /** BK-08: waiting student whose planned first lesson already passed. */
  activationWarning: string | null;
};

export type PlannerJournalMember = PlannerMember & {
  attendanceStatus: "present" | "absent" | "excused" | null;
  note: string;
};

export type PlannerStudentDetail = PlannerMember & {
  phone: string | null;
  email: string | null;
  educationLevel: string | null;
  lifecycleStatus: string;
  enrollmentStatus: string;
  registeredAt: string;
  enrollmentStartedAt: string;
  assignmentStartedAt: string;
  monthlyFee: string;
  lessonsPerMonth: number | null;
  managerName: string | null;
  notes: string | null;
  /** BK-08 */
  activationWarning: string | null;
  relatedContacts: Array<{
    id: string;
    name: string;
    phone: string | null;
    relationshipType: string;
    isPrimaryContact: boolean;
    isPayer: boolean;
  }>;
};

export type PlannerJournalHistoryItem = {
  id: string;
  date: string;
  dateLabel: string;
  startTime: string;
  endTime: string;
  presentCount: number;
  absentCount: number;
  excusedCount: number;
  unmarkedCount: number;
  records: Array<PlannerJournalMember & { markedAt: string | null }>;
};

export type PlannerWorkspaceData = {
  actorName: string;
  canManage: boolean;
  canManageAttendance: boolean;
  canReadStudentDetails: boolean;
  today: string;
  selectedSlotId: string;
  slots: PlannerSlot[];
  teachers: Array<{ id: string; name: string }>;
  enrollments: PlannerEnrollment[];
  slotDetail: {
    slotId: string;
    members: PlannerStudentDetail[];
    journalHistory: PlannerJournalHistoryItem[];
  };
  journal: {
    slotId: string;
    date: string;
    dateLabel: string;
    status: "SCHEDULED" | "COMPLETED" | "CANCELLED" | "RESCHEDULED";
    startTime: string;
    endTime: string;
    location: string;
    canEdit: boolean;
    disabledReason: string | null;
    members: PlannerJournalMember[];
    presentCount: number;
    absentCount: number;
    excusedCount: number;
    unmarkedCount: number;
  };
};

export async function getPlannerWorkspaceData(input?: {
  slotId?: string;
}): Promise<PlannerWorkspaceData> {
  const actor = await requireErpActor("group.read");
  const prisma = getPrisma();
  const today = todayInBaku();
  const canManage = actor.permissions.has("group.manage");
  const canManageAttendance = actor.permissions.has("attendance.manage");
  const canReadStudentDetails = actor.permissions.has("student.read");
  const groupReadScope = resolvePlannerAccessScope({
    readScope: scopeFor(actor.permissions, "group.read"),
    canManage,
  });
  const teacherProfile = groupReadScope === "ASSIGNED"
    ? await prisma.teacher.findUnique({ where: { userId: actor.id }, select: { id: true } })
    : null;
  const teacherId = teacherProfile?.id;
  const slotScope = buildPlannerSlotScope(groupReadScope, teacherId);

  const [slots, teachers, enrollments] = await Promise.all([
    prisma.classSlot.findMany({
      where: slotScope,
      take: 250,
      orderBy: [{ validFrom: "asc" }, { startTime: "asc" }, { weekday: "asc" }],
      select: {
        id: true,
        weekday: true,
        shift: true,
        startTime: true,
        endTime: true,
        displayName: true,
        room: true,
        capacity: true,
        validFrom: true,
        teacher: { select: { id: true, fullName: true } },
        assignments: {
          where: {
            validTo: null,
            enrollment: {
              status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.PAUSED] },
              student: {
                OR: [
                  { lifecycleStatus: StudentLifecycleStatus.ACTIVE },
                  { lifecycleStatus: StudentLifecycleStatus.SLOT_WAITING },
                  { freezeReserved: true },
                ],
              },
            },
          },
          take: 100,
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            validFrom: true,
            enrollment: {
              select: {
                id: true,
                program: { select: { name: true } },
                student: {
                  select: {
                    id: true,
                    code: true,
                    lifecycleStatus: true,
                    freezeReserved: true,
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
          where: {
            status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.PAUSED] },
            student: {
              lifecycleStatus: {
                in: [StudentLifecycleStatus.ACTIVE, StudentLifecycleStatus.SLOT_WAITING],
              },
            },
          },
          take: 750,
          orderBy: [{ student: { contact: { fullName: "asc" } } }, { createdAt: "desc" }],
          select: {
            id: true,
            lessonsPerMonth: true,
            firstLessonAt: true,
            program: { select: { name: true } },
            teacher: { select: { id: true, fullName: true } },
            student: {
              select: {
                id: true,
                code: true,
                lifecycleStatus: true,
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
    teacherId: slot.teacher?.id ?? null,
    teacherName: slot.teacher?.fullName ?? "Müəllim təyin edilməyib",
    displayName: slot.displayName,
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
      // "Rezerv" is only for a seat-preserving freeze. SLOT_WAITING remains
      // "Slot gözləyir" until first-lesson attendance is marked PRESENT.
      reserved: assignment.enrollment.student.freezeReserved,
    })),
  }));
  const selectedSlot = plannerSlots.find((slot) => slot.id === input?.slotId) ?? plannerSlots[0];
  const selectedSlotId = selectedSlot?.id ?? "";
  const journalDate = today;
  const journalDateValue = dateFromInput(journalDate);
  const historyDates = selectedSlot
    ? recentScheduledDates({
        weekday: selectedSlot.weekday,
        validFrom: selectedSlot.validFrom,
        today,
        limit: 12,
      })
    : [];
  const historyDateValues = historyDates.map(dateFromInput);
  const historyStartDate = historyDateValues.at(-1) ?? journalDateValue;

  const [
    journalAssignments,
    journalSession,
    detailedAssignments,
    historyAssignments,
    historySessions,
  ] = selectedSlot
    ? await Promise.all([
        prisma.studentScheduleAssignment.findMany({
          where: {
            slotId: selectedSlot.id,
            enrollment: {
              status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.PAUSED] },
              student: {
                lifecycleStatus: {
                  in: [StudentLifecycleStatus.ACTIVE, StudentLifecycleStatus.SLOT_WAITING],
                },
              },
            },
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
            status: true,
            startTime: true,
            endTime: true,
            locationOverride: true,
            attendance: {
              select: { enrollmentId: true, status: true, note: true },
            },
          },
        }),
        canReadStudentDetails
          ? prisma.studentScheduleAssignment.findMany({
              where: {
                slotId: selectedSlot.id,
                validTo: null,
                enrollment: {
                  status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.PAUSED] },
                  student: {
                    OR: [
                      { lifecycleStatus: StudentLifecycleStatus.ACTIVE },
                      { lifecycleStatus: StudentLifecycleStatus.SLOT_WAITING },
                      { freezeReserved: true },
                    ],
                  },
                },
              },
              take: 100,
              orderBy: { createdAt: "asc" },
              select: {
                id: true,
                validFrom: true,
                enrollment: {
                  select: {
                    id: true,
                    status: true,
                    startDate: true,
                    monthlyFee: true,
                    lessonsPerMonth: true,
                    firstLessonAt: true,
                    program: { select: { name: true } },
                    student: {
                      select: {
                        id: true,
                        code: true,
                        lifecycleStatus: true,
                        freezeReserved: true,
                        educationLevel: true,
                        registeredAt: true,
                        notes: true,
                        contact: {
                          select: {
                            fullName: true,
                            phoneDisplay: true,
                            email: true,
                          },
                        },
                        manager: { select: { fullName: true } },
                        relationships: {
                          take: 10,
                          orderBy: [{ isPrimaryContact: "desc" }, { createdAt: "asc" }],
                          select: {
                            id: true,
                            relationshipType: true,
                            isPrimaryContact: true,
                            isPayer: true,
                            relatedContact: {
                              select: { fullName: true, phoneDisplay: true },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            })
          : Promise.resolve([]),
        prisma.studentScheduleAssignment.findMany({
          where: {
            slotId: selectedSlot.id,
            validFrom: { lte: journalDateValue },
            OR: [{ validTo: null }, { validTo: { gte: historyStartDate } }],
          },
          take: 250,
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            validFrom: true,
            validTo: true,
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
        prisma.slotSession.findMany({
          where: {
            slotId: selectedSlot.id,
            sessionDate: { in: historyDateValues },
          },
          take: historyDates.length,
          orderBy: { sessionDate: "desc" },
          select: {
            id: true,
            sessionDate: true,
            startTime: true,
            endTime: true,
            attendance: {
              take: 100,
              select: {
                enrollmentId: true,
                status: true,
                note: true,
                markedAt: true,
              },
            },
          },
        }),
      ])
    : [[], null, [], [], []] as const;

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
          : attendance?.status === "EXCUSED"
            ? "excused"
          : null,
      note: attendance?.note ?? "",
    };
  });

  const slotDetailMembers: PlannerStudentDetail[] = canReadStudentDetails
    ? detailedAssignments.map((assignment) => ({
        assignmentId: assignment.id,
        enrollmentId: assignment.enrollment.id,
        studentId: assignment.enrollment.student.id,
        studentCode: assignment.enrollment.student.code,
        studentName: assignment.enrollment.student.contact.fullName,
        program: assignment.enrollment.program.name,
        phone: assignment.enrollment.student.contact.phoneDisplay,
        email: assignment.enrollment.student.contact.email,
        educationLevel: assignment.enrollment.student.educationLevel,
        lifecycleStatus: assignment.enrollment.student.lifecycleStatus,
        enrollmentStatus: assignment.enrollment.status,
        registeredAt: toDateInput(assignment.enrollment.student.registeredAt),
        enrollmentStartedAt: toDateInput(assignment.enrollment.startDate),
        assignmentStartedAt: toDateInput(assignment.validFrom),
        reserved: assignment.enrollment.student.freezeReserved,
        monthlyFee: formatAmount(assignment.enrollment.monthlyFee),
        lessonsPerMonth: assignment.enrollment.lessonsPerMonth,
        managerName: assignment.enrollment.student.manager?.fullName ?? null,
        notes: assignment.enrollment.student.notes,
        activationWarning: resolveFirstLessonActivationWarning({
          lifecycleStatus: assignment.enrollment.student.lifecycleStatus,
          plannedFirstLessonAt: assignment.enrollment.firstLessonAt,
        }),
        relatedContacts: assignment.enrollment.student.relationships.map((relationship) => ({
          id: relationship.id,
          name: relationship.relatedContact.fullName,
          phone: relationship.relatedContact.phoneDisplay,
          relationshipType: relationship.relationshipType,
          isPrimaryContact: relationship.isPrimaryContact,
          isPayer: relationship.isPayer,
        })),
      }))
    : (selectedSlot?.members ?? []).map((member) => ({
        ...member,
        phone: null,
        email: null,
        educationLevel: null,
        lifecycleStatus: "",
        enrollmentStatus: "",
        registeredAt: "",
        enrollmentStartedAt: "",
        assignmentStartedAt: "",
        monthlyFee: "",
        lessonsPerMonth: null,
        managerName: null,
        notes: null,
        activationWarning: null,
        relatedContacts: [],
      }));

  const historySessionByDate = new Map(
    historySessions.map((session) => [toDateInput(session.sessionDate), session]),
  );
  const journalHistory: PlannerJournalHistoryItem[] = historyDates.map((date) => {
    const session = historySessionByDate.get(date);
    const attendanceByEnrollment = new Map(
      session?.attendance.map((record) => [record.enrollmentId, record]) ?? [],
    );
    const records = historyAssignments
      .filter((assignment) => (
        toDateInput(assignment.validFrom) <= date
        && (!assignment.validTo || toDateInput(assignment.validTo) >= date)
      ))
      .map((assignment) => {
        const attendance = attendanceByEnrollment.get(assignment.enrollment.id);
        return {
          assignmentId: `${date}-${assignment.id}`,
          enrollmentId: assignment.enrollment.id,
          studentId: assignment.enrollment.student.id,
          studentCode: assignment.enrollment.student.code,
          studentName: assignment.enrollment.student.contact.fullName,
          program: assignment.enrollment.program.name,
          attendanceStatus: attendance?.status === "PRESENT"
            ? "present" as const
            : attendance?.status === "EXCUSED"
              ? "excused" as const
              : attendance?.status === "ABSENT"
                ? "absent" as const
                : null,
          note: attendance?.note ?? "",
          markedAt: attendance?.markedAt.toISOString() ?? null,
        };
      })
      .toSorted((left, right) => left.studentName.localeCompare(right.studentName, "az"));
    return {
      id: session?.id ?? `${selectedSlotId}-${date}`,
      date,
      dateLabel: formatDateAz(date),
      startTime: session?.startTime ?? selectedSlot?.startTime ?? "",
      endTime: session?.endTime ?? selectedSlot?.endTime ?? "",
      presentCount: records.filter((record) => record.attendanceStatus === "present").length,
      absentCount: records.filter((record) => record.attendanceStatus === "absent").length,
      excusedCount: records.filter((record) => record.attendanceStatus === "excused").length,
      unmarkedCount: records.filter((record) => record.attendanceStatus === null).length,
      records,
    };
  });
  const journalStatus = journalSession?.status ?? "SCHEDULED";
  const attendanceEditState = selectedSlot
    ? canEditAttendanceToday({
        today,
        weekday: selectedSlot.weekday,
        validFrom: selectedSlot.validFrom,
        hasTeacher: Boolean(selectedSlot.teacherId),
        sessionStatus: journalStatus,
      })
    : { canEdit: false, reason: "Slot seçilməyib" };

  return {
    actorName: actor.fullName,
    canManage,
    canManageAttendance,
    canReadStudentDetails,
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
      teacherId: enrollment.teacher?.id ?? null,
      teacherName: enrollment.teacher?.fullName ?? null,
      lessonsPerMonth: enrollment.lessonsPerMonth,
      firstLessonDate: enrollment.firstLessonAt ? toDateInput(enrollment.firstLessonAt) : null,
      slotIds: [...new Set(enrollment.scheduleAssignments.map((assignment) => assignment.slotId))],
      activationWarning: resolveFirstLessonActivationWarning({
        lifecycleStatus: enrollment.student.lifecycleStatus,
        plannedFirstLessonAt: enrollment.firstLessonAt,
      }),
    })),
    slotDetail: {
      slotId: selectedSlotId,
      members: slotDetailMembers,
      journalHistory,
    },
    journal: {
      slotId: selectedSlotId,
      date: journalDate,
      dateLabel: formatDateAz(journalDate),
      status: journalStatus,
      startTime: journalSession?.startTime ?? selectedSlot?.startTime ?? "",
      endTime: journalSession?.endTime ?? selectedSlot?.endTime ?? "",
      location: journalSession?.locationOverride
        ?? (selectedSlot?.room === "Otaq seçilməyib" ? "" : selectedSlot?.room ?? ""),
      canEdit: attendanceEditState.canEdit,
      disabledReason: attendanceEditState.reason,
      members: journalMembers,
      presentCount: journalMembers.filter((member) => member.attendanceStatus === "present").length,
      absentCount: journalMembers.filter((member) => member.attendanceStatus === "absent").length,
      excusedCount: journalMembers.filter((member) => member.attendanceStatus === "excused").length,
      unmarkedCount: journalMembers.filter((member) => member.attendanceStatus === null).length,
    },
  };
}

function mapShift(shift: "MORNING" | "AFTERNOON" | "EVENING"): PlannerSlot["shift"] {
  if (shift === "MORNING") return "morning";
  if (shift === "AFTERNOON") return "afternoon";
  return "evening";
}
