import { AppRole, Prisma } from "@/generated/prisma/client";
import { isProtectedLoginRole } from "./account-lifecycle-policy";
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
  const [roles, users] = await Promise.all([
    getPrisma().role.findMany({
      include: {
        _count: { select: { users: true } },
        permissions: { include: { permission: true } },
      },
    }),
    getPrisma().user.findMany({
      where: {
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
        updatedAt: true,
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
  ]);

  const canChangeUserStatus = actor.permissions.has("auth.user.status.change");
  const canDeleteUserAccounts = actor.permissions.has("auth.user.delete");
  const pendingRows = users.length && (canChangeUserStatus || canDeleteUserAccounts)
    ? await getPrisma().$queryRaw<Array<{ userId: string; requestKey: string; operation: "ENABLE" | "DISABLE" | "DELETE"; expectedUpdatedAt: string; reason: string }>>(Prisma.sql`
      select r.entity_id::text as "userId", r.after_json->>'requestKey' as "requestKey",
        r.after_json->>'operation' as operation, r.after_json->>'inputVersion' as "expectedUpdatedAt", r.reason
      from erp.audit_logs r
      where r.entity_type = 'user' and r.action = 'auth.account.lifecycle.request'
        and r.entity_id in (${Prisma.join(users.map((user) => Prisma.sql`${user.id}::uuid`))})
        and not exists (select 1 from erp.audit_logs done
          where done.entity_id = r.entity_id and done.entity_type = 'user' and done.action = 'auth.account.lifecycle.complete'
            and done.after_json->>'requestKey' = r.after_json->>'requestKey')
      order by r.created_at desc limit 500
    `) : [];
  const pending = new Map(pendingRows.filter((row) => row.operation === "DELETE" ? canDeleteUserAccounts : canChangeUserStatus).map((row) => [row.userId, row]));

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
      updatedAt: user.updatedAt.toISOString(),
      isCurrent: user.id === actor.id,
      pendingAccessChange: pending.get(user.id) ?? null,
      id: user.id,
      employeeId: user.hrEmployeeProfile?.id ?? null,
      kind: user.hrEmployeeProfile ? "EMPLOYEE" as const : "PROFILE" as const,
      fullName: user.fullName,
      email: user.email,
      department: user.hrEmployeeProfile?.department ?? "HR xaricində",
      position: user.hrEmployeeProfile?.position ?? "Giriş profili",
      isActive: user.isActive,
      hasLogin: Boolean(user.authUserId),
      isProtected: user.roles.some(({ role }) => isProtectedLoginRole(role.code)),
      roleIds: user.roles.map((role) => role.roleId),
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
      superAdminOnly: "superAdminOnly" in definition ? Boolean(definition.superAdminOnly) : false,
      supportsScope: "supportsScope" in definition ? Boolean(definition.supportsScope) : false,
      dependsOn:
        "dependsOn" in definition && isPermissionCode(definition.dependsOn)
          ? definition.dependsOn
          : null,
    })),
    canManage: actor.permissions.has("auth.role.manage"),
    canManageSuperAdminPermissions: actor.roles.includes(AppRole.SUPER_ADMIN),
    canManageUsers: actor.permissions.has("auth.user.manage"),
    canChangeUserStatus,
    canDeleteUserAccounts,
  };
}
