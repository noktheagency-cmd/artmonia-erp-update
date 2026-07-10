import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/server/db/prisma";
import { requireErpActor } from "@/server/auth/actor";
import { formatAmount } from "@/modules/shared/format";

export type TeacherDirectoryStudent = {
  id: string;
  code: string;
  name: string;
  program: string;
  status: string;
  balance: string;
};

export type TeacherDirectoryLesson = {
  id: string;
  student: string;
  program: string;
  date: string;
  time: string;
  group: string;
  status: string;
  note: string;
};

export type TeacherAssignmentFallback = {
  id: string;
  student: string;
  program: string;
  date: string;
  direction: string;
  reason: string;
};

export type TeacherDirectoryTeacher = {
  id: string;
  userId: string;
  userName: string;
  fullName: string;
  phone: string;
  capacity: number;
  isActive: boolean;
  activeStudentCount: number;
  utilization: number;
  nextLesson: string;
  nextLessonStudent: string;
  students: TeacherDirectoryStudent[];
  lessons: TeacherDirectoryLesson[];
  assignmentHistory: TeacherAssignmentFallback[];
};

export type TeacherDirectoryData = {
  permissions: {
    canReadTeachers: boolean;
    canManageTeacherAccounts: boolean;
  };
  accountOptions: Array<{ id: string; name: string; email: string }>;
  teachers: TeacherDirectoryTeacher[];
};

type TeacherRawRow = {
  id: string;
  userId: string | null;
  userName: string | null;
  fullName: string;
  phone: string | null;
  capacity: number | null;
  isActive: boolean;
  activeStudentCount: number;
  nextLessonDate: Date | string | null;
  nextLessonTime: string | null;
  nextLessonStudent: string | null;
  students: unknown;
  lessons: unknown;
  assignmentHistory: unknown;
};

type TeacherStudentRaw = {
  id: string;
  code: string;
  name: string;
  program: string | null;
  status: string;
  balance: number | string | null;
};

type TeacherLessonRaw = {
  id: string;
  student: string;
  program: string | null;
  lessonDate: Date | string;
  startTime: string;
  group: string;
  status: string;
  note: string | null;
};

type TeacherAssignmentRaw = {
  id: string;
  student: string;
  program: string | null;
  createdAt: Date | string;
  direction: string;
  reason: string | null;
};

