import "server-only";

import {
  AttendanceMark,
  EnrollmentStatus,
  Prisma,
  SlotSessionStatus,
} from "@/generated/prisma/client";
import { calculateMobileJourneyAndGamification } from "@/modules/mobile/mobile-gamification";
import { getFircaSummary } from "@/modules/firca/service";
import type { MobileStudentIdentity } from "@/modules/mobile/mobile-api";
import type {
  MobileNotificationQuery,
  MobileNotificationRead,
} from "@/modules/mobile/mobile-portal-contract";
import { MobilePortalError } from "@/modules/mobile/mobile-portal-service";
import { calculatePackageLessonUsage } from "@/modules/students/package-lesson-usage";
import { dateFromInput, todayInBaku, toDateInput } from "@/modules/groups/shared";
import { getPrisma } from "@/server/db/prisma";
import { programJourneyImageUrl } from "@/server/storage/erp-files";

const DAY_MS = 86_400_000;

export async function getMobilePackage(identity: MobileStudentIdentity) {
  const prisma = getPrisma();
  const enrollment = await loadActiveEnrollment(identity.studentId);
  const today = todayInBaku();
  const todayDate = dateFromInput(today);
  const cycle = await prisma.studentBillingCycle.findFirst({
    where: {
      enrollmentId: enrollment.id,
      cycleStart: { lte: todayDate },
      cycleEnd: { gte: todayDate },
    },
    orderBy: [{ cycleStart: "desc" }, { id: "desc" }],
    select: {
      cycleStart: true,
      cycleEnd: true,
      dueDate: true,
      status: true,
      paidAt: true,
      updatedAt: true,
    },
  });
  const period = cycle
    ? {
        from: toDateInput(cycle.cycleStart),
        to: toDateInput(cycle.cycleEnd),
        source: "billing_cycle" as const,
      }
    : calendarMonthPeriod(today);
  const attendanceUsage = await prisma.attendanceRecord.aggregate({
    where: {
      enrollmentId: enrollment.id,
      status: AttendanceMark.PRESENT,
      session: {
        sessionDate: {
          gte: dateFromInput(period.from),
          lte: dateFromInput(period.to),
        },
        status: { not: SlotSessionStatus.CANCELLED },
      },
    },
    _count: { _all: true },
    _max: { updatedAt: true },
  });
  const totalLessons = effectiveLessonLimit(enrollment);
  const usage = calculatePackageLessonUsage(totalLessons, attendanceUsage._count._all);
  const updatedAt = latestDate([
    enrollment.updatedAt,
    enrollment.program.updatedAt,
    cycle?.updatedAt,
    attendanceUsage._max.updatedAt,
  ]);

  return {
    package: {
      id: enrollment.id,
      program: {
        code: enrollment.program.code,
        name: enrollment.program.name,
      },
      status: enrollment.status.toLowerCase(),
      startsAt: toDateInput(enrollment.startDate),
      firstLessonAt: enrollment.firstLessonAt
        ? toDateInput(enrollment.firstLessonAt)
        : null,
      period,
      billing: cycle ? {
        status: cycle.status.toLowerCase(),
        dueAt: toDateInput(cycle.dueDate),
        paidAt: cycle.paidAt ? toDateInput(cycle.paidAt) : null,
      } : null,
      lessons: usage,
    },
    updatedAt: updatedAt.toISOString(),
  };
}

export async function getMobileJourney(identity: MobileStudentIdentity) {
  const prisma = getPrisma();
  const enrollment = await loadActiveEnrollment(identity.studentId);
  const [attendance, firca] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: {
        enrollmentId: enrollment.id,
        session: { status: { not: SlotSessionStatus.CANCELLED } },
      },
      select: {
        status: true,
        markedAt: true,
        updatedAt: true,
        session: {
          select: { sessionDate: true, startTime: true },
        },
      },
    }),
    getFircaSummary(identity.studentId),
  ]);
  const calculated = calculateMobileJourneyAndGamification({
    programId: enrollment.program.id,
    courseCode: enrollment.program.code,
    topics: enrollment.program.lessonTopics.map((topic) => ({
      id: topic.id,
      sequence: topic.sequence,
      title: topic.title,
      materials: topic.materials.map((material) => ({
        id: material.id,
        subject: material.subject,
        objective: material.objective,
        homework: material.homework,
        imageUrl: programJourneyImageUrl(material.imageObjectPath),
      })),
    })),
    attendance: attendance.map((item) => ({
      status: item.status,
      markedAt: item.markedAt,
      sessionDate: item.session.sessionDate,
      startTime: item.session.startTime,
    })),
  });
  const updatedAt = latestDate([
    enrollment.updatedAt,
    enrollment.program.updatedAt,
    ...enrollment.program.lessonTopics.map((topic) => topic.updatedAt),
    ...enrollment.program.lessonTopics.flatMap((topic) =>
      topic.materials.map((material) => material.updatedAt),
    ),
    ...attendance.map((item) => item.updatedAt),
  ]);

  return {
    program: {
      code: enrollment.program.code,
      name: enrollment.program.name,
    },
    ...calculated,
    contractVersion: 2,
    firca,
    updatedAt: updatedAt.toISOString(),
  };
}

