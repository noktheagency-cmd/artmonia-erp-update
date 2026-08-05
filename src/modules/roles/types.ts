import type { AppRole } from "@/generated/prisma/client";
import type {
  PermissionAction,
  PermissionCode,
  PermissionScope,
} from "@/server/rbac/permissions";

export type RoleGrantDto = {
  code: PermissionCode;
  scope: PermissionScope;
};

export type RoleSummaryDto = {
  id: string;
  code: AppRole | null;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  userCount: number;
  updatedAt: string;
  grants: RoleGrantDto[];
};

export type RoleUserDto = {
  id: string;
  employeeId: string | null;
  kind: "EMPLOYEE" | "PROFILE";
  fullName: string;
  email: string;
  department: string;
  position: string;
  isActive: boolean;
  hasLogin: boolean;
  isProtected: boolean;
  roleIds: string[];
};

export type AuditLogDto = {
  id: string;
  actorName: string;
  actorEmail: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  reason: string | null;
  before: unknown;
  after: unknown;
  ipAddress: string | null;
  createdAt: string;
};

export type PermissionDefinitionDto = {
  code: PermissionCode;
  module: string;
  moduleLabel: string;
  tab: string;
  tabLabel: string;
  action: PermissionAction;
  actionLabel: string;
  description: string;
  sensitive: boolean;
  supportsScope: boolean;
  dependsOn: PermissionCode | null;
};

export type RolePermissionMatrix = {
  roles: RoleSummaryDto[];
  users: RoleUserDto[];
  definitions: PermissionDefinitionDto[];
  auditLogs: AuditLogDto[];
  canManage: boolean;
  canManageUsers: boolean;
  canViewAudit: boolean;
};

export type UpdateRolePermissionsResult =
  | { ok: true; updatedAt: string; grantCount: number }
  | { ok: false; code: "VALIDATION" | "FORBIDDEN" | "CONFLICT" | "NOT_FOUND" | "UNKNOWN"; message: string };

export type CreateRoleResult =
  | { ok: true; role: RoleSummaryDto }
  | { ok: false; code: "VALIDATION" | "FORBIDDEN" | "NOT_FOUND" | "UNKNOWN"; message: string };

export type DeleteRoleResult =
  | {
      ok: true;
      roleId: string;
      deletedUserIds: string[];
      deletedUserCount: number;
      deletedEmployeeCount: number;
      authCleanupFailed: number;
      roleUserCounts: Record<string, number>;
    }
  | { ok: false; code: "VALIDATION" | "FORBIDDEN" | "NOT_FOUND" | "UNKNOWN"; message: string };
