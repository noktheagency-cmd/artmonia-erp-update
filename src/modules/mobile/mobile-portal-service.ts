import {
  AttendanceMark,
  EnrollmentStatus,
  SlotSessionStatus,
  StudentMobileAccountStatus,
} from "@/generated/prisma/client";
import {
  bakuLocalDateTimeToUtc,
} from "@/modules/attendance/attendance-time";
import { normalizePhone } from "@/modules/crm/duplicate-phone";
import {
  dateFromInput,
  todayInBaku,
  toDateInput,
  weekdayMeta,
} from "@/modules/groups/shared";
import type {
  MobileLessonFilter,
  MobileLessonsQuery,
  MobileProfilePatch,
} from "@/modules/mobile/mobile-portal-contract";
import type { MobileStudentIdentity } from "@/modules/mobile/mobile-api";
import { getPrisma } from "@/server/db/prisma";
import { getSupabaseAdminClient } from "@/server/supabase/admin";

const DAY_MS = 86_400_000;
const STUDENT_AVATAR_BUCKET = "student-avatars";

export class MobilePortalError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "MobilePortalError";
  }
}

export async function getMobileMe(identity: MobileStudentIdentity) {
  const snapshot = await loadStudentPortalSnapshot(identity.studentId);
  return {
    accountStatus: mapMobileAccountStatus(snapshot.mobileAccount.status),
    displayName: snapshot.contact.fullName,
    email: snapshot.mobileAccount.loginEmail,
    serverTime: new Date().toISOString(),
  };
}

export async function getMobileProfile(identity: MobileStudentIdentity) {
  const snapshot = await loadStudentPortalSnapshot(identity.studentId);
  return buildProfile(snapshot);
}

export async function updateMobileProfile(
  identity: MobileStudentIdentity,
  input: MobileProfilePatch,
) {
  const prisma = getPrisma();
  const phoneNormalized = input.phone === undefined || input.phone === null
    ? input.phone
    : normalizePhone(input.phone);
  if (
    input.phone !== undefined
    && input.phone !== null
    && (!phoneNormalized || phoneNormalized.length < 7 || phoneNormalized.length > 15)
  ) {
    throw new MobilePortalError("INVALID_PHONE", 422, "Telefon nömrəsi düzgün deyil.");
  }
  if (
    input.avatarObjectPath !== undefined
    && input.avatarObjectPath !== null
    && !isOwnedStudentAvatarPath(input.avatarObjectPath, identity.authUserId)
  ) {
    throw new MobilePortalError(
      "INVALID_AVATAR_PATH",
      422,
      "Profil şəkli tələbənin öz storage qovluğunda olmalıdır.",
    );
  }

  await prisma.$transaction(async (tx) => {
    const current = await tx.student.findUnique({
      where: { id: identity.studentId },
      select: {
        contactId: true,
        contact: { select: { phoneDisplay: true } },
        mobileAccount: { select: { id: true, avatarObjectPath: true } },
      },
    });
    if (!current?.mobileAccount) {
      throw new MobilePortalError("STUDENT_MAPPING_NOT_FOUND", 403, "Mobil hesab mapping-i tapılmadı.");
    }

    if (input.phone !== undefined) {
      await tx.contact.update({
        where: { id: current.contactId },
        data: { phoneDisplay: input.phone, phoneNormalized },
      });
    }
    if (input.avatarObjectPath !== undefined) {
      await tx.studentMobileAccount.update({
        where: { id: current.mobileAccount.id },
        data: { avatarObjectPath: input.avatarObjectPath },
      });
    }
    await tx.auditLog.create({
      data: {
        action: "student.mobile_profile.update",
        entityType: "student",
        entityId: identity.studentId,
        beforeJson: {
          phone: current.contact.phoneDisplay,
          avatarObjectPath: current.mobileAccount.avatarObjectPath,
        },
        afterJson: {
          phone: input.phone === undefined ? current.contact.phoneDisplay : input.phone,
          avatarObjectPath: input.avatarObjectPath === undefined
            ? current.mobileAccount.avatarObjectPath
            : input.avatarObjectPath,
        },
        reason: "Tələbə mobil tətbiqdən profil məlumatını yenilədi",
      },
    });
  });

  return getMobileProfile(identity);
}