export async function getMobileNotifications(
  identity: MobileStudentIdentity,
  query: MobileNotificationQuery,
) {
  const prisma = getPrisma();
  const account = await prisma.studentMobileAccount.findUnique({
    where: { studentId: identity.studentId },
    select: { id: true },
  });
  if (!account) throw mappingNotFoundError();
  const candidates = await loadNotificationCandidates(identity.studentId);
  const reads = candidates.length
    ? await prisma.studentMobileNotificationRead.findMany({
        where: {
          mobileAccountId: account.id,
          notificationKey: { in: candidates.map((item) => item.id) },
        },
        select: { notificationKey: true, readAt: true },
      })
    : [];
  const readByKey = new Map(reads.map((item) => [item.notificationKey, item.readAt]));
  const allItems = candidates.map((item) => ({
    id: item.id,
    type: item.type,
    title: item.title,
    body: item.body,
    readAt: readByKey.get(item.id)?.toISOString() ?? null,
    occurredAt: item.occurredAt.toISOString(),
    entity: item.entityId ? {
      type: item.entityType,
      id: item.entityId,
    } : null,
    event: {
      version: 1,
      name: item.eventName,
      metadata: asRecord(item.metadata),
    },
  }));

  return {
    items: allItems.slice(0, query.limit),
    unreadCount: allItems.filter((item) => !item.readAt).length,
    hasMore: allItems.length > query.limit,
    nextCursor: null,
    serverTime: new Date().toISOString(),
  };
}

export async function setMobileNotificationRead(
  identity: MobileStudentIdentity,
  notificationId: string,
  input: MobileNotificationRead,
) {
  const prisma = getPrisma();
  const [account, candidates] = await Promise.all([
    prisma.studentMobileAccount.findUnique({
      where: { studentId: identity.studentId },
      select: { id: true },
    }),
    loadNotificationCandidates(identity.studentId),
  ]);
  if (!account) throw mappingNotFoundError();
  if (!candidates.some((item) => item.id === notificationId)) {
    throw new MobilePortalError("NOTIFICATION_NOT_FOUND", 404, "Bildiriş tapılmadı.");
  }

  if (!input.read) {
    await prisma.studentMobileNotificationRead.deleteMany({
      where: { mobileAccountId: account.id, notificationKey: notificationId },
    });
    return { id: notificationId, readAt: null, updatedAt: new Date().toISOString() };
  }

  const read = await prisma.studentMobileNotificationRead.upsert({
    where: {
      mobileAccountId_notificationKey: {
        mobileAccountId: account.id,
        notificationKey: notificationId,
      },
    },
    create: { mobileAccountId: account.id, notificationKey: notificationId },
    update: { readAt: new Date() },
    select: { readAt: true, updatedAt: true },
  });
  return {
    id: notificationId,
    readAt: read.readAt.toISOString(),
    updatedAt: read.updatedAt.toISOString(),
  };
}

type NotificationCandidate = {
  id: string;
  type: string;
  title: string;
  body: string;
  occurredAt: Date;
  entityType: string;
  entityId: string | null;
  eventName: string;
  metadata: unknown;
};

