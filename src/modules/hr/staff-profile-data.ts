import { AppRole } from "@/generated/prisma/client";
import { isProtectedTeamRole } from "@/lib/protected-roles";
import { requireErpActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";
import {
  getTeacherDirectoryData,
  type TeacherDirectoryTeacher,
} from "@/modules/hr/teacher-directory-data";

export type HrStaffNotificationRow = {
  id: string;
  category:
    | "RULE_VIOLATION"
    | "PERFORMANCE_WARNING"
    | "INFORMATION"
    | "APPRECIATION"
    | "MANUAL";
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  title: string;
  message: string;
  status: "SENT" | "READ" | "ACKNOWLEDGED" | "RESOLVED";
  sentAt: string;
  readAt: string;
  acknowledgedAt: string;
  resolvedAt: string;
  creatorName: string;
};

export type HrStaffProfileData = {
  employee: {
    id: string;
    userId: string;
    teacherCapacity: number;
    fullName: string;
    profilePhotoUrl: string;
    staffType: "EMPLOYEE" | "TEACHER";
    email: string;
    phone: string;
    address: string;
    department: string;
    position: string;
    hireDate: string;
    status: "ACTIVE" | "PROBATION" | "ON_LEAVE" | "INACTIVE";
    contractType: string;
    salaryMode: "STATIC" | "PERCENT";
    salaryAmount: number;
    salaryPercent: number;
    note: string;
    hasLogin: boolean;
    loginEmail: string;
    roles: Array<{ id: string; name: string }>;
    updatedAt: string;
  };
  lookups: { departments: string[]; positions: string[] };
  teacher: TeacherDirectoryTeacher | null;
  notifications: HrStaffNotificationRow[];
  timeline: Array<{
    id: string;
    label: string;
    reason: string;
    actor: string;
    createdAt: string;
  }>;
  roleOptions: Array<{ id: string; name: string; code: string | null }>;
  permissions: {
    canManage: boolean;
    canSendNotification: boolean;
    canManageCredentials: boolean;
    isOwnProfile: boolean;
  };
};

export async function getHrStaffProfileData(
  id: string,
): Promise<HrStaffProfileData | null> {
  const actor = await requireErpActor();
  const employee = await getPrisma().hrEmployee.findUnique({
    where: { id },
    include: {
      teacher: true,
      user: { include: { roles: { include: { role: true } } } },
      notifications: {
        include: { creator: true },
        orderBy: { createdAt: "desc" },
        take: 100,
      },
    },
  });
  if (!employee) return null;

  const isOwnProfile = employee.userId === actor.id;
  if (!isOwnProfile && !actor.permissions.has("hr.employee.read")) return null;

  const canManage = actor.permissions.has("hr.employee.manage");
  const hasProtectedRole = employee.user?.roles.some(({ role }) => isProtectedTeamRole(role.code)) ?? false;
  const canManageCredentials = actor.permissions.has("auth.user.manage") && !hasProtectedRole;
  const [directory, timeline, roleOptions, lookups] = await Promise.all([
    employee.teacherId &&
    (actor.permissions.has("teacher.read") || isOwnProfile)
      ? getTeacherDirectoryData(isOwnProfile ? employee.teacherId : undefined)
      : Promise.resolve(null),
    actor.roles.includes(AppRole.SUPER_ADMIN)
      ? getPrisma().auditLog.findMany({
          where: {
            OR: [
              { entityType: "hr_employee", entityId: employee.id },
              ...(employee.teacherId
                ? [{ entityType: "teacher", entityId: employee.teacherId }]
                : []),
            ],
          },
          include: { actor: true },
          orderBy: { createdAt: "desc" },
          take: 20,
        })
      : Promise.resolve([]),
    canManageCredentials
      ? getPrisma().role.findMany({
          where: { OR: [{ code: null }, { code: { notIn: [AppRole.SUPER_ADMIN, AppRole.ADMIN] } }] },
          select: { id: true, name: true, code: true },
          orderBy: [{ isSystem: "desc" }, { name: "asc" }],
        })
      : Promise.resolve([]),
    canManage
      ? getPrisma().hrLookupOption.findMany({
          where: { isActive: true },
          select: { kind: true, name: true },
          orderBy: [{ kind: "asc" }, { name: "asc" }],
          take: 500,
        })
      : Promise.resolve([]),
  ]);

  return {
    employee: {
      id: employee.id,
      userId: employee.userId ?? "",
      teacherCapacity: employee.teacher?.capacity ?? 0,
      fullName: employee.fullName,
      profilePhotoUrl: employee.profilePhotoUrl ?? "",
      staffType: employee.staffType,
      email: employee.email ?? "",
      phone: employee.phone ?? "",
      address: employee.address ?? "",
      department: employee.department,
      position: employee.position,
      hireDate: employee.hireDate.toISOString().slice(0, 10),
      status: employee.status,
      contractType: employee.contractType,
      salaryMode: employee.salaryMode === "PERCENT" ? "PERCENT" : "STATIC",
      salaryAmount: Number(employee.salaryAmount),
      salaryPercent: Number(employee.salaryPercent ?? 0),
      note: employee.note ?? "",
      hasLogin: Boolean(employee.user?.authUserId),
      loginEmail: employee.user?.email ?? employee.email ?? "",
      roles:
        employee.user?.roles.map(({ role }) => ({
          id: role.id,
          name: role.name,
        })) ?? [],
      updatedAt: employee.updatedAt.toISOString(),
    },
    lookups: {
      departments: [...new Set([
        ...lookups.filter((item) => item.kind === "DEPARTMENT" && item.name !== "__new").map((item) => item.name),
        employee.department,
      ])].toSorted((left, right) => left.localeCompare(right, "az")),
      positions: [...new Set([
        ...lookups.filter((item) => item.kind === "POSITION" && item.name !== "__new").map((item) => item.name),
        employee.position,
      ])].toSorted((left, right) => left.localeCompare(right, "az")),
    },
    teacher:
      directory?.teachers.find((item) => item.id === employee.teacherId) ??
      null,
    notifications: employee.notifications.map((item) => ({
      id: item.id,
      category: item.category,
      priority: item.priority,
      title: item.title,
      message: item.message,
      status: item.status,
      sentAt: item.sentAt.toISOString(),
      readAt: item.readAt?.toISOString() ?? "",
      acknowledgedAt: item.acknowledgedAt?.toISOString() ?? "",
      resolvedAt: item.resolvedAt?.toISOString() ?? "",
      creatorName: item.creator.fullName,
    })),
    timeline: timeline.map((item) => ({
      id: item.id,
      label: auditLabel(item.action),
      reason: item.reason ?? "Sistem dəyişikliyi",
      actor: item.actor?.fullName ?? "Sistem",
      createdAt: item.createdAt.toISOString(),
    })),
    roleOptions,
    permissions: {
      canManage,
      canSendNotification:
        canManage && !isOwnProfile,
      canManageCredentials,
      isOwnProfile,
    },
  };
}

function auditLabel(action: string) {
  if (action.includes("credentials")) return "Login məlumatları yeniləndi";
  if (action.includes("notification")) return "Bildiriş yeniləndi";
  if (action.includes("salary")) return "Maaş qaydası yeniləndi";
  if (action.includes("create")) return "Profil yaradıldı";
  if (action.includes("archive")) return "Profil passiv edildi";
  if (action.includes("update")) return "Profil yeniləndi";
  return "HR əməliyyatı";
}
