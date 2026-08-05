import { AppRole } from "@/generated/prisma/client";
import { requireErpActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";
import {
  isPermissionCode,
  permissionDefinitions,
  type PermissionScope,
} from "@/server/rbac/permissions";
import type { RolePermissionMatrix } from "@/modules/roles/types";

const roleOrder: AppRole[] = [
  AppRole.SUPER_ADMIN,
  AppRole.OWNER,
  AppRole.ADMIN,
  AppRole.SALES,
  AppRole.FINANCE,
  AppRole.TEACHER,
  AppRole.AUDITOR,
];

export async function getRolePermissionMatrix(): Promise<RolePermissionMatrix> {
  const actor = await requireErpActor("auth.role.read");
  const [roles, users, auditLogs] = await Promise.all([
    getPrisma().role.findMany({
      include: {
        _count: { select: { users: true } },
        permissions: { include: { permission: true } },
      },
    }),
    getPrisma().user.findMany({
      where: {
        isActive: true,
        roles: { some: {} },
      },
      orderBy: { fullName: "asc" },
      take: 500,
      select: {
        id: true,
        authUserId: true,
        fullName: true,
        email: true,
        isActive: true,
        roles: { select: { roleId: true, role: { select: { code: true } } } },
        hrEmployeeProfile: {
          select: {
            id: true,
            department: true,
            position: true,
            status: true,
          },
        },
      },
    }),
    actor.permissions.has("audit.read") ? getPrisma().auditLog.findMany({
      take: 200,
      orderBy: { createdAt: "desc" },
      include: { actor: { select: { fullName: true, email: true } } },
    }) : Promise.resolve([]),
  ]);

  const roleRank = new Map(roleOrder.map((role, index) => [role, index]));
  return {
    roles: roles
      .toSorted((left, right) => {
        const rank = (roleRank.get(left.code ?? AppRole.AUDITOR) ?? 99) - (roleRank.get(right.code ?? AppRole.AUDITOR) ?? 99);
        if (left.isSystem !== right.isSystem) return left.isSystem ? -1 : 1;
        return rank || left.name.localeCompare(right.name, "az");
      })
      .map((role) => ({
        id: role.id,
        code: role.code,
        key: role.key,
        name: role.name,
        description: role.description,
        isSystem: role.isSystem,
        userCount: role._count.users,
        updatedAt: role.updatedAt.toISOString(),
        grants:
          role.code === AppRole.SUPER_ADMIN
            ? permissionDefinitions.map(({ code }) => ({ code, scope: "ALL" as PermissionScope }))
            : role.permissions.flatMap(({ permission, scope }) =>
                isPermissionCode(permission.code)
                  ? [{ code: permission.code, scope: scope as PermissionScope }]
                  : []
              ),
      })),
    users: users.map((user) => ({
      id: user.id,
      employeeId: user.hrEmployeeProfile?.id ?? null,
      kind: user.hrEmployeeProfile ? "EMPLOYEE" as const : "PROFILE" as const,
      fullName: user.fullName,
      email: user.email,
      department: user.hrEmployeeProfile?.department ?? "HR xaricində",
      position: user.hrEmployeeProfile?.position ?? "Giriş profili",
      isActive: user.isActive && user.hrEmployeeProfile?.status !== "INACTIVE",
      hasLogin: Boolean(user.authUserId),
      isProtected: user.roles.some(({ role }) => role.code === AppRole.SUPER_ADMIN),
      roleIds: user.roles.map((role) => role.roleId),
    })),
    auditLogs: auditLogs.map((log) => ({
      id: log.id,
      actorName: log.actor?.fullName ?? "Sistem",
      actorEmail: log.actor?.email ?? null,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      reason: log.reason,
      before: log.beforeJson,
      after: log.afterJson,
      ipAddress: log.ipAddress,
      createdAt: log.createdAt.toISOString(),
    })),
    definitions: permissionDefinitions.map((definition) => ({
      code: definition.code,
      module: definition.module,
      moduleLabel: definition.moduleLabel,
      tab: definition.tab,
      tabLabel: definition.tabLabel,
      action: definition.action,
      actionLabel: definition.actionLabel,
      description: definition.description,
      sensitive: "sensitive" in definition ? Boolean(definition.sensitive) : false,
      superAdminManaged: "superAdminManaged" in definition ? Boolean(definition.superAdminManaged) : false,
      supportsScope: "supportsScope" in definition ? Boolean(definition.supportsScope) : false,
      dependsOn:
        "dependsOn" in definition && isPermissionCode(definition.dependsOn)
          ? definition.dependsOn
          : null,
    })),
    canManage: actor.permissions.has("auth.role.manage"),
    canManageSuperAdminPermissions: actor.roles.includes(AppRole.SUPER_ADMIN),
    canManageUsers: actor.permissions.has("auth.user.manage"),
    canViewAudit: actor.permissions.has("audit.read"),
  };
}