export async function loadNotificationCandidates(studentId: string, db: Prisma.TransactionClient = getPrisma()) {
  return db.$queryRaw<NotificationCandidate[]>(Prisma.sql`
    with active_enrollments as (
      select e.id, e.program_id, e.status, e.updated_at
      from erp.enrollments e
      where e.student_id = ${studentId}::uuid
        and e.status in (
          'ACTIVE'::erp."EnrollmentStatus",
          'PAUSED'::erp."EnrollmentStatus"
        )
    ),
    homework_rows as (
      select distinct on (h.id)
        ('homework:' || h.id::text || ':' || coalesce(hc.revision::text,'assigned') || ':' || extract(epoch from coalesce(hc.reviewed_at,hc.submitted_at, h.updated_at))::bigint::text) as id,
        'homework'::text as type,
        case when hc.id is null then 'Yeni ev tapşırığı' when hc.status='accepted' then 'Ev tapşırığı qəbul edildi' when hc.status='rejected' then 'Ev tapşırığı düzəlişə qaytarıldı' else 'Ev tapşırığı yoxlanılır' end as title,
        h.title as body,
        coalesce(hc.reviewed_at,hc.submitted_at, h.updated_at) as occurred_at,
        'homework'::text as entity_type,
        h.id::text as entity_id,
        case when hc.id is null then 'homework.assigned' else 'homework.'||hc.status end as event_name,
        jsonb_build_object(
          'status', coalesce(hc.status,'pending'),
          'dueAt', h.due_at,
          'lessonId', ss.id,
          'feedback', hc.feedback
        ) as metadata
      from active_enrollments ae
      join erp.student_schedule_assignments sa on sa.enrollment_id = ae.id
      join erp.slot_sessions ss on ss.slot_id = sa.slot_id
        and ss.session_date >= sa.valid_from
        and (sa.valid_to is null or ss.session_date <= sa.valid_to)
      join erp.lesson_homeworks h on h.session_id = ss.id
      left join erp.homework_submissions hc
        on hc.homework_id = h.id and hc.student_id = ${studentId}::uuid
      order by h.id, coalesce(hc.reviewed_at,hc.submitted_at, h.updated_at) desc
    ),
    lesson_rows as (
      select distinct on (ss.id)
        ('lesson:' || ss.id::text || ':' || lower(ss.status::text) || ':' || extract(epoch from ss.updated_at)::bigint::text) as id,
        'lesson'::text as type,
        case
          when ss.status = 'CANCELLED'::erp."SlotSessionStatus" then 'Dərs ləğv edildi'
          else 'Dərsin vaxtı dəyişdirildi'
        end as title,
        to_char(ss.session_date, 'YYYY-MM-DD') || ' · ' || ss.start_time || '–' || ss.end_time as body,
        ss.updated_at as occurred_at,
        'lesson'::text as entity_type,
        ss.id::text as entity_id,
        case
          when ss.status = 'CANCELLED'::erp."SlotSessionStatus" then 'lesson.cancelled'
          else 'lesson.rescheduled'
        end as event_name,
        jsonb_build_object(
          'status', lower(ss.status::text),
          'date', to_char(ss.session_date, 'YYYY-MM-DD'),
          'startsAt', ss.start_time,
          'endsAt', ss.end_time
        ) as metadata
      from active_enrollments ae
      join erp.student_schedule_assignments sa on sa.enrollment_id = ae.id
      join erp.slot_sessions ss on ss.slot_id = sa.slot_id
        and ss.session_date >= sa.valid_from
        and (sa.valid_to is null or ss.session_date <= sa.valid_to)
      where ss.status in (
        'CANCELLED'::erp."SlotSessionStatus",
        'RESCHEDULED'::erp."SlotSessionStatus"
      )
      order by ss.id, ss.updated_at desc
    )
    select
      notifications.id,
      notifications.type,
      notifications.title,
      notifications.body,
      notifications.occurred_at as "occurredAt",
      notifications.entity_type as "entityType",
      notifications.entity_id as "entityId",
      notifications.event_name as "eventName",
      notifications.metadata
    from (
      select
        ('push:' || d.id::text) as id,
        c.category::text as type,c.title::text,c.body::text,
        c.scheduled_at as occurred_at,
        'mobile_push_campaign'::text as entity_type,c.id::text as entity_id,
        'erp.push.published'::text as event_name,
        jsonb_build_object('version',1,'destination',c.destination,'url',c.link_url,
          'imageUrl',c.image_url,'priority',c.priority) as metadata
      from erp.mobile_push_deliveries d
      join erp.mobile_push_campaigns c on c.id=d.campaign_id
      join erp.student_mobile_accounts a on a.id=d.mobile_account_id
      where a.student_id=${studentId}::uuid and c.scheduled_at<=now()
        and (c.cancelled_at is null or d.state in ('processing','accepted','delivered'))

      union all

      select
        ('announcement:' || a.id::text || ':' || extract(epoch from a.updated_at)::bigint::text) as id,
        'announcement'::text as type,
        a.title,
        a.body,
        a.published_at as occurred_at,
        'academy_announcement'::text as entity_type,
        a.id::text as entity_id,
        'announcement.published'::text as event_name,
        jsonb_build_object('expiresAt', a.expires_at) as metadata
      from erp.academy_announcements a
      where a.is_active = true
        and a.published_at <= now()
        and (
          a.program_id is null
          or a.program_id in (select ae.program_id from active_enrollments ae)
        )

      union all

      select
        ('attendance:' || ar.id::text || ':' || extract(epoch from ar.updated_at)::bigint::text) as id,
        'attendance'::text as type,
        'Davamiyyət yeniləndi'::text as title,
        to_char(ss.session_date, 'YYYY-MM-DD') || ' · ' || case ar.status
          when 'PRESENT'::erp."AttendanceMark" then 'Gəldi'
          when 'ABSENT'::erp."AttendanceMark" then 'Gəlmədi'
          else 'Üzrlü'
        end as body,
        ar.updated_at as occurred_at,
        'attendance'::text as entity_type,
        ar.id::text as entity_id,
        'attendance.updated'::text as event_name,
        jsonb_build_object(
          'status', lower(ar.status::text),
          'date', to_char(ss.session_date, 'YYYY-MM-DD'),
          'note', ar.note
        ) as metadata
      from erp.attendance_records ar
      join active_enrollments ae on ae.id = ar.enrollment_id
      join erp.slot_sessions ss on ss.id = ar.session_id

      union all
      select * from homework_rows

      union all
      select * from lesson_rows

      union all

      select
        ('package:' || ae.id::text || ':' || extract(epoch from ae.updated_at)::bigint::text) as id,
        'package'::text as type,
        'Paket məlumatı yeniləndi'::text as title,
        p.name || ' · ' || case ae.status
          when 'ACTIVE'::erp."EnrollmentStatus" then 'Aktiv'
          else 'Dondurulub'
        end as body,
        ae.updated_at as occurred_at,
        'package'::text as entity_type,
        ae.id::text as entity_id,
        'package.updated'::text as event_name,
        jsonb_build_object('status', lower(ae.status::text), 'programCode', p.code) as metadata
      from active_enrollments ae
      join erp.programs p on p.id = ae.program_id
    ) notifications
    order by notifications.occurred_at desc, notifications.id desc
    limit 500
  `);
}

