import { AppRole, EnrollmentStatus, StudentLifecycleStatus } from "@/generated/prisma/client";
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
  const groupsRaw = await prisma.studentGroup.findMany({
    where: {
      isActive: true,
      ...(teacherId
        ? { memberships: { some: { teacherId, endedAt: null } } }
        : {}),
    },
    include: {
      schedules: true,
      memberships: {
        where: {
          endedAt: null,
          ...(teacherId ? { teacherId } : {}),
        },
        include: {
          teacher: { select: { id: true, fullName: true } },
          enrollment: {
            include: {
              program: { select: { name: true } },
              student: {
                include: { contact: { select: { fullName: true } } },
              },
            },
          },
        },
        orderBy: { joinedAt: "asc" },
      },
    },
    orderBy: { code: "asc" },
  });

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
    members: group.memberships.map(mapMember),
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
  const journalMemberships = selectedGroup
    ? await prisma.groupMembership.findMany({
        where: {
          groupId: selectedGroup.id,
          joinedAt: { lte: selectedDateValue },
          OR: [{ endedAt: null }, { endedAt: { gte: selectedDateValue } }],
          ...(teacherId ? { teacherId } : {}),
        },
        include: {
          teacher: { select: { id: true, fullName: true } },
          enrollment: {
            include: {
              program: { select: { name: true } },
              student: { include: { contact: { select: { fullName: true } } } },
            },
          },
        },
        orderBy: { joinedAt: "asc" },
      })
    : [];
  const session = selectedGroup
    ? await prisma.groupSession.findUnique({
        where: { groupId_sessionDate: { groupId: selectedGroup.id, sessionDate: selectedDateValue } },
        include: { attendance: true },
      })
    : null;
  const attendanceByMembership = new Map(
    (session?.attendance ?? []).map((record) => [record.membershipId, record])
  );
  const journalMembers: JournalMemberView[] = journalMemberships.map((membership) => {
    const member = mapMember(membership);
    const attendance = attendanceByMembership.get(membership.id);
    return {
      ...member,
      attendanceId: attendance?.id ?? null,
      attendanceStatus:
        attendance?.status === "PRESENT"
          ? "present"
          : attendance?.status === "ABSENT"
            ? "absent"
            : null,
      note: attendance?.note ?? "",
    };
  });
  const canManageGroups = actor.permissions.has("group.manage") && privileged;
  const [teachers, enrollmentOptions] = canManageGroups
    ? await Promise.all([
        prisma.teacher.findMany({
          where: { isActive: true },
          select: { id: true, fullName: true },
          orderBy: { fullName: "asc" },
        }),
        prisma.enrollment.findMany({
          where: {
            status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.PAUSED] },
            student: {
              lifecycleStatus: {
                in: [
                  StudentLifecycleStatus.GROUP_WAITING,
                  StudentLifecycleStatus.ACTIVE,
                  StudentLifecycleStatus.DEBT,
                  StudentLifecycleStatus.FROZEN,
                ],
              },
            },
            groupMemberships: { none: { endedAt: null } },
          },
          include: {
            teacher: { select: { id: true, fullName: true } },
            program: { select: { name: true } },
            student: { include: { contact: { select: { fullName: true } } } },
          },
          orderBy: { student: { contact: { fullName: "asc" } } },
        }),
      ])
    : [[], []];
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
      studentId: enrollment.student.id,
      studentCode: enrollment.student.code,
      studentName: enrollment.student.contact.fullName,
      program: enrollment.program.name,
      currentTeacherId: enrollment.teacher?.id ?? "",
      currentTeacherName: enrollment.teacher?.fullName ?? "Müəllim seçilməyib",
      lifecycleStatus: formatLifecycleStatus(enrollment.student.lifecycleStatus),
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
