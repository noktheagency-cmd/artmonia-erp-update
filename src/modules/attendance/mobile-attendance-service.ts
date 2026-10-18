import { createHash } from "node:crypto";
import { AttendanceCaptureSource, AttendanceMark, EnrollmentStatus, Prisma, SlotSessionStatus, StudentLifecycleStatus } from "@/generated/prisma/client";
import { attendanceQrTokenFingerprint, hashAttendanceQrToken } from "@/modules/attendance/attendance-qr-service";
import { processMobileAttendanceSiteCheckIn } from "@/modules/attendance/attendance-site-check-in-service";
import { attendanceWindowState, buildAttendanceWindow, formatBakuIso } from "@/modules/attendance/attendance-time";
import type {
  MobileAttendanceErrorCode,
  MobileAttendanceResponseBody,
  MobileAttendanceResult,
  MobileCheckInInput,
} from "@/modules/attendance/mobile-attendance-contract";
import { activateStudentFromFirstPresent } from "@/modules/students/activation-from-attendance";
import { recalculateTeacherPayoutsForMonthInTransaction } from "@/modules/hr/teacher-payroll";
import { PublicActionError } from "@/server/actions/public-action-error";
import { getPrisma } from "@/server/db/prisma";
import { getEnv } from "@/server/env";

const RATE_LIMIT_PER_STUDENT_PER_MINUTE = 20;

type MobileCheckInMetadata = {
  idempotencyKey: string;
  requestId: string;
  receivedAt?: Date;
};

