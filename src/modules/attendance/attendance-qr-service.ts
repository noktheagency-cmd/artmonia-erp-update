import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { buildAttendanceWindow, attendanceWindowState, formatBakuIso, formatBakuTime } from "@/modules/attendance/attendance-time";
import { AttendanceIntegrationError } from "@/modules/attendance/mobile-attendance-contract";
import { dateFromInput, weekdayFromDate } from "@/modules/groups/shared";
import type { ErpActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";
import { getEnv } from "@/server/env";
import { scopeFor } from "@/server/rbac/permissions";

export type AttendanceQrPayload = {
  challengeId: string;
  sessionId: string;
  deepLink: string;
  expiresAt: string;
  refreshAfterSeconds: number;
  lesson: {
    date: string;
    startsAt: string;
    endsAt: string;
    teacherName: string;
    location: string;
  };
};

export async function createAttendanceQrChallenge(
  input: { slotId: string; date: string },
  actor: ErpActor,
  now = new Date(),
): Promise<AttendanceQrPayload> {
  const env = getEnv();
  const date = dateFromInput(input.date);
  const prisma = getPrisma();
  const teacherProfile = scopeFor(actor.permissions, "attendance.manage") === "ALL"
    ? null
    : await prisma.teacher.findUnique({ where: { userId: actor.id }, select: { id: true } });

  if (scopeFor(actor.permissions, "attendance.manage") !== "ALL" && !teacherProfile) {
    throw new AttendanceIntegrationError("LESSON_NOT_FOUND", 403, "Müəllim profili ERP hesabına bağlanmayıb.");
  }

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`select pg_advisory_xact_lock(hashtext(${input.slotId}))`);
    const slot = await tx.classSlot.findUnique({
      where: { id: input.slotId },
      select: {
        id: true,
        teacherId: true,
        weekday: true,
        startTime: true,
        endTime: true,
        room: true,
        validFrom: true,
        teacher: { select: { fullName: true } },
      },
    });

    if (!slot || !slot.teacherId) {
      throw new AttendanceIntegrationError("LESSON_NOT_FOUND", 404, "Dərs slotu və ya müəllim tapılmadı.");
    }
    if (teacherProfile && teacherProfile.id !== slot.teacherId) {
      throw new AttendanceIntegrationError("LESSON_NOT_FOUND", 403, "Bu slot üçün QR yaratmaq icazəniz yoxdur.");
    }
    if (slot.weekday !== weekdayFromDate(input.date) || date < slot.validFrom) {
      throw new AttendanceIntegrationError("LESSON_NOT_FOUND", 404, "Seçilən tarix bu dərs slotuna uyğun deyil.");
    }

    const window = buildAttendanceWindow(date, slot.startTime, slot.endTime, {
      opensMinutesBefore: env.ATTENDANCE_CHECKIN_OPEN_MINUTES_BEFORE,
      closesMinutesAfter: env.ATTENDANCE_CHECKIN_CLOSE_MINUTES_AFTER,
    });
    if (attendanceWindowState(now, window.opensAt, window.closesAt) !== "OPEN") {
      throw new AttendanceIntegrationError(
        "CHECK_IN_WINDOW_CLOSED",
        422,
        `QR yalnız ${formatBakuTime(window.opensAt)}–${formatBakuTime(window.closesAt)} aralığında yaradıla bilər.`,
      );
    }

    const session = await tx.slotSession.upsert({
      where: { slotId_sessionDate: { slotId: slot.id, sessionDate: date } },
      create: {
        slotId: slot.id,
        sessionDate: date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        createdById: actor.id,
      },
      update: {},
      select: { id: true, attendanceFinalizedAt: true },
    });
    if (session.attendanceFinalizedAt) {
      throw new AttendanceIntegrationError("CHECK_IN_WINDOW_CLOSED", 422, "Bu dərsin davamiyyəti artıq yekunlaşdırılıb.");
    }

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Math.min(
      now.getTime() + env.ATTENDANCE_QR_TTL_SECONDS * 1_000,
      window.closesAt.getTime(),
    ));
    const challenge = await tx.attendanceQrChallenge.create({
      data: {
        sessionId: session.id,
        tokenHash: hashAttendanceQrToken(token),
        expiresAt,
        createdById: actor.id,
      },
      select: { id: true },
    });

    return {
      challengeId: challenge.id,
      sessionId: session.id,
      deepLink: `artmonia://attendance/check-in?v=1&token=${token}`,
      expiresAt: expiresAt.toISOString(),
      refreshAfterSeconds: Math.min(env.ATTENDANCE_QR_REFRESH_SECONDS, env.ATTENDANCE_QR_TTL_SECONDS),
      lesson: {
        date: input.date,
        startsAt: formatBakuIso(window.startsAt),
        endsAt: formatBakuIso(window.endsAt),
        teacherName: slot.teacher?.fullName ?? "Müəllim",
        location: slot.room ?? "Təyin edilməyib",
      },
    };
  });
}

export function hashAttendanceQrToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function attendanceQrTokenFingerprint(token: string) {
  return hashAttendanceQrToken(token).slice(0, 16);
}
