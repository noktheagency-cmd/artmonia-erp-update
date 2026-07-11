import { AppRole, Prisma, StudentLifecycleStatus } from "@/generated/prisma/client";
import { getPrisma } from "@/server/db/prisma";
import { isPrivilegedActor, requireErpActor } from "@/server/auth/actor";
import {
  formatDateAz,
  formatSchedule,
  latestScheduledDate,
  toDateInput,
  todayInBaku,
  weekdayMeta,
  weekdayFromDate,
  type GroupWeekdayCode,
} from "@/modules/groups/shared";

export type GroupScheduleView = {
  id: string;
  weekday: GroupWeekdayCode;
  label: string;
  shortLabel: string;
  startTime: string;
  endTime: string;
};

export type GroupMemberView = {
  id: string;
  enrollmentId: string;
  studentId: string;
  studentCode: string;
  studentName: string;
  program: string;
  teacherId: string;
  teacherName: string;
  lifecycleStatus: string;
  joinedAt: string;
};

export type GroupView = {
  id: string;
  code: string;
  capacity: number;
  memberCount: number;
  scheduleLabel: string;
  schedules: GroupScheduleView[];
  members: GroupMemberView[];
};

export type JournalMemberView = GroupMemberView & {
  attendanceId: string | null;
  attendanceStatus: "present" | "absent" | null;
  note: string;
};

export type GroupWorkspaceData = {
  actorMode: "manager" | "teacher";
  actorName: string;
  permissions: {
    canManageGroups: boolean;
    canManageAttendance: boolean;
    canExport: boolean;
  };
  groups: GroupView[];
  selectedGroupId: string;
  teachers: Array<{ id: string; name: string }>;
  enrollmentOptions: Array<{
    id: string;
    studentId: string;
    studentCode: string;
    studentName: string;
    program: string;
    currentTeacherId: string;
    currentTeacherName: string;
    lifecycleStatus: string;
  }>;
  journal: {
    date: string;
    dateLabel: string;
    today: string;
    scheduleLabel: string;
    members: JournalMemberView[];
    presentCount: number;
    absentCount: number;
    unmarkedCount: number;
  };
};

type GroupRawRow = {
  id: string;
  code: string;
  capacity: number;
  schedules: Array<{ id: string; weekday: GroupWeekdayCode; startTime: string; endTime: string }>;
  memberships: Array<{
    id: string;
    enrollmentId: string;
    teacherId: string;
    joinedAt: string;
    teacher: { id: string; fullName: string };
    enrollment: {
      program: { name: string };
      student: { id: string; code: string; lifecycleStatus: StudentLifecycleStatus; contact: { fullName: string } };
    };
  }>;
};

type JournalRawRow = {
  id: string;
  enrollmentId: string;
  studentId: string;
  studentCode: string;
  studentName: string;
  program: string;
  teacherId: string;
  teacherName: string;
  lifecycleStatus: StudentLifecycleStatus;
  joinedAt: string;
  attendanceId: string | null;
  attendanceStatus: "PRESENT" | "ABSENT" | null;
  note: string | null;
};

type EnrollmentOptionRawRow = {
  id: string;
  studentId: string;
  studentCode: string;
  studentName: string;
  program: string;
  currentTeacherId: string | null;
  currentTeacherName: string | null;
  lifecycleStatus: StudentLifecycleStatus;
};

