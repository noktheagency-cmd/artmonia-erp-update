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
    fullName: string;
    profilePhotoUrl: string;
    staffType: "EMPLOYEE" | "TEACHER";
    email: string;
    phone: string;
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

  const canManageCredentials = actor.permissions.has("auth.user.manage");
  const [directory, timeline, roleOptions] = await Promise.all([
    employee.teacherId &&
    (actor.permissions.has("teacher.read") || isOwnProfile)
      ? getTeacherDirectoryData(isOwnProfile ? employee.teacherId : undefined)
      : Promise.resolve(null),
    actor.permissions.has("audit.read")
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
          where: { OR: [{ code: null }, { code: { not: "SUPER_ADMIN" } }] },
          select: { id: true, name: true, code: true },
          orderBy: [{ isSystem: "desc" }, { name: "asc" }],
        })
      : Promise.resolve([]),
  ]);

  return {
    employee: {
      id: employee.id,
      userId: employee.userId ?? "",
      fullName: employee.fullName,
      profilePhotoUrl: employee.profilePhotoUrl ?? "",
      staffType: employee.staffType,
      email: employee.email ?? "",
      phone: employee.phone ?? "",
      department: employee.department,
      position: employee.position,
      hireDate: employee.hireDate.toISOString(),
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
      canManage: actor.permissions.has("hr.employee.manage"),
      canSendNotification:
        actor.permissions.has("hr.employee.manage") && !isOwnProfile,
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
