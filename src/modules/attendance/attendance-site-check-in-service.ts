import { createHash } from "node:crypto";
import {
  AttendanceCaptureSource,
  AttendanceMark,
  EnrollmentStatus,
  Prisma,
  SlotSessionStatus,
} from "@/generated/prisma/client";
import { attendanceQrTokenFingerprint, hashAttendanceQrToken } from "@/modules/attendance/attendance-qr-service";
import { attendanceWindowState, buildAttendanceWindow, formatBakuIso } from "@/modules/attendance/attendance-time";
import type {
  MobileAttendanceErrorCode,
  MobileAttendanceResponseBody,
  MobileAttendanceResult,
  MobileCheckInInput,
} from "@/modules/attendance/mobile-attendance-contract";
import { dateFromInput, weekdayFromDate } from "@/modules/groups/shared";
import { getPrisma } from "@/server/db/prisma";
import { getEnv } from "@/server/env";

const RATE_LIMIT_PER_STUDENT_PER_MINUTE = 20;

type MobileCheckInMetadata = {
  idempotencyKey: string;
  requestId: string;
  receivedAt?: Date;
};

export async function processMobileAttendanceSiteCheckIn(
  input: MobileCheckInInput,
  metadata: MobileCheckInMetadata,
): Promise<MobileAttendanceResult> {
  const prisma = getPrisma();
  const receivedAt = metadata.receivedAt ?? new Date();
  const scannedAt = new Date(input.scannedAt);
  const requestHash = buildRequestHash(input);
  const env = getEnv();

  return prisma.$transaction(async (tx) => {
    const lockKeys = [metadata.idempotencyKey, input.clientEventId].sort();
    for (const lockKey of lockKeys) {
      await tx.$executeRaw(Prisma.sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
    }

    const existingRequest = await tx.mobileAttendanceCheckIn.findFirst({
      where: {
        OR: [
          { idempotencyKey: metadata.idempotencyKey },
          { clientEventId: input.clientEventId },
        ],
      },
      select: { requestHash: true, httpStatus: true, responseJson: true, requestId: true },
    });
    if (existingRequest) {
      if (existingRequest.requestHash !== requestHash) {
        return errorResult(
          "IDEMPOTENCY_CONFLICT",
          409,
          "Idempotency-Key və ya clientEventId əvvəl fərqli sorğu üçün istifadə olunub.",
          existingRequest.requestId,
        );
      }
      if (existingRequest.httpStatus && existingRequest.responseJson) {
        return {
          httpStatus: existingRequest.httpStatus,
          body: existingRequest.responseJson as MobileAttendanceResponseBody,
        };
      }
      return errorResult("INTERNAL_ERROR", 500, "Sorğunun əvvəlki icrası tamamlanmayıb.", existingRequest.requestId);
    }

    const recentRequestCount = await tx.mobileAttendanceCheckIn.count({
      where: {
        erpStudentId: input.erpStudentId,
        receivedAt: { gte: new Date(receivedAt.getTime() - 60_000) },
      },
    });
    const requestRecord = await tx.mobileAttendanceCheckIn.create({
      data: {
        idempotencyKey: metadata.idempotencyKey,
        clientEventId: input.clientEventId,
        requestId: metadata.requestId,
        requestHash,
        erpStudentId: input.erpStudentId,
        qrTokenFingerprint: attendanceQrTokenFingerprint(input.qrToken),
        scannedAt,
        receivedAt,
      },
      select: { id: true },
    });

    const finish = async (
      result: MobileAttendanceResult,
      relations?: {
        studentId?: string;
        enrollmentId?: string;
        sessionId?: string;
        attendanceSiteId?: string;
        attendanceRecordId?: string;
      },
    ) => {
      await tx.mobileAttendanceCheckIn.update({
        where: { id: requestRecord.id },
        data: {
          completedAt: new Date(),
          httpStatus: result.httpStatus,
          resultCode: String(result.body.code ?? result.body.status ?? "UNKNOWN"),
          responseJson: result.body as Prisma.InputJsonValue,
          ...relations,
        },
      });
      return result;
    };

    if (recentRequestCount >= RATE_LIMIT_PER_STUDENT_PER_MINUTE) {
      return finish(errorResult(
        "RATE_LIMITED",
        429,
        "Bu tələbə üçün həddindən artıq davamiyyət sorğusu göndərilib.",
        metadata.requestId,
      ));
    }

    const site = await tx.attendanceSite.findUnique({
      where: { token: input.qrToken },
      select: { id: true, name: true, locationLabel: true, isActive: true },
    });
    if (!site?.isActive) {
      return finish(errorResult("QR_INVALID", 400, "Ümumi QR aktiv deyil.", metadata.requestId));
    }

    const student = await tx.student.findUnique({
      where: { id: input.erpStudentId },
      select: { id: true },
    });
    if (!student) {
      return finish(errorResult("STUDENT_NOT_FOUND", 404, "Tələbə ERP-də tapılmadı.", metadata.requestId), {
        attendanceSiteId: site.id,
      });
    }
    if (!input.deviceInstallationId) {
      return finish(errorResult(
        "DEVICE_REQUIRED",
        400,
        "Ümumi QR üçün daimi cihaz identifikatoru tələb olunur.",
        metadata.requestId,
      ), { studentId: student.id, attendanceSiteId: site.id });
    }

    await tx.$executeRaw(Prisma.sql`
      select pg_advisory_xact_lock(hashtextextended(${`mobile-device:${input.deviceInstallationId}`}, 0))
    `);
    const mobileAccount = await tx.studentMobileAccount.findUnique({
      where: { studentId: student.id },
      select: { id: true, deviceInstallationId: true },
    });
    const deviceOwner = await tx.studentMobileAccount.findUnique({
      where: { deviceInstallationId: input.deviceInstallationId },
      select: { studentId: true },
    });
    if (
      !mobileAccount
      || (mobileAccount.deviceInstallationId && mobileAccount.deviceInstallationId !== input.deviceInstallationId)
      || (deviceOwner && deviceOwner.studentId !== student.id)
    ) {
      return finish(errorResult(
        "DEVICE_MISMATCH",
        403,
        "Bu hesab başqa mobil cihaza bağlıdır.",
        metadata.requestId,
      ), { studentId: student.id, attendanceSiteId: site.id });
    }
    if (!mobileAccount.deviceInstallationId) {
      await tx.studentMobileAccount.update({
        where: { id: mobileAccount.id },
        data: {
          deviceInstallationId: input.deviceInstallationId,
          deviceBoundAt: receivedAt,
        },
      });
      await tx.auditLog.create({
        data: {
          action: "student.mobile_device.bind",
          entityType: "student",
          entityId: student.id,
          afterJson: { deviceInstallationId: input.deviceInstallationId },
          reason: "İlk ümumi QR check-in zamanı mobil cihaz hesaba bağlandı",
        },
      });
    }

    const resolution = await resolveCurrentStudentLesson(tx, student.id, receivedAt, {
      opensMinutesBefore: env.ATTENDANCE_CHECKIN_OPEN_MINUTES_BEFORE,
      closesMinutesAfter: env.ATTENDANCE_CHECKIN_CLOSE_MINUTES_AFTER,
    });
    if (!resolution.ok) {
      return finish(errorResult(
        resolution.code,
        422,
        resolution.message,
        metadata.requestId,
      ), { studentId: student.id, attendanceSiteId: site.id });
    }

    const { session, enrollment, window } = resolution;
    await tx.$executeRaw(Prisma.sql`
      select pg_advisory_xact_lock(hashtextextended(${`${session.id}:${enrollment.id}`}, 0))
    `);
    const existingAttendance = await tx.attendanceRecord.findUnique({
      where: { sessionId_enrollmentId: { sessionId: session.id, enrollmentId: enrollment.id } },
      select: { id: true, status: true, markedAt: true },
    });
    const attendance = existingAttendance?.status === AttendanceMark.PRESENT
      ? existingAttendance
      : await tx.attendanceRecord.upsert({
          where: { sessionId_enrollmentId: { sessionId: session.id, enrollmentId: enrollment.id } },
          create: {
            sessionId: session.id,
            enrollmentId: enrollment.id,
            teacherId: session.slot.teacherId,
            status: AttendanceMark.PRESENT,
            source: AttendanceCaptureSource.MOBILE_QR,
            markedAt: receivedAt,
          },
          update: {
            teacherId: session.slot.teacherId,
            status: AttendanceMark.PRESENT,
            source: AttendanceCaptureSource.MOBILE_QR,
            markedById: null,
            markedAt: receivedAt,
          },
          select: { id: true, status: true, markedAt: true },
        });

    const alreadyCheckedIn = existingAttendance?.status === AttendanceMark.PRESENT;
    return finish({
      httpStatus: 200,
      body: {
        checkInId: attendance.id,
        status: alreadyCheckedIn ? "already_checked_in" : "checked_in",
        mode: "site_qr",
        message: alreadyCheckedIn
          ? "Bu dərs üçün davamiyyət artıq qeydə alınıb."
          : "Dərsə giriş təsdiqləndi.",
        requestId: metadata.requestId,
        site: {
          id: site.id,
          name: site.name,
          location: site.locationLabel,
        },
        lesson: {
          id: session.id,
          title: session.title ?? enrollment.program.name,
          startsAt: formatBakuIso(window.startsAt),
          endsAt: formatBakuIso(window.endsAt),
          teacherName: session.slot.teacher.fullName,
          location: session.locationOverride ?? session.slot.room ?? site.locationLabel ?? "Təyin edilməyib",
        },
        attendance: {
          status: "present",
          checkedInAt: attendance.markedAt.toISOString(),
        },
      },
    }, {
      studentId: student.id,
      enrollmentId: enrollment.id,
      sessionId: session.id,
      attendanceSiteId: site.id,
      attendanceRecordId: attendance.id,
    });
  });
}

async function resolveCurrentStudentLesson(
  tx: Prisma.TransactionClient,
  studentId: string,
  receivedAt: Date,
  policy: { opensMinutesBefore: number; closesMinutesAfter: number },
) {
  const date = formatBakuIso(receivedAt).slice(0, 10);
  const sessionDate = dateFromInput(date);
  const assignments = await tx.studentScheduleAssignment.findMany({
    where: {
      enrollment: { studentId, status: EnrollmentStatus.ACTIVE },
      validFrom: { lte: sessionDate },
      OR: [{ validTo: null }, { validTo: { gte: sessionDate } }],
      slot: { weekday: weekdayFromDate(date) },
    },
    orderBy: { createdAt: "asc" },
    select: {
      slotId: true,
      enrollment: { select: { id: true, program: { select: { name: true } } } },
      slot: { select: { startTime: true, endTime: true } },
    },
  });
  if (!assignments.length) {
    return noLesson("Bu vaxt üçün aktiv dərs planınız yoxdur.");
  }

  const uniqueSlots = new Map(assignments.map((assignment) => [assignment.slotId, assignment]));
  await tx.slotSession.createMany({
    data: [...uniqueSlots.values()].map((assignment) => ({
      slotId: assignment.slotId,
      sessionDate,
      startTime: assignment.slot.startTime,
      endTime: assignment.slot.endTime,
    })),
    skipDuplicates: true,
  });
  const sessions = await tx.slotSession.findMany({
    where: { slotId: { in: [...uniqueSlots.keys()] }, sessionDate },
    select: {
      id: true,
      slotId: true,
      title: true,
      sessionDate: true,
      startTime: true,
      endTime: true,
      locationOverride: true,
      status: true,
      attendanceFinalizedAt: true,
      slot: {
        select: {
          teacherId: true,
          room: true,
          teacher: { select: { fullName: true } },
        },
      },
    },
  });
  const openSessions = sessions.flatMap((session) => {
    const window = buildAttendanceWindow(session.sessionDate, session.startTime, session.endTime, policy);
    return attendanceWindowState(receivedAt, window.opensAt, window.closesAt) === "OPEN"
      ? [{ session, window }]
      : [];
  });
  const candidates = openSessions
    .filter(({ session }) => (
      !session.attendanceFinalizedAt
      && (session.status === SlotSessionStatus.SCHEDULED || session.status === SlotSessionStatus.RESCHEDULED)
      && session.slot.teacherId
      && session.slot.teacher
    ))
    .toSorted((left, right) => (
      Math.abs(left.window.startsAt.getTime() - receivedAt.getTime())
      - Math.abs(right.window.startsAt.getTime() - receivedAt.getTime())
    ));
  const selected = candidates[0];
  if (!selected || !selected.session.slot.teacherId || !selected.session.slot.teacher) {
    if (openSessions.some(({ session }) => session.status === SlotSessionStatus.CANCELLED)) {
      return {
        ok: false as const,
        code: "LESSON_CANCELLED" as const,
        message: "Bu vaxtdakı dərsiniz ləğv edilib.",
      };
    }
    return noLesson("Hazırda check-in üçün açıq dərsiniz yoxdur.");
  }
  const assignment = uniqueSlots.get(selected.session.slotId);
  if (!assignment) return noLesson("Dərs qeydiyyatınız tapılmadı.");

  return {
    ok: true as const,
    session: {
      ...selected.session,
      slot: {
        ...selected.session.slot,
        teacherId: selected.session.slot.teacherId,
        teacher: selected.session.slot.teacher,
      },
    },
    enrollment: assignment.enrollment,
    window: selected.window,
  };
}

function noLesson(message: string) {
  return { ok: false as const, code: "NO_ACTIVE_LESSON" as const, message };
}

function buildRequestHash(input: MobileCheckInInput) {
  return createHash("sha256").update(JSON.stringify({
    erpStudentId: input.erpStudentId,
    clientEventId: input.clientEventId,
    qrTokenHash: hashAttendanceQrToken(input.qrToken),
    deviceInstallationId: input.deviceInstallationId ?? null,
    scannedAt: input.scannedAt,
  })).digest("hex");
}

function errorResult(
  code: MobileAttendanceErrorCode,
  httpStatus: number,
  message: string,
  requestId: string,
): MobileAttendanceResult {
  return { httpStatus, body: { code, message, requestId } };
}