export async function getGroupWorkspaceData(input?: {
  groupId?: string;
  date?: string;
}): Promise<GroupWorkspaceData> {
  const actor = await requireErpActor("group.read");
  const prisma = getPrisma();
  const privileged = isPrivilegedActor(actor);
  const isTeacher = actor.roles.includes(AppRole.TEACHER) && !privileged;
  const teacherProfile = isTeacher
    ? await prisma.teacher.findUnique({ where: { userId: actor.id }, select: { id: true, fullName: true } })
    : null;

  if (isTeacher && !teacherProfile) {
    return emptyWorkspace(actor.fullName, "teacher");
  }

  const teacherId = teacherProfile?.id;
  const teacherGroupFilter = teacherId ? Prisma.sql`
    and exists (
      select 1 from erp.group_memberships scoped_membership
      where scoped_membership.group_id = student_group.id
        and scoped_membership.teacher_id = ${teacherId}::uuid
        and scoped_membership.ended_at is null
    )
  ` : Prisma.empty;
  const teacherMembershipFilter = teacherId
    ? Prisma.sql`and membership.teacher_id = ${teacherId}::uuid`
    : Prisma.empty;
  const groupsRaw = await prisma.$queryRaw<GroupRawRow[]>(Prisma.sql`
    select
      student_group.id::text as id,
      student_group.code,
      student_group.capacity,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', schedule.id::text,
          'weekday', schedule.weekday::text,
          'startTime', schedule.start_time,
          'endTime', schedule.end_time
        ) order by schedule.weekday, schedule.start_time)
        from erp.group_schedules schedule
        where schedule.group_id = student_group.id
      ), '[]'::jsonb) as schedules,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', membership.id::text,
          'enrollmentId', membership.enrollment_id::text,
          'teacherId', membership.teacher_id::text,
          'joinedAt', membership.joined_at,
          'teacher', jsonb_build_object('id', teacher.id::text, 'fullName', teacher.full_name),
          'enrollment', jsonb_build_object(
            'program', jsonb_build_object('name', program.name),
            'student', jsonb_build_object(
              'id', student.id::text,
              'code', student.code,
              'lifecycleStatus', student.lifecycle_status::text,
              'contact', jsonb_build_object('fullName', contact.full_name)
            )
          )
        ) order by membership.joined_at asc)
        from erp.group_memberships membership
        join erp.teachers teacher on teacher.id = membership.teacher_id
        join erp.enrollments enrollment on enrollment.id = membership.enrollment_id
        join erp.programs program on program.id = enrollment.program_id
        join erp.students student on student.id = enrollment.student_id
        join erp.contacts contact on contact.id = student.contact_id
        where membership.group_id = student_group.id
          and membership.ended_at is null
          ${teacherMembershipFilter}
      ), '[]'::jsonb) as memberships
    from erp.groups student_group
    where student_group.is_active = true
      ${teacherGroupFilter}
    order by student_group.code asc
  `);

  const groups: GroupView[] = groupsRaw.map((group) => ({
    id: group.id,
    code: group.code,
    capacity: group.capacity,
    memberCount: group.memberships.length,
    scheduleLabel: formatSchedule(group.schedules),
    schedules: group.schedules
      .toSorted((left, right) => weekdayMeta[left.weekday].index - weekdayMeta[right.weekday].index)
      .map((schedule) => ({
        id: schedule.id,
        weekday: schedule.weekday,
        label: weekdayMeta[schedule.weekday].label,
        shortLabel: weekdayMeta[schedule.weekday].shortLabel,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
      })),
    members: group.memberships.map((membership) => mapMember({
      ...membership,
      joinedAt: new Date(membership.joinedAt),
    })),
  }));
  const selectedGroup = groups.find((group) => group.id === input?.groupId) ?? groups[0];
  const selectedGroupRaw = selectedGroup
    ? groupsRaw.find((group) => group.id === selectedGroup.id)
    : undefined;
  const selectedDate = selectedGroupRaw
    ? latestScheduledDate(
        selectedGroupRaw.schedules.map((schedule) => schedule.weekday),
        input?.date
      )
    : todayInBaku();
  const selectedDateValue = new Date(`${selectedDate}T00:00:00.000Z`);
  const canManageGroups = actor.permissions.has("group.manage") && privileged;
  const managementOptionsPromise = canManageGroups
    ? Promise.all([
        prisma.teacher.findMany({
          where: { isActive: true },
          select: { id: true, fullName: true },
          orderBy: { fullName: "asc" },
        }),
        prisma.$queryRaw<EnrollmentOptionRawRow[]>(Prisma.sql`
          select
            enrollment.id::text as id,
            student.id::text as "studentId",
            student.code as "studentCode",
            contact.full_name as "studentName",
            program.name as program,
            teacher.id::text as "currentTeacherId",
            teacher.full_name as "currentTeacherName",
            student.lifecycle_status::text as "lifecycleStatus"
          from erp.enrollments enrollment
          join erp.students student on student.id = enrollment.student_id
          join erp.contacts contact on contact.id = student.contact_id
          join erp.programs program on program.id = enrollment.program_id
          left join erp.teachers teacher on teacher.id = enrollment.teacher_id
          where enrollment.status in ('ACTIVE', 'PAUSED')
            and student.lifecycle_status in ('GROUP_WAITING', 'ACTIVE', 'DEBT', 'FROZEN')
            and not exists (
              select 1 from erp.group_memberships membership
              where membership.enrollment_id = enrollment.id and membership.ended_at is null
            )
          order by contact.full_name asc
        `),
      ])
    : Promise.resolve([[], []] as const);
  const [journalMemberships, [teachers, enrollmentOptions]] = await Promise.all([
    selectedGroup
    ? prisma.$queryRaw<JournalRawRow[]>(Prisma.sql`
        select
          membership.id::text as id,
          membership.enrollment_id::text as "enrollmentId",
          student.id::text as "studentId",
          student.code as "studentCode",
          contact.full_name as "studentName",
          program.name as program,
          teacher.id::text as "teacherId",
          teacher.full_name as "teacherName",
          student.lifecycle_status::text as "lifecycleStatus",
          membership.joined_at::text as "joinedAt",
          attendance.id::text as "attendanceId",
          attendance.status::text as "attendanceStatus",
          attendance.note
        from erp.group_memberships membership
        join erp.enrollments enrollment on enrollment.id = membership.enrollment_id
        join erp.students student on student.id = enrollment.student_id
        join erp.contacts contact on contact.id = student.contact_id
        join erp.programs program on program.id = enrollment.program_id
        join erp.teachers teacher on teacher.id = membership.teacher_id
        left join erp.group_sessions session
          on session.group_id = membership.group_id and session.session_date = ${selectedDateValue}
        left join erp.attendance_records attendance
          on attendance.session_id = session.id and attendance.membership_id = membership.id
        where membership.group_id = ${selectedGroup.id}::uuid
          and membership.joined_at <= ${selectedDateValue}
          and (membership.ended_at is null or membership.ended_at >= ${selectedDateValue})
          ${teacherMembershipFilter}
        order by membership.joined_at asc
      `)
    : Promise.resolve([]),
    managementOptionsPromise,
  ]);
  const journalMembers: JournalMemberView[] = journalMemberships.map((membership) => {
    return {
      id: membership.id,
      enrollmentId: membership.enrollmentId,
      studentId: membership.studentId,
      studentCode: membership.studentCode,
      studentName: membership.studentName,
      program: membership.program,
      teacherId: membership.teacherId,
      teacherName: membership.teacherName,
      lifecycleStatus: formatLifecycleStatus(membership.lifecycleStatus),
      joinedAt: toDateInput(new Date(membership.joinedAt)),
      attendanceId: membership.attendanceId,
      attendanceStatus:
        membership.attendanceStatus === "PRESENT"
          ? "present"
          : membership.attendanceStatus === "ABSENT"
            ? "absent"
            : null,
      note: membership.note ?? "",
    };
  });
  const scheduleForDate = selectedGroupRaw?.schedules.find(
    (schedule) => schedule.weekday === weekdayFromDate(selectedDate)
  );
  const presentCount = journalMembers.filter((member) => member.attendanceStatus === "present").length;
  const absentCount = journalMembers.filter((member) => member.attendanceStatus === "absent").length;

  return {
    actorMode: teacherId ? "teacher" : "manager",
    actorName: teacherProfile?.fullName ?? actor.fullName,
    permissions: {
      canManageGroups,
      canManageAttendance: actor.permissions.has("attendance.manage"),
      canExport: actor.permissions.has("report.export"),
    },
    groups,
    selectedGroupId: selectedGroup?.id ?? "",
    teachers: teachers.map((teacher) => ({ id: teacher.id, name: teacher.fullName })),
    enrollmentOptions: enrollmentOptions.map((enrollment) => ({
      id: enrollment.id,
      studentId: enrollment.studentId,
      studentCode: enrollment.studentCode,
      studentName: enrollment.studentName,
      program: enrollment.program,
      currentTeacherId: enrollment.currentTeacherId ?? "",
      currentTeacherName: enrollment.currentTeacherName ?? "Müəllim seçilməyib",
      lifecycleStatus: formatLifecycleStatus(enrollment.lifecycleStatus),
    })),
    journal: {
      date: selectedDate,
      dateLabel: formatDateAz(selectedDate),
      today: todayInBaku(),
      scheduleLabel: scheduleForDate
        ? `${weekdayMeta[scheduleForDate.weekday].shortLabel} ${scheduleForDate.startTime}–${scheduleForDate.endTime}`
        : selectedGroup?.scheduleLabel ?? "Cədvəl yoxdur",
      members: journalMembers,
      presentCount,
      absentCount,
      unmarkedCount: journalMembers.length - presentCount - absentCount,
    },
  };
}

