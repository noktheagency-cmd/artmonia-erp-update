import { AppRole } from "@/generated/prisma/client";
import { getCurrentErpUser } from "@/server/auth/session";
import {
  assertPermission,
  type EffectivePermissions,
  type PermissionCode,
} from "@/server/rbac/permissions";

export type ErpActor = {
  id: string;
  authUserId: string | null;
  currentSessionId: string | null;
  fullName: string;
  email: string;
  profilePhotoUrl: string | null;
  roles: AppRole[];
  permissions: EffectivePermissions;
};

export type MutationActor = ErpActor;

export async function requireErpActor(
  permission?: PermissionCode
): Promise<ErpActor> {
  const currentUser = await getCurrentErpUser();

  if (currentUser) {
    const actor = {
      id: currentUser.id,
      authUserId: currentUser.authUserId,
      currentSessionId: currentUser.currentSessionId,
      fullName: currentUser.fullName,
      email: currentUser.email,
      profilePhotoUrl: currentUser.profilePhotoUrl,
      roles: currentUser.roles,
      permissions: currentUser.permissions,
    };

    if (permission) {
      assertPermission(actor.permissions, permission);
    }

    return actor;
  }

  throw new Error("Unauthorized");
}

export async function requireMutationActor(
  permission?: PermissionCode
): Promise<MutationActor> {
  return requireErpActor(permission);
}

export function hasAnyRole(actor: Pick<ErpActor, "roles">, roles: AppRole[]) {
  return actor.roles.some((role) => roles.includes(role));
}

export function isPrivilegedActor(actor: Pick<ErpActor, "roles">) {
  return hasAnyRole(actor, [AppRole.SUPER_ADMIN, AppRole.OWNER, AppRole.ADMIN]);
}