export async function getTeacherDirectoryData(): Promise<TeacherDirectoryData> {
  const actor = await requireErpActor();

  if (!actor.permissions.has("teacher.read")) {
    return {
      permissions: {
        canReadTeachers: false,
        canManageTeacherAccounts: false,
      },
      accountOptions: [],
      teachers: [],
    };
  }

  const prisma = getPrisma();
  const rows = await prisma.$queryRaw<TeacherRawRow[]>(Prisma.sql`
    select
      t.id::text as "id",
      t.user_id::text as "userId",
      linked_user.full_name as "userName",
      t.full_name as "fullName",
      coalesce(t.phone, tc.phone_display) as "phone",
      t.capacity,
      t.is_active as "isActive",
      coalesce(active_counts.active_student_count, 0)::int as "activeStudentCount",
      next_lesson.lesson_date as "nextLessonDate",
      next_lesson.start_time as "nextLessonTime",
      next_lesson.student_name as "nextLessonStudent",
      coalesce(students.items, '[]'::jsonb) as "students",
      coalesce(lessons.items, '[]'::jsonb) as "lessons",
      coalesce(assignments.items, '[]'::jsonb) as "assignmentHistory"
    from erp.teachers t
    left join erp.users linked_user on linked_user.id = t.user_id
    left join erp.contacts tc on tc.id = t.contact_id
    left join lateral (
      select count(distinct s.id)::int as active_student_count
      from erp.group_memberships gm
      join erp.enrollments e on e.id = gm.enrollment_id
      join erp.students s on s.id = e.student_id
      where gm.teacher_id = t.id
        and gm.ended_at is null
        and e.status = 'ACTIVE'::"erp"."EnrollmentStatus"
        and s.lifecycle_status in (
          'ACTIVE'::"erp"."StudentLifecycleStatus",
          'DEBT'::"erp"."StudentLifecycleStatus",
          'GROUP_WAITING'::"erp"."StudentLifecycleStatus"
        )
    ) active_counts on true
    left join lateral (
      select
        d.lesson_date,
        gs.start_time,
        g.code as student_name
      from erp.group_memberships gm
      join erp.groups g on g.id = gm.group_id and g.is_active = true
      join erp.group_schedules gs on gs.group_id = g.id
      cross join lateral (
        select day::date as lesson_date
        from generate_series(current_date, current_date + interval '14 days', interval '1 day') day
        where gs.weekday::text = case extract(isodow from day)::int
          when 1 then 'MONDAY'
          when 2 then 'TUESDAY'
          when 3 then 'WEDNESDAY'
          when 4 then 'THURSDAY'
          when 5 then 'FRIDAY'
          when 6 then 'SATURDAY'
          else 'SUNDAY'
        end
        order by day asc
        limit 1
      ) d
      where gm.teacher_id = t.id
        and gm.ended_at is null
      order by d.lesson_date asc, gs.start_time asc
      limit 1
    ) next_lesson on true
    left join lateral (
      select jsonb_agg(
        jsonb_build_object(
          'id', student_rows.id::text,
          'code', student_rows.code,
          'name', student_rows.full_name,
          'program', student_rows.program_name,
          'status', student_rows.lifecycle_status::text,
          'balance', student_rows.balance_due
        )
        order by student_rows.full_name asc
      ) as items
      from (
        select distinct on (s.id)
          s.id,
          s.code,
          c.full_name,
          p.name as program_name,
          s.lifecycle_status,
          coalesce(invoice_balance.balance_due, 0) as balance_due
        from erp.group_memberships gm
        join erp.enrollments e on e.id = gm.enrollment_id
        join erp.students s on s.id = e.student_id
        join erp.contacts c on c.id = s.contact_id
        join erp.programs p on p.id = e.program_id
        left join lateral (
          select sum(i.balance_due) as balance_due
          from erp.invoices i
          where i.student_id = s.id
            and i.status <> 'VOID'::"erp"."InvoiceStatus"
        ) invoice_balance on true
        where gm.teacher_id = t.id
          and gm.ended_at is null
          and e.status = 'ACTIVE'::"erp"."EnrollmentStatus"
          and s.lifecycle_status in (
            'ACTIVE'::"erp"."StudentLifecycleStatus",
            'DEBT'::"erp"."StudentLifecycleStatus",
            'GROUP_WAITING'::"erp"."StudentLifecycleStatus"
          )
        order by s.id, e.start_date desc, e.created_at desc
      ) student_rows
    ) students on true
    left join lateral (
      select jsonb_agg(
        jsonb_build_object(
          'id', lesson_rows.id::text,
          'student', lesson_rows.student_name,
          'program', lesson_rows.program_name,
          'lessonDate', lesson_rows.lesson_date,
          'startTime', lesson_rows.start_time,
          'group', lesson_rows.group_code,
          'status', lesson_rows.status::text,
          'note', lesson_rows.note
        )
        order by lesson_rows.lesson_date desc, lesson_rows.start_time desc
      ) as items
      from (
        select
          ar.id,
          c.full_name as student_name,
          p.name as program_name,
          gs.session_date as lesson_date,
          gs.start_time,
          g.code as group_code,
          ar.status,
          ar.note
        from erp.attendance_records ar
        join erp.group_sessions gs on gs.id = ar.session_id
        join erp.groups g on g.id = gs.group_id
        join erp.group_memberships gm on gm.id = ar.membership_id
        join erp.enrollments e on e.id = gm.enrollment_id
        join erp.students s on s.id = e.student_id
        join erp.contacts c on c.id = s.contact_id
        join erp.programs p on p.id = e.program_id
        where ar.teacher_id = t.id
        order by gs.session_date desc, gs.start_time desc
        limit 18
      ) lesson_rows
    ) lessons on true
    left join lateral (
      select jsonb_agg(
        jsonb_build_object(
          'id', assignment_rows.id::text,
          'student', assignment_rows.student_name,
          'program', assignment_rows.program_name,
          'createdAt', assignment_rows.created_at,
          'direction', assignment_rows.direction,
          'reason', assignment_rows.reason
        )
        order by assignment_rows.created_at desc
      ) as items
      from (
        select
          h.id,
          c.full_name as student_name,
          p.name as program_name,
          h.created_at,
          case
            when h.new_teacher_id = t.id then 'assigned'
            else 'removed'
          end as direction,
          h.reason
        from erp.teacher_assignment_history h
        join erp.enrollments e on e.id = h.enrollment_id
        join erp.students s on s.id = e.student_id
        join erp.contacts c on c.id = s.contact_id
        join erp.programs p on p.id = e.program_id
        where h.new_teacher_id = t.id or h.old_teacher_id = t.id
        order by h.created_at desc
        limit 12
      ) assignment_rows
    ) assignments on true
    order by t.is_active desc, t.full_name asc
  `);

  const canManageTeacherAccounts = actor.permissions.has("teacher.account.manage");
  const accountOptions = canManageTeacherAccounts
    ? await prisma.user.findMany({
        where: {
          isActive: true,
          roles: { some: { role: { code: "TEACHER" } } },
        },
        select: { id: true, fullName: true, email: true },
        orderBy: { fullName: "asc" },
      })
    : [];

  return {
    permissions: {
      canReadTeachers: actor.permissions.has("teacher.read"),
      canManageTeacherAccounts,
    },
    accountOptions: accountOptions.map((user) => ({ id: user.id, name: user.fullName, email: user.email })),
    teachers: rows.map(mapTeacherRow),
  };
}

