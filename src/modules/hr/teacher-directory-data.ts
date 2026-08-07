import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/server/db/prisma";
import { requireErpActor } from "@/server/auth/actor";
import { formatAmount } from "@/modules/shared/format";
import { getTeacherPayrollPreviews } from "@/modules/hr/teacher-payroll";

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
  slot: string;
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
  hrEmployeeId: string;
  salaryMode: "STATIC" | "PERCENT";
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
  salaryPercent: number;
  paidRevenue: number;
  eligibleRevenue: number;
  estimatedSalary: number;
  attendedLessons: number;
  plannedLessons: number;
};

export type TeacherDirectoryData = {
  permissions: {
    canReadTeachers: boolean;
    canManageTeacherAccounts: boolean;
    canManageTeacherRules: boolean;
    canExport: boolean;
  };
  accountOptions: Array<{ id: string; name: string; email: string }>;
  teachers: TeacherDirectoryTeacher[];
};

type TeacherRawRow = {
  id: string;
  hrEmployeeId: string | null;
  salaryMode: string | null;
  salaryAmount: Prisma.Decimal | number | string | null;
  employeeSalaryPercent: Prisma.Decimal | number | string | null;
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
  slot: string;
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

export async function getTeacherDirectoryData(ownTeacherId?: string): Promise<TeacherDirectoryData> {
  const actor = await requireErpActor();
  const canReadTeachers = actor.permissions.has("teacher.read");
  const ownTeacher = !canReadTeachers && ownTeacherId
    ? await getPrisma().teacher.findFirst({ where: { id: ownTeacherId, userId: actor.id }, select: { id: true } })
    : null;

  if (!canReadTeachers && !ownTeacher) {
    return {
      permissions: {
        canReadTeachers: false,
        canManageTeacherAccounts: false,
        canManageTeacherRules: false,
        canExport: false,
      },
      accountOptions: [],
      teachers: [],
    };
  }

  const prisma = getPrisma();
  const teacherScope = canReadTeachers
    ? Prisma.sql`where not (t.is_active = false and he.id is null and t.user_id is null)`
    : Prisma.sql`where not (t.is_active = false and he.id is null and t.user_id is null) and t.id = ${ownTeacher!.id}::uuid`;
  const rows = await prisma.$queryRaw<TeacherRawRow[]>(Prisma.sql`
    select
      t.id::text as "id",
      he.id::text as "hrEmployeeId",
      he.salary_mode::text as "salaryMode",
      he.salary_amount as "salaryAmount",
      he.salary_percent as "employeeSalaryPercent",
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
    left join erp.hr_employees he on he.teacher_id = t.id
    left join erp.users linked_user on linked_user.id = t.user_id
    left join erp.contacts tc on tc.id = t.contact_id
    left join lateral (
      select count(distinct s.id)::int as active_student_count
      from erp.student_schedule_assignments ssa
      join erp.class_slots cs on cs.id = ssa.slot_id
      join erp.enrollments e on e.id = ssa.enrollment_id
      join erp.students s on s.id = e.student_id
      where cs.teacher_id = t.id
        and ssa.valid_to is null
        and e.status = 'ACTIVE'::"erp"."EnrollmentStatus"
        and s.lifecycle_status in (
          'ACTIVE'::"erp"."StudentLifecycleStatus",
          'DEBT'::"erp"."StudentLifecycleStatus",
          'SLOT_WAITING'::"erp"."StudentLifecycleStatus"
        )
    ) active_counts on true
    left join lateral (
      select
        d.lesson_date,
        cs.start_time,
        coalesce(cs.room, 'Slot') as student_name
      from erp.class_slots cs
      cross join lateral (
        select day::date as lesson_date
        from generate_series(current_date, current_date + interval '14 days', interval '1 day') day
        where day::date >= cs.valid_from
          and cs.weekday::text = case extract(isodow from day)::int
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
      where cs.teacher_id = t.id
      order by d.lesson_date asc, cs.start_time asc
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
        from erp.student_schedule_assignments ssa
        join erp.class_slots cs on cs.id = ssa.slot_id
        join erp.enrollments e on e.id = ssa.enrollment_id
        join erp.students s on s.id = e.student_id
        join erp.contacts c on c.id = s.contact_id
        join erp.programs p on p.id = e.program_id
        left join lateral (
          select sum(i.balance_due) as balance_due
          from erp.invoices i
          where i.student_id = s.id
            and i.status <> 'VOID'::"erp"."InvoiceStatus"
        ) invoice_balance on true
        where cs.teacher_id = t.id
          and ssa.valid_to is null
          and e.status = 'ACTIVE'::"erp"."EnrollmentStatus"
          and s.lifecycle_status in (
            'ACTIVE'::"erp"."StudentLifecycleStatus",
            'DEBT'::"erp"."StudentLifecycleStatus",
            'SLOT_WAITING'::"erp"."StudentLifecycleStatus"
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
          'slot', lesson_rows.slot_label,
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
          ss.session_date as lesson_date,
          ss.start_time,
          coalesce(cs.room, 'Slot') as slot_label,
          ar.status,
          ar.note
        from erp.attendance_records ar
        join erp.slot_sessions ss on ss.id = ar.session_id
        join erp.class_slots cs on cs.id = ss.slot_id
        join erp.enrollments e on e.id = ar.enrollment_id
        join erp.students s on s.id = e.student_id
        join erp.contacts c on c.id = s.contact_id
        join erp.programs p on p.id = e.program_id
        where ar.teacher_id = t.id
        order by ss.session_date desc, ss.start_time desc
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
    ${teacherScope}
    order by t.is_active desc, t.full_name asc
  `);

  const [payrollPreviews, accountOptions] = await Promise.all([
    getTeacherPayrollPreviews(),
    actor.permissions.has("teacher.account.manage")
      ? prisma.user.findMany({
          where: { isActive: true, roles: { some: { role: { code: "TEACHER" } } } },
          select: { id: true, fullName: true, email: true },
          orderBy: { fullName: "asc" },
        })
      : Promise.resolve([]),
  ]);
  const canManageTeacherAccounts = actor.permissions.has("teacher.account.manage");

  return {
    permissions: {
      canReadTeachers,
      canManageTeacherAccounts,
      canManageTeacherRules: actor.permissions.has("teacher.rule.manage"),
      canExport: actor.permissions.has("report.export"),
    },
    accountOptions: accountOptions.map((user) => ({ id: user.id, name: user.fullName, email: user.email })),
    teachers: rows.map((row) => mapTeacherRow(row, payrollPreviews.get(row.id))),
  };
}

function mapTeacherRow(row: TeacherRawRow, payroll?: import("@/modules/hr/teacher-payroll").TeacherPayrollPreview): TeacherDirectoryTeacher {
  const capacity = Number(row.capacity ?? 0);
  const activeStudentCount = Number(row.activeStudentCount ?? 0);
  const salaryMode = row.salaryMode === "STATIC" ? "STATIC" : "PERCENT";
  const salaryPercent = row.hrEmployeeId
    ? Number(row.employeeSalaryPercent ?? payroll?.salaryPercent ?? 0)
    : payroll?.salaryPercent ?? 0;

  return {
    id: row.id,
    hrEmployeeId: row.hrEmployeeId ?? "",
    salaryMode,
    userId: row.userId ?? "",
    userName: row.userName ?? "Bağlanmayıb",
    fullName: row.fullName,
    phone: row.phone ?? "",
    capacity,
    isActive: row.isActive,
    activeStudentCount,
    utilization: capacity > 0 ? Math.round((activeStudentCount / capacity) * 100) : 0,
    salaryPercent,
    paidRevenue: payroll?.paidRevenue ?? 0,
    eligibleRevenue: payroll?.eligibleRevenue ?? 0,
    estimatedSalary: salaryMode === "STATIC"
      ? Number(row.salaryAmount ?? 0)
      : payroll?.payoutAmount ?? 0,
    attendedLessons: payroll?.attendedLessons ?? 0,
    plannedLessons: payroll?.plannedLessons ?? 0,
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
      slot: lesson.slot,
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
    case "SLOT_WAITING":
      return "Slot gözləyir";
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