export async function processMobileAttendanceCheckIn(
  input: MobileCheckInInput,
  metadata: MobileCheckInMetadata,
): Promise<MobileAttendanceResult> {
  const prisma = getPrisma();
  const receivedAt = metadata.receivedAt ?? new Date();
  const requestHash = buildMobileCheckInRequestHash(input);
  const scannedAt = new Date(input.scannedAt);
  const tokenHash = hashAttendanceQrToken(input.qrToken);
  const tokenFingerprint = attendanceQrTokenFingerprint(input.qrToken);
  const env = getEnv();

  const attendanceSite = await prisma.attendanceSite.findUnique({
    where: { token: input.qrToken },
    select: { id: true },
  });
  if (attendanceSite) {
    return processMobileAttendanceSiteCheckIn(input, metadata);
  }

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
        qrTokenFingerprint: tokenFingerprint,
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
        challengeId?: string;
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

    const student = await tx.student.findUnique({
      where: { id: input.erpStudentId },
      select: { id: true },
    });
    if (!student) {
      return finish(errorResult(
        "STUDENT_NOT_FOUND",
        404,
        "Tələbə ERP-də tapılmadı.",
        metadata.requestId,
      ));
    }

    const challenge = await tx.attendanceQrChallenge.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        expiresAt: true,
        revokedAt: true,
        session: {
          select: {
            id: true,
            sessionDate: true,
            startTime: true,
            endTime: true,
            status: true,
            attendanceFinalizedAt: true,
            slot: {
              select: {
                id: true,
                teacherId: true,
                room: true,
                teacher: { select: { fullName: true } },
              },
            },
          },
        },
      },
    });
    if (!challenge || challenge.revokedAt) {
      return finish(errorResult("QR_INVALID", 400, "QR token tanınmır.", metadata.requestId), {
        studentId: student.id,
      });
    }
    if (challenge.expiresAt < receivedAt) {
      return finish(errorResult("QR_EXPIRED", 410, "QR kodun istifadə müddəti bitib.", metadata.requestId), {
        studentId: student.id,
        sessionId: challenge.session.id,
        challengeId: challenge.id,
      });
    }

    const session = challenge.session;
    if (session.status === SlotSessionStatus.CANCELLED) {
      return finish(errorResult("CHECK_IN_WINDOW_CLOSED", 422, "Bu dərs ləğv edilib.", metadata.requestId), {
        studentId: student.id,
        sessionId: session.id,
        challengeId: challenge.id,
      });
    }
    if (!session.slot.teacherId) {
      return finish(errorResult("LESSON_NOT_FOUND", 404, "Dərs müəllimi tapılmadı.", metadata.requestId), {
        studentId: student.id,
        sessionId: session.id,
        challengeId: challenge.id,
      });
    }
    const window = buildAttendanceWindow(session.sessionDate, session.startTime, session.endTime, {
      opensMinutesBefore: env.ATTENDANCE_CHECKIN_OPEN_MINUTES_BEFORE,
      closesMinutesAfter: env.ATTENDANCE_CHECKIN_CLOSE_MINUTES_AFTER,
    });
    if (
      session.attendanceFinalizedAt
      || attendanceWindowState(receivedAt, window.opensAt, window.closesAt) !== "OPEN"
    ) {
      return finish(errorResult(
        "CHECK_IN_WINDOW_CLOSED",
        422,
        "Bu dərs üçün giriş vaxt pəncərəsi açıq deyil.",
        metadata.requestId,
      ), {
        studentId: student.id,
        sessionId: session.id,
        challengeId: challenge.id,
      });
    }

    const enrollment = await tx.enrollment.findFirst({
      where: {
        studentId: student.id,
        status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.PAUSED] },
        student: {
          lifecycleStatus: {
            in: [StudentLifecycleStatus.ACTIVE, StudentLifecycleStatus.SLOT_WAITING],
          },
        },
        scheduleAssignments: {
          some: {
            slotId: session.slot.id,
            validFrom: { lte: session.sessionDate },
            OR: [{ validTo: null }, { validTo: { gte: session.sessionDate } }],
          },
        },
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, program: { select: { name: true } } },
    });
    if (!enrollment) {
      return finish(errorResult(
        "STUDENT_NOT_ENROLLED",
        403,
        "Tələbə bu dərs slotuna qeydiyyatda deyil.",
        metadata.requestId,
      ), {
        studentId: student.id,
        sessionId: session.id,
        challengeId: challenge.id,
      });
    }

    await tx.$executeRaw(Prisma.sql`
      select pg_advisory_xact_lock(hashtextextended(${`${session.id}:${enrollment.id}`}, 0))
    `);
    const existingAttendance = await tx.attendanceRecord.findUnique({
      where: { sessionId_enrollmentId: { sessionId: session.id, enrollmentId: enrollment.id } },
      select: { id: true, status: true, markedAt: true },
    });
    const alreadyCheckedIn = existingAttendance?.status === AttendanceMark.PRESENT;
    if (!alreadyCheckedIn) {
      try {
        await activateStudentFromFirstPresent(tx, {
          actorId: null,
          studentId: student.id,
          enrollmentId: enrollment.id,
          lessonDate: session.sessionDate,
        });
      } catch (error) {
        if (error instanceof PublicActionError) {
          return finish(errorResult(
            "ADMISSION_INCOMPLETE",
            422,
            error.message,
            metadata.requestId,
          ), {
            studentId: student.id,
            sessionId: session.id,
            challengeId: challenge.id,
            enrollmentId: enrollment.id,
          });
        }
        throw error;
      }
    }
    const attendance = alreadyCheckedIn
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

    if (!alreadyCheckedIn) {
      await recalculateTeacherPayoutsForMonthInTransaction(
        tx,
        session.sessionDate,
        null,
        [session.slot.teacherId],
      );
    }
    return finish({
      httpStatus: 200,
      body: {
        checkInId: attendance.id,
        status: alreadyCheckedIn ? "already_checked_in" : "checked_in",
        message: alreadyCheckedIn
          ? "Bu dərs üçün davamiyyət artıq qeydə alınıb."
          : "Dərsə giriş təsdiqləndi.",
        requestId: metadata.requestId,
        lesson: {
          id: session.id,
          title: enrollment.program.name,
          startsAt: formatBakuIso(window.startsAt),
          endsAt: formatBakuIso(window.endsAt),
          teacherName: session.slot.teacher?.fullName ?? "Müəllim",
          location: session.slot.room ?? "Təyin edilməyib",
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
      challengeId: challenge.id,
      attendanceRecordId: attendance.id,
    });
  });
}

function buildMobileCheckInRequestHash(input: MobileCheckInInput) {
  return createHash("sha256").update(JSON.stringify({
    erpStudentId: input.erpStudentId,
    clientEventId: input.clientEventId,
    qrTokenHash: hashAttendanceQrToken(input.qrToken),
    scannedAt: input.scannedAt,
    deviceInstallationId: input.deviceInstallationId ?? null,
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