function mapMember(membership: {
  id: string;
  enrollmentId: string;
  teacherId: string;
  joinedAt: Date;
  teacher: { id: string; fullName: string };
  enrollment: {
    program: { name: string };
    student: {
      id: string;
      code: string;
      lifecycleStatus: StudentLifecycleStatus;
      contact: { fullName: string };
    };
  };
}): GroupMemberView {
  return {
    id: membership.id,
    enrollmentId: membership.enrollmentId,
    studentId: membership.enrollment.student.id,
    studentCode: membership.enrollment.student.code,
    studentName: membership.enrollment.student.contact.fullName,
    program: membership.enrollment.program.name,
    teacherId: membership.teacher.id,
    teacherName: membership.teacher.fullName,
    lifecycleStatus: formatLifecycleStatus(membership.enrollment.student.lifecycleStatus),
    joinedAt: toDateInput(membership.joinedAt),
  };
}

function formatLifecycleStatus(status: StudentLifecycleStatus) {
  return {
    GROUP_WAITING: "Qrup gözləyir",
    ACTIVE: "Aktiv",
    DEBT: "Borc",
    FROZEN: "Dondurulub",
    STOPPED: "Dayandırılıb",
    DECLINED: "İmtina",
    COMPLETED: "Tamamlanıb",
  }[status];
}

function emptyWorkspace(actorName: string, actorMode: "teacher" | "manager"): GroupWorkspaceData {
  const today = todayInBaku();
  return {
    actorMode,
    actorName,
    permissions: { canManageGroups: false, canManageAttendance: false, canExport: false },
    groups: [],
    selectedGroupId: "",
    teachers: [],
    enrollmentOptions: [],
    journal: {
      date: today,
      dateLabel: formatDateAz(today),
      today,
      scheduleLabel: "Cədvəl yoxdur",
      members: [],
      presentCount: 0,
      absentCount: 0,
      unmarkedCount: 0,
    },
  };
}