export async function getMobileHome(identity: MobileStudentIdentity) {
  const now = new Date();
  const snapshot = await loadStudentPortalSnapshot(identity.studentId);
  const primaryEnrollment = getPrimaryEnrollment(snapshot);
  if (!primaryEnrollment) throw enrollmentInactiveError();

  const today = todayInBaku();
  const weekFrom = startOfBakuWeek(today);
  const weekTo = addDays(weekFrom, 6);
  const futureTo = addDays(today, 60);
  const rangeFrom = weekFrom < today ? weekFrom : today;
  const entries = await getStudentLessonEntries(identity.studentId, rangeFrom, futureTo, now);
  const weekly = entries.filter((entry) => entry.date >= weekFrom && entry.date <= weekTo);
  const presentCount = weekly.filter((entry) => entry.attendance.status === "present").length;
  const absentCount = weekly.filter((entry) => entry.attendance.status === "absent").length;
  const excusedCount = weekly.filter((entry) => entry.attendance.status === "excused").length;
  const completedAttendanceCount = presentCount + absentCount;
  const nextLesson = entries
    .filter((entry) => new Date(entry.startsAt) >= now && entry.lessonStatus !== "cancelled")
    .toSorted((left, right) => left.startsAt.localeCompare(right.startsAt))[0] ?? null;
  const nextAction = buildNextAction(entries, now);
  const programIds = snapshot.enrollments.map((enrollment) => enrollment.program.id);
  const academyNotice = await getPrisma().academyAnnouncement.findFirst({
    where: {
      isActive: true,
      publishedAt: { lte: now },
      OR: [
        { programId: null },
        { programId: { in: programIds } },
      ],
      AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
    },
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    select: { id: true, title: true, body: true, publishedAt: true },
  });

  return {
    profile: {
      displayName: snapshot.contact.fullName,
      avatarUrl: studentAvatarUrl(snapshot.mobileAccount.avatarObjectPath),
      programName: primaryEnrollment.program.name,
    },
    attendance: {
      weeklyPercent: completedAttendanceCount
        ? Math.round((presentCount / completedAttendanceCount) * 100)
        : 0,
      attendedCount: presentCount,
      absentCount,
      excusedCount,
      scheduledCount: weekly.length,
    },
    nextLesson: nextLesson ? summarizeLesson(nextLesson) : null,
    nextAction,
    academyNotice: academyNotice ? {
      id: academyNotice.id,
      title: academyNotice.title,
      body: academyNotice.body,
      publishedAt: academyNotice.publishedAt.toISOString(),
    } : null,
    updatedAt: now.toISOString(),
  };
}

export async function getMobileLessons(
  identity: MobileStudentIdentity,
  query: MobileLessonsQuery,
) {
  const today = todayInBaku();
  const from = query.from ?? addDays(today, -90);
  const to = query.to ?? addDays(today, 60);
  assertDateRange(from, to, 366);
  await assertActiveEnrollment(identity.studentId);

  const entries = filterLessonEntries(
    await getStudentLessonEntries(identity.studentId, from, to),
    query.status,
  ).toSorted(compareLessonsDescending);
  const cursor = query.cursor ? decodeLessonCursor(query.cursor) : null;
  const afterCursor = cursor
    ? entries.filter((entry) => compareEntryToCursor(entry, cursor) > 0)
    : entries;
  const page = afterCursor.slice(0, query.limit);
  const hasMore = afterCursor.length > query.limit;

  return {
    items: page,
    nextCursor: hasMore && page.length
      ? encodeLessonCursor(page[page.length - 1])
      : null,
    serverTime: new Date().toISOString(),
  };
}

export async function getMobileLessonDetail(
  identity: MobileStudentIdentity,
  lessonId: string,
) {
  await assertActiveEnrollment(identity.studentId);
  const prisma = getPrisma();
  const session = await prisma.slotSession.findUnique({
    where: { id: lessonId },
    select: { sessionDate: true },
  });
  if (!session) throw lessonNotFoundError();
  const date = toDateInput(session.sessionDate);
  const entries = await getStudentLessonEntries(identity.studentId, date, date);
  const lesson = entries.find((entry) => entry.id === lessonId);
  if (!lesson) throw lessonNotFoundError();
  return lesson;
}