async function loadActiveEnrollment(studentId: string) {
  const enrollment = await getPrisma().enrollment.findFirst({
    where: { studentId, status: EnrollmentStatus.ACTIVE },
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      status: true,
      startDate: true,
      firstLessonAt: true,
      lessonsPerMonth: true,
      updatedAt: true,
      program: {
        select: {
          id: true,
          code: true,
          name: true,
          defaultLessonsPerMonth: true,
          updatedAt: true,
          lessonTopics: {
            orderBy: { sequence: "asc" },
            select: {
              id: true,
              sequence: true,
              title: true,
              updatedAt: true,
              materials: {
                orderBy: { sequence: "asc" },
                select: {
                  id: true,
                  subject: true,
                  objective: true,
                  homework: true,
                  imageObjectPath: true,
                  updatedAt: true,
                },
              },
            },
          },
        },
      },
    },
  });
  if (!enrollment) {
    throw new MobilePortalError("ENROLLMENT_INACTIVE", 403, "Aktiv tələbə proqramı tapılmadı.");
  }
  return enrollment;
}

function effectiveLessonLimit(enrollment: {
  lessonsPerMonth: number | null;
  program: { defaultLessonsPerMonth: number | null };
}) {
  return enrollment.lessonsPerMonth && enrollment.lessonsPerMonth > 0
    ? enrollment.lessonsPerMonth
    : enrollment.program.defaultLessonsPerMonth;
}

function calendarMonthPeriod(today: string) {
  const from = `${today.slice(0, 8)}01`;
  const nextMonth = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 1));
  const to = toDateInput(new Date(nextMonth.getTime() - DAY_MS));
  return { from, to, source: "calendar_month" as const };
}

function latestDate(values: Array<Date | null | undefined>) {
  return new Date(Math.max(...values.filter((value): value is Date => Boolean(value)).map((value) => value.getTime())));
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function mappingNotFoundError() {
  return new MobilePortalError(
    "STUDENT_MAPPING_NOT_FOUND",
    403,
    "Mobil hesab ERP tələbəsinə bağlanmayıb.",
  );
}