function mapTeacherRow(row: TeacherRawRow): TeacherDirectoryTeacher {
  const capacity = Number(row.capacity ?? 0);
  const activeStudentCount = Number(row.activeStudentCount ?? 0);

  return {
    id: row.id,
    userId: row.userId ?? "",
    userName: row.userName ?? "Bağlanmayıb",
    fullName: row.fullName,
    phone: row.phone ?? "",
    capacity,
    isActive: row.isActive,
    activeStudentCount,
    utilization: capacity > 0 ? Math.round((activeStudentCount / capacity) * 100) : 0,
    nextLesson:
      row.nextLessonDate && row.nextLessonTime
        ? `${formatDate(row.nextLessonDate)} / ${row.nextLessonTime}`
        : "Plan yoxdur",
    nextLessonStudent: row.nextLessonStudent ?? "Təyin edilməyib",
    students: asJsonArray<TeacherStudentRaw>(row.students).map((student) => ({
      id: student.id,
      code: student.code,
      name: student.name,
      program: student.program ?? "Proqram seçilməyib",
      status: formatStudentStatus(student.status),
      balance: formatAmount(student.balance ?? 0),
    })),
    lessons: asJsonArray<TeacherLessonRaw>(row.lessons).map((lesson) => ({
      id: lesson.id,
      student: lesson.student,
      program: lesson.program ?? "Proqram seçilməyib",
      date: formatDate(lesson.lessonDate),
      time: lesson.startTime,
      group: lesson.group,
      status: formatLessonStatus(lesson.status),
      note: lesson.note ?? "",
    })),
    assignmentHistory: asJsonArray<TeacherAssignmentRaw>(row.assignmentHistory).map((assignment) => ({
      id: assignment.id,
      student: assignment.student,
      program: assignment.program ?? "Proqram seçilməyib",
      date: formatDate(assignment.createdAt),
      direction: assignment.direction === "assigned" ? "Təyin edildi" : "Çıxarıldı",
      reason: assignment.reason ?? "Qeyd yoxdur",
    })),
  };
}

function formatStudentStatus(value: string) {
  switch (value) {
    case "GROUP_WAITING":
      return "Qrup gözləyir";
    case "ACTIVE":
      return "Aktiv";
    case "DEBT":
      return "Borc";
    case "FROZEN":
      return "Dondurulub";
    default:
      return value;
  }
}

function formatLessonStatus(value: string) {
  switch (value) {
    case "PRESENT":
      return "Gəldi";
    case "ABSENT":
      return "Gəlmədi";
    default:
      return "Qeyd olunmayıb";
  }
}

function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("az-AZ", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function asJsonArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }

  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }

  return [];
}
