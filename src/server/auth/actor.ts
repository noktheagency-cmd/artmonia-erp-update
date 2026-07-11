import { cache } from "react";
import { AppRole, Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/server/db/prisma";
import { getCurrentErpUser } from "@/server/auth/session";
import {
  assertPermission,
  loadPermissionsForUser,
  type EffectivePermissions,
  type PermissionCode,
} from "@/server/rbac/permissions";

export type ErpActor = {
  id: string;
  authUserId: string | null;
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
  let currentUser = null;

  try {
    currentUser = await getCurrentErpUser();
  } catch (error) {
    if (process.env.NODE_ENV === "production") {
      throw error;
    }
  }

  if (currentUser) {
    const actor = {
      id: currentUser.id,
      authUserId: currentUser.authUserId,
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

  if (process.env.NODE_ENV === "production") {
    throw new Error("Unauthorized");
  }

  const actor = await getDevelopmentActor();

  if (permission) {
    assertPermission(actor.permissions, permission);
  }

  return actor;
}

const getDevelopmentActor = cache(async (): Promise<ErpActor> => {
  const devActorEmail = process.env.ERP_DEV_ACTOR_EMAIL?.trim();
  const actorWhere = devActorEmail
    ? Prisma.sql`u.email = ${devActorEmail}`
    : Prisma.sql`exists (
        select 1
        from erp.user_roles owner_ur
        join erp.roles owner_role on owner_role.id = owner_ur.role_id
        where owner_ur.user_id = u.id
          and owner_role.code::text in ('OWNER', 'SUPER_ADMIN')
      )`;
  const [demoActor] = await getPrisma().$queryRaw<DevActorRow[]>(Prisma.sql`
    select
      u.id::text as "id",
      u.auth_user_id::text as "authUserId",
      u.full_name as "fullName",
      u.email,
      he.profile_photo_url as "profilePhotoUrl",
      coalesce(array_agg(r.code::text) filter (where r.code is not null), array[]::text[]) as "roles"
    from erp.users u
    left join erp.hr_employees he on he.user_id = u.id
    left join erp.user_roles ur on ur.user_id = u.id
    left join erp.roles r on r.id = ur.role_id
    where u.is_active = true
      and ${actorWhere}
    group by u.id, he.profile_photo_url
    order by u.created_at asc
    limit 1
  `);

  if (!demoActor) {
    throw new Error("Unauthorized");
  }

  const roles = normalizeRoles(demoActor.roles);
  return {
    id: demoActor.id,
    authUserId: demoActor.authUserId,
    fullName: demoActor.fullName,
    email: demoActor.email,
    profilePhotoUrl: demoActor.profilePhotoUrl,
    roles,
    permissions: await loadPermissionsForUser(demoActor.id, roles),
  };
});

type DevActorRow = Omit<ErpActor, "permissions" | "roles"> & {
  roles: unknown;
};

function normalizeRoles(value: unknown): AppRole[] {
  return Array.isArray(value)
    ? value.filter((role): role is AppRole =>
        (Object.values(AppRole) as string[]).includes(String(role))
      )
    : [];
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