export async function getMobileAttendanceSummary(
  identity: MobileStudentIdentity,
  input: { from?: string; to?: string },
) {
  const today = todayInBaku();
  const from = input.from ?? `${today.slice(0, 8)}01`;
  const to = input.to ?? today;
  assertDateRange(from, to, 366);
  await assertActiveEnrollment(identity.studentId);
  const entries = await getStudentLessonEntries(identity.studentId, from, to);
  const attendedCount = entries.filter((entry) => entry.attendance.status === "present").length;
  const absentCount = entries.filter((entry) => entry.attendance.status === "absent").length;
  const excusedCount = entries.filter((entry) => entry.attendance.status === "excused").length;
  const pendingCount = entries.filter((entry) => entry.attendance.status === "pending").length;
  const gradedCount = attendedCount + absentCount;
  return {
    from,
    to,
    attendancePercent: gradedCount ? Math.round((attendedCount / gradedCount) * 100) : 0,
    attendedCount,
    absentCount,
    excusedCount,
    pendingCount,
    scheduledCount: entries.length,
    serverTime: new Date().toISOString(),
  };
}

async function loadStudentPortalSnapshot(studentId: string) {
  const today = dateFromInput(todayInBaku());
  const student = await getPrisma().student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      educationLevel: true,
      updatedAt: true,
      contact: {
        select: {
          fullName: true,
          email: true,
          phoneDisplay: true,
          updatedAt: true,
        },
      },
      mobileAccount: {
        select: {
          loginEmail: true,
          avatarObjectPath: true,
          status: true,
          updatedAt: true,
        },
      },
      enrollments: {
        where: { status: EnrollmentStatus.ACTIVE },
        orderBy: [{ startDate: "desc" }, { id: "asc" }],
        select: {
          id: true,
          status: true,
          updatedAt: true,
          program: { select: { id: true, code: true, name: true } },
          teacher: { select: { fullName: true } },
          scheduleAssignments: {
            where: {
              validFrom: { lte: today },
              OR: [{ validTo: null }, { validTo: { gte: today } }],
            },
            orderBy: [{ validFrom: "desc" }, { id: "asc" }],
            select: {
              id: true,
              slot: {
                select: {
                  displayName: true,
                  weekday: true,
                  startTime: true,
                  room: true,
                  teacher: { select: { fullName: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  const mobileAccount = student?.mobileAccount;
  if (!student || !mobileAccount) {
    throw new MobilePortalError("STUDENT_MAPPING_NOT_FOUND", 403, "Mobil tələbə mapping-i tapılmadı.");
  }
  return { ...student, mobileAccount };
}

function buildProfile(snapshot: Awaited<ReturnType<typeof loadStudentPortalSnapshot>>) {
  const enrollment = getPrimaryEnrollment(snapshot);
  const assignment = enrollment?.scheduleAssignments[0];
  const updatedAt = maxDate([
    snapshot.updatedAt,
    snapshot.contact.updatedAt,
    snapshot.mobileAccount.updatedAt,
    enrollment?.updatedAt,
  ]);
  return {
    displayName: snapshot.contact.fullName,
    email: snapshot.mobileAccount.loginEmail,
    phone: snapshot.contact.phoneDisplay,
    avatarUrl: studentAvatarUrl(snapshot.mobileAccount.avatarObjectPath),
    avatarObjectPath: snapshot.mobileAccount.avatarObjectPath,
    accountStatus: mapMobileAccountStatus(snapshot.mobileAccount.status),
    academy: enrollment ? {
      programCode: enrollment.program.code,
      programName: enrollment.program.name,
      groupName: assignment?.slot.displayName
        ?? (assignment
          ? `${weekdayMeta[assignment.slot.weekday].label} ${assignment.slot.startTime}`
          : null),
      studioName: assignment?.slot.room ?? null,
      teacherName: enrollment.teacher?.fullName ?? assignment?.slot.teacher?.fullName ?? null,
      studentLevel: snapshot.educationLevel,
      enrollmentStatus: enrollment.status.toLowerCase(),
    } : null,
    editableFields: ["phone", "avatarObjectPath"],
    updatedAt: updatedAt.toISOString(),
  };
}

function getPrimaryEnrollment(snapshot: Awaited<ReturnType<typeof loadStudentPortalSnapshot>>) {
  return snapshot.enrollments.find((enrollment) => enrollment.scheduleAssignments.length > 0)
    ?? snapshot.enrollments[0]
    ?? null;
}

type StudentLessonEntry = Awaited<ReturnType<typeof getStudentLessonEntries>>[number];

async function getStudentLessonEntries(
  studentId: string,
  from: string,
  to: string,
  now = new Date(),
) {
  const prisma = getPrisma();
  const fromDate = dateFromInput(from);
  const toDate = dateFromInput(to);
  const assignments = await prisma.studentScheduleAssignment.findMany({
    where: {
      enrollment: { studentId, status: EnrollmentStatus.ACTIVE },
      validFrom: { lte: toDate },
      OR: [{ validTo: null }, { validTo: { gte: fromDate } }],
    },
    orderBy: [{ validFrom: "desc" }, { id: "asc" }],
    select: {
      id: true,
      validFrom: true,
      validTo: true,
      enrollment: {
        select: {
          id: true,
          program: { select: { code: true, name: true } },
        },
      },
      slot: {
        select: {
          id: true,
          validFrom: true,
          weekday: true,
          startTime: true,
          endTime: true,
          room: true,
          teacher: { select: { id: true, fullName: true } },
        },
      },
    },
  });
  if (!assignments.length) return [];

  await materializeStudentSessions(assignments, from, to);
  const enrollmentIds = [...new Set(assignments.map((item) => item.enrollment.id))];
  const slotIds = [...new Set(assignments.map((item) => item.slot.id))];
  const sessions = await prisma.slotSession.findMany({
    where: {
      slotId: { in: slotIds },
      sessionDate: { gte: fromDate, lte: toDate },
    },
    orderBy: [{ sessionDate: "asc" }, { startTime: "asc" }, { id: "asc" }],
    select: {
      id: true,
      slotId: true,
      sessionDate: true,
      startTime: true,
      endTime: true,
      status: true,
      title: true,
      objective: true,
      updatedAt: true,
      slot: {
        select: {
          room: true,
          teacher: { select: { id: true, fullName: true } },
        },
      },
      attendance: {
        where: { enrollmentId: { in: enrollmentIds } },
        select: {
          enrollmentId: true,
          status: true,
          source: true,
          note: true,
          markedAt: true,
          updatedAt: true,
        },
      },
      homework: {
        select: {
          id: true,
          title: true,
          description: true,
          dueAt: true,
          updatedAt: true,
          completions: {
            where: { enrollmentId: { in: enrollmentIds } },
            select: { enrollmentId: true, completedAt: true },
          },
        },
      },
    },
  });

  return sessions.flatMap((session) => {
    const assignment = assignments.find((item) => (
      item.slot.id === session.slotId
      && item.validFrom <= session.sessionDate
      && (!item.validTo || item.validTo >= session.sessionDate)
    ));
    if (!assignment) return [];
    const attendance = session.attendance.find(
      (item) => item.enrollmentId === assignment.enrollment.id,
    );
    const completion = session.homework?.completions.find(
      (item) => item.enrollmentId === assignment.enrollment.id,
    );
    const date = toDateInput(session.sessionDate);
    const startsAt = bakuLocalDateTimeToUtc(date, session.startTime);
    const endsAt = bakuLocalDateTimeToUtc(date, session.endTime);
    const lessonStatus = mapLessonStatus(session.status, endsAt, now);
    const homework = session.homework ? {
      id: session.homework.id,
      title: session.homework.title,
      description: session.homework.description,
      status: completion
        ? "completed" as const
        : session.homework.dueAt && session.homework.dueAt < now
          ? "overdue" as const
          : "pending" as const,
      dueAt: session.homework.dueAt?.toISOString() ?? null,
      completedAt: completion?.completedAt.toISOString() ?? null,
    } : null;
    return [{
      id: session.id,
      date,
      courseCode: assignment.enrollment.program.code,
      title: session.title ?? assignment.enrollment.program.name,
      objective: session.objective,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      location: session.slot.room,
      teacher: session.slot.teacher ? {
        id: session.slot.teacher.id,
        displayName: session.slot.teacher.fullName,
      } : null,
      lessonStatus,
      attendance: {
        status: mapAttendanceStatus(attendance?.status),
        markedAt: attendance?.markedAt.toISOString() ?? null,
        source: attendance?.source ? attendance.source.toLowerCase() : null,
      },
      teacherNote: attendance?.note ? {
        text: attendance.note,
        createdAt: attendance.markedAt.toISOString(),
      } : null,
      homework,
      updatedAt: maxDate([
        session.updatedAt,
        attendance?.updatedAt,
        session.homework?.updatedAt,
      ]).toISOString(),
    }];
  });
}

async function materializeStudentSessions(
  assignments: Array<{
    validFrom: Date;
    validTo: Date | null;
    slot: {
      id: string;
      validFrom: Date;
      weekday: keyof typeof weekdayMeta;
      startTime: string;
      endTime: string;
    };
  }>,
  from: string,
  to: string,
) {
  const today = todayInBaku();
  const materializeFrom = from > today ? from : today;
  if (materializeFrom > to) return;
  const rows = new Map<string, {
    slotId: string;
    sessionDate: Date;
    startTime: string;
    endTime: string;
  }>();

  for (const assignment of assignments) {
    const start = maxIsoDate([
      materializeFrom,
      toDateInput(assignment.validFrom),
      toDateInput(assignment.slot.validFrom),
    ]);
    const end = minIsoDate([
      to,
      assignment.validTo ? toDateInput(assignment.validTo) : to,
    ]);
    if (start > end) continue;
    for (let cursor = dateFromInput(start); cursor <= dateFromInput(end); cursor = new Date(cursor.getTime() + DAY_MS)) {
      if (cursor.getUTCDay() !== weekdayMeta[assignment.slot.weekday].index) continue;
      const date = toDateInput(cursor);
      rows.set(`${assignment.slot.id}:${date}`, {
        slotId: assignment.slot.id,
        sessionDate: cursor,
        startTime: assignment.slot.startTime,
        endTime: assignment.slot.endTime,
      });
    }
  }
  if (!rows.size) return;

  const prisma = getPrisma();
  await prisma.$transaction(async (tx) => {
    await tx.slotSession.createMany({ data: [...rows.values()], skipDuplicates: true });
    const futureDate = dateFromInput(today);
    const slots = new Map(assignments.map((item) => [item.slot.id, item.slot]));
    for (const slot of slots.values()) {
      await tx.slotSession.updateMany({
        where: {
          slotId: slot.id,
          sessionDate: { gte: futureDate },
          status: SlotSessionStatus.SCHEDULED,
          attendanceFinalizedAt: null,
          attendance: { none: {} },
        },
        data: { startTime: slot.startTime, endTime: slot.endTime },
      });
    }
  });
}

async function assertActiveEnrollment(studentId: string) {
  const count = await getPrisma().enrollment.count({
    where: { studentId, status: EnrollmentStatus.ACTIVE },
  });
  if (!count) throw enrollmentInactiveError();
}

function filterLessonEntries(entries: StudentLessonEntry[], filter: MobileLessonFilter) {
  if (filter === "all") return entries;
  if (["scheduled", "completed", "cancelled", "rescheduled"].includes(filter)) {
    return entries.filter((entry) => entry.lessonStatus === filter);
  }
  return entries.filter((entry) => entry.attendance.status === filter);
}

function mapAttendanceStatus(status?: AttendanceMark) {
  if (status === AttendanceMark.PRESENT) return "present" as const;
  if (status === AttendanceMark.ABSENT) return "absent" as const;
  if (status === AttendanceMark.EXCUSED) return "excused" as const;
  return "pending" as const;
}

function mapLessonStatus(status: SlotSessionStatus, endsAt: Date, now: Date) {
  if (status === SlotSessionStatus.CANCELLED) return "cancelled" as const;
  if (status === SlotSessionStatus.RESCHEDULED) return "rescheduled" as const;
  if (status === SlotSessionStatus.COMPLETED || endsAt < now) return "completed" as const;
  return "scheduled" as const;
}

function mapMobileAccountStatus(status: StudentMobileAccountStatus) {
  return status.toLowerCase() as "invited" | "active" | "disabled";
}

function summarizeLesson(entry: StudentLessonEntry) {
  return {
    id: entry.id,
    courseCode: entry.courseCode,
    title: entry.title,
    startsAt: entry.startsAt,
    endsAt: entry.endsAt,
    location: entry.location,
    teacherName: entry.teacher?.displayName ?? null,
    status: entry.lessonStatus,
  };
}

function buildNextAction(entries: StudentLessonEntry[], now: Date) {
  const homeworkEntry = entries
    .filter((entry) => entry.homework && entry.homework.status !== "completed")
    .toSorted((left, right) => (
      (left.homework?.dueAt ?? "9999").localeCompare(right.homework?.dueAt ?? "9999")
    ))[0];
  if (homeworkEntry?.homework) {
    return {
      type: "homework",
      entityId: homeworkEntry.homework.id,
      title: homeworkEntry.homework.title,
      body: homeworkEntry.homework.status === "overdue"
        ? "Tapşırığın son tarixi keçib."
        : homeworkEntry.homework.dueAt && new Date(homeworkEntry.homework.dueAt) < new Date(now.getTime() + 2 * DAY_MS)
          ? "Tapşırığın son tarixi yaxınlaşır."
          : "Növbəti dərs tapşırığına bax.",
    };
  }
  const noteEntry = entries
    .filter((entry) => entry.teacherNote)
    .toSorted(compareLessonsDescending)[0];
  return noteEntry?.teacherNote ? {
    type: "teacher_note",
    entityId: noteEntry.id,
    title: "Müəllim qeydiniz var",
    body: noteEntry.teacherNote.text,
  } : null;
}

function studentAvatarUrl(objectPath: string | null) {
  if (!objectPath) return null;
  return getSupabaseAdminClient().storage
    .from(STUDENT_AVATAR_BUCKET)
    .getPublicUrl(objectPath).data.publicUrl;
}

function isOwnedStudentAvatarPath(path: string, authUserId: string) {
  return new RegExp(
    `^${escapeRegExp(authUserId)}/avatar\\.(?:jpg|jpeg|png|webp)$`,
    "i",
  ).test(path);
}

function assertDateRange(from: string, to: string, maxDays: number) {
  if (from > to) throw new MobilePortalError("INVALID_DATE_RANGE", 400, "Başlanğıc tarixi bitmə tarixindən sonra ola bilməz.");
  const span = Math.floor((dateFromInput(to).getTime() - dateFromInput(from).getTime()) / DAY_MS);
  if (span > maxDays) {
    throw new MobilePortalError("DATE_RANGE_TOO_LARGE", 400, `Tarix aralığı ${maxDays} gündən böyük ola bilməz.`);
  }
}

function encodeLessonCursor(entry: StudentLessonEntry) {
  return Buffer.from(JSON.stringify({ startsAt: entry.startsAt, id: entry.id }), "utf8").toString("base64url");
}

function decodeLessonCursor(value: string) {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    if (
      !parsed
      || typeof parsed !== "object"
      || !("startsAt" in parsed)
      || !("id" in parsed)
      || typeof parsed.startsAt !== "string"
      || typeof parsed.id !== "string"
      || Number.isNaN(Date.parse(parsed.startsAt))
      || !/^[0-9a-f-]{36}$/i.test(parsed.id)
    ) throw new Error("Invalid cursor");
    return { startsAt: parsed.startsAt, id: parsed.id };
  } catch {
    throw new MobilePortalError("INVALID_CURSOR", 400, "Pagination cursor-u düzgün deyil.");
  }
}

function compareLessonsDescending(left: StudentLessonEntry, right: StudentLessonEntry) {
  return right.startsAt.localeCompare(left.startsAt) || right.id.localeCompare(left.id);
}

function compareEntryToCursor(
  entry: StudentLessonEntry,
  cursor: { startsAt: string; id: string },
) {
  return cursor.startsAt.localeCompare(entry.startsAt) || cursor.id.localeCompare(entry.id);
}

function maxDate(values: Array<Date | null | undefined>) {
  return new Date(Math.max(...values.filter((value): value is Date => Boolean(value)).map((value) => value.getTime())));
}

function startOfBakuWeek(today: string) {
  const date = dateFromInput(today);
  const day = date.getUTCDay() || 7;
  return addDays(today, 1 - day);
}

function addDays(value: string, days: number) {
  return toDateInput(new Date(dateFromInput(value).getTime() + days * DAY_MS));
}

function maxIsoDate(values: string[]) {
  return values.toSorted().at(-1) as string;
}

function minIsoDate(values: string[]) {
  return values.toSorted()[0];
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function enrollmentInactiveError() {
  return new MobilePortalError("ENROLLMENT_INACTIVE", 403, "Aktiv enrollment tapılmadı.");
}

function lessonNotFoundError() {
  return new MobilePortalError("LESSON_NOT_FOUND", 404, "Dərs tapılmadı.");
}
