import {
  AttendanceCaptureSource,
  AttendanceMark,
  SlotSessionStatus,
} from "@/generated/prisma/client";
import { buildAttendanceWindow } from "@/modules/attendance/attendance-time";
import { dateFromInput, todayInBaku } from "@/modules/groups/shared";
import { recalculateTeacherPayoutsForMonthInTransaction } from "@/modules/hr/teacher-payroll";
import { getPrisma } from "@/server/db/prisma";
import { getEnv } from "@/server/env";

export async function finalizeDueAttendanceSessions(now = new Date(), batchSize = 100) {
  const prisma = getPrisma();
  const env = getEnv();
  const candidates = await prisma.slotSession.findMany({
    where: {
      attendanceFinalizedAt: null,
      status: { in: [SlotSessionStatus.SCHEDULED, SlotSessionStatus.RESCHEDULED] },
      sessionDate: { lte: dateFromInput(todayInBaku()) },
      slot: { teacherId: { not: null } },
    },
    take: Math.min(Math.max(batchSize * 3, batchSize), 500),
    orderBy: [{ sessionDate: "asc" }, { endTime: "asc" }],
    select: {
      id: true,
      slotId: true,
      sessionDate: true,
      startTime: true,
      endTime: true,
      slot: { select: { teacherId: true } },
    },
  });
  const dueSessions = candidates.filter((session) => {
    const window = buildAttendanceWindow(session.sessionDate, session.startTime, session.endTime, {
      opensMinutesBefore: env.ATTENDANCE_CHECKIN_OPEN_MINUTES_BEFORE,
      closesMinutesAfter: env.ATTENDANCE_CHECKIN_CLOSE_MINUTES_AFTER,
    });
    return now > window.closesAt;
  }).slice(0, batchSize);

  if (!dueSessions.length) return { finalizedSessions: 0, createdAbsences: 0 };

  const sessionDates = dueSessions.map((session) => session.sessionDate.getTime());
  const minDate = new Date(Math.min(...sessionDates));
  const maxDate = new Date(Math.max(...sessionDates));
  const slotIds = [...new Set(dueSessions.map((session) => session.slotId))];
  const sessionIds = dueSessions.map((session) => session.id);
  const [assignments, existingAttendance] = await Promise.all([
    prisma.studentScheduleAssignment.findMany({
      where: {
        slotId: { in: slotIds },
        validFrom: { lte: maxDate },
        OR: [{ validTo: null }, { validTo: { gte: minDate } }],
      },
      select: { slotId: true, enrollmentId: true, validFrom: true, validTo: true },
    }),
    prisma.attendanceRecord.findMany({
      where: { sessionId: { in: sessionIds } },
      select: { sessionId: true, enrollmentId: true },
    }),
  ]);
  const existingKeys = new Set(existingAttendance.map((item) => `${item.sessionId}:${item.enrollmentId}`));
  const newAbsenceKeys = new Set<string>();
  const absences = dueSessions.flatMap((session) => {
    const teacherId = session.slot.teacherId;
    if (!teacherId) return [];
    return assignments
      .filter((assignment) => {
        const key = `${session.id}:${assignment.enrollmentId}`;
        const eligible = assignment.slotId === session.slotId
          && assignment.validFrom <= session.sessionDate
          && (!assignment.validTo || assignment.validTo >= session.sessionDate)
          && !existingKeys.has(key)
          && !newAbsenceKeys.has(key);
        if (eligible) newAbsenceKeys.add(key);
        return eligible;
      })
      .map((assignment) => ({
        sessionId: session.id,
        enrollmentId: assignment.enrollmentId,
        teacherId,
        status: AttendanceMark.ABSENT,
        source: AttendanceCaptureSource.AUTOMATIC,
        markedAt: now,
      }));
  });
  const payoutTargetsByMonth = new Map<string, { period: Date; teacherIds: Set<string> }>();
  for (const session of dueSessions) {
    const teacherId = session.slot.teacherId;
    if (!teacherId) continue;
    const monthKey = session.sessionDate.toISOString().slice(0, 7);
    const existingTarget = payoutTargetsByMonth.get(monthKey);
    if (existingTarget) existingTarget.teacherIds.add(teacherId);
    else {
      payoutTargetsByMonth.set(monthKey, {
        period: session.sessionDate,
        teacherIds: new Set([teacherId]),
      });
    }
  }

  await prisma.$transaction(async (tx) => {
    if (absences.length) {
      await tx.attendanceRecord.createMany({ data: absences, skipDuplicates: true });
    }
    await tx.slotSession.updateMany({
      where: { id: { in: sessionIds }, attendanceFinalizedAt: null },
      data: {
        attendanceFinalizedAt: now,
        status: SlotSessionStatus.COMPLETED,
      },
    });
    await tx.auditLog.createMany({
      data: dueSessions.map((session) => ({
        action: "attendance.session.finalize",
        entityType: "slot_session",
        entityId: session.id,
        afterJson: {
          automaticallyAbsent: absences.filter((item) => item.sessionId === session.id).length,
          finalizedAt: now.toISOString(),
        },
        reason: "Giriş pəncərəsi bağlandığı üçün davamiyyət avtomatik yekunlaşdırıldı",
      })),
    });
    for (const target of payoutTargetsByMonth.values()) {
      await recalculateTeacherPayoutsForMonthInTransaction(
        tx,
        target.period,
        null,
        [...target.teacherIds],
      );
    }
  });

  return { finalizedSessions: dueSessions.length, createdAbsences: absences.length };
}
