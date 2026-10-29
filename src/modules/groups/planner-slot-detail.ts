import "server-only";

import { EnrollmentStatus, StudentLifecycleStatus } from "@/generated/prisma/client";
import {
  dateFromInput,
  formatDateAz,
  todayInBaku,
  toDateInput,
} from "@/modules/groups/shared";
import { canEditAttendanceToday, recentScheduledDates } from "@/modules/groups/planner-journal";
import type {
  PlannerJournalHistoryItem,
  PlannerSlot,
  PlannerStudentDetail,
} from "@/modules/groups/planner-queries";
import { resolveFirstLessonActivationWarning } from "@/modules/students/activation-from-attendance";
import { formatAmount } from "@/modules/shared/format";
import { requireErpActor } from "@/server/auth/actor";
import { scopeFor } from "@/server/rbac/permissions";
import {
  buildPlannerSlotScope,
  resolvePlannerAccessScope,
} from "@/modules/groups/planner-scope";
import { getPrisma } from "@/server/db/prisma";
import { getUnpaidFirstLessonEnrollmentIds } from "@/modules/students/first-lesson-payment-gate";

export type PlannerSlotDetailPayload = {
  slotId: string;
  members: PlannerStudentDetail[];
  journalHistory: PlannerJournalHistoryItem[];
  journalCanEdit: boolean;
  journalDisabledReason: string | null;
};

export async function getPlannerSlotDetail(slotId: string): Promise<PlannerSlotDetailPayload> {
  const actor = await requireErpActor("group.read");
  const prisma = getPrisma();
  const today = todayInBaku();
  const canManage = actor.permissions.has("group.manage");
  const canReadStudentDetails = actor.permissions.has("student.read");
  const groupReadScope = resolvePlannerAccessScope({
    readScope: scopeFor(actor.permissions, "group.read"),
    canManage,
  });
  const teacherProfile = groupReadScope === "ASSIGNED"
    ? await prisma.teacher.findUnique({ where: { userId: actor.id }, select: { id: true } })
    : null;
  const slotScope = buildPlannerSlotScope(groupReadScope, teacherProfile?.id);

  const slot = await prisma.classSlot.findFirst({
    where: { id: slotId, ...slotScope },
    select: {
      id: true,
      weekday: true,
      startTime: true,
      endTime: true,
      room: true,
      validFrom: true,
      teacher: { select: { id: true } },
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
  });

  if (!slot) {
    return {
      slotId,
      members: [],
      journalHistory: [],
      journalCanEdit: false,
      journalDisabledReason: "Slot tapılmadı",
    };
  }

  const unpaidEnrollmentIds = await getUnpaidFirstLessonEnrollmentIds(
    prisma, slot.assignments.map(assignment => assignment.enrollment.id), dateFromInput(today),
  );
  const plannerSlot: Pick<
    PlannerSlot,
    "id" | "weekday" | "startTime" | "endTime" | "validFrom" | "teacherId" | "room" | "members"
  > = {
    id: slot.id,
    weekday: slot.weekday,
    startTime: slot.startTime,
    endTime: slot.endTime,
    validFrom: toDateInput(slot.validFrom),
    teacherId: slot.teacher?.id ?? null,
    room: slot.room ?? "Otaq seçilməyib",
    members: slot.assignments.map((assignment) => ({
      assignmentId: assignment.id,
      enrollmentId: assignment.enrollment.id,
      studentId: assignment.enrollment.student.id,
      studentCode: assignment.enrollment.student.code,
      studentName: assignment.enrollment.student.contact.fullName,
      program: assignment.enrollment.program.name,
      // Do not label SLOT_WAITING students as "Rezerv" when their planned
      // first lesson date arrives; activation is attendance-driven.
      reserved: assignment.enrollment.student.freezeReserved,
      paymentBlocked: unpaidEnrollmentIds.has(assignment.enrollment.id),
    })),
  };

  const journalDateValue = dateFromInput(today);
  const historyDates = recentScheduledDates({
    weekday: plannerSlot.weekday,
    validFrom: plannerSlot.validFrom,
    today,
    limit: 12,
  });
  const historyDateValues = historyDates.map(dateFromInput);
  const historyStartDate = historyDateValues.at(-1) ?? journalDateValue;

  const [detailedAssignments, historyAssignments, historySessions, journalSession] = await Promise.all([
    canReadStudentDetails
      ? prisma.studentScheduleAssignment.findMany({
          where: {
            slotId: plannerSlot.id,
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
        slotId: plannerSlot.id,
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
        slotId: plannerSlot.id,
        sessionDate: { in: historyDateValues },
      },
      take: historyDates.length,
      orderBy: { sessionDate: "desc" },
      select: {
        id: true,
        sessionDate: true,
        status: true,
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
    prisma.slotSession.findUnique({
      where: {
        slotId_sessionDate: {
          slotId: plannerSlot.id,
          sessionDate: journalDateValue,
        },
      },
      select: { status: true },
    }),
  ]);

  const members: PlannerStudentDetail[] = canReadStudentDetails
    ? detailedAssignments.map((assignment) => ({
        paymentBlocked: unpaidEnrollmentIds.has(assignment.enrollment.id),
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
    : plannerSlot.members.map((member) => ({
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
      id: session?.id ?? `${plannerSlot.id}-${date}`,
      canEdit: scopeFor(actor.permissions, "attendance.manage") === "ALL" && session?.status !== "CANCELLED" && session?.status !== "RESCHEDULED" && date <= today,
      date,
      dateLabel: formatDateAz(date),
      startTime: session?.startTime ?? plannerSlot.startTime,
      endTime: session?.endTime ?? plannerSlot.endTime,
      presentCount: records.filter((record) => record.attendanceStatus === "present").length,
      absentCount: records.filter((record) => record.attendanceStatus === "absent").length,
      excusedCount: records.filter((record) => record.attendanceStatus === "excused").length,
      unmarkedCount: records.filter((record) => record.attendanceStatus === null).length,
      records,
    };
  });

  const attendanceEditState = canEditAttendanceToday({
    today,
    weekday: plannerSlot.weekday,
    validFrom: plannerSlot.validFrom,
    hasTeacher: Boolean(plannerSlot.teacherId),
    sessionStatus: journalSession?.status ?? "SCHEDULED",
  });

  return {
    slotId: plannerSlot.id,
    members,
    journalHistory,
    journalCanEdit: attendanceEditState.canEdit,
    journalDisabledReason: attendanceEditState.reason,
  };
}
