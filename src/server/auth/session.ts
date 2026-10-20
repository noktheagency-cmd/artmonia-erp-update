import { cache } from "react";
import { redirect } from "next/navigation";
import { needsMfa } from "@/server/auth/mfa-policy";
import { safeRedirectPath } from "@/server/auth/redirect-path";
import type { Route } from "next";
import { ERP_SESSION_MAX_AGE_SQL } from "@/server/auth/session-lifetime";
import { cookies, headers } from "next/headers";
import { AppRole, Prisma } from "@/generated/prisma/client";
import { syncVerifiedAuthSession } from "@/modules/audit/session-registry";
import { getPrisma } from "@/server/db/prisma";
import {
  loadPermissionsForUser,
  type EffectivePermissions,
} from "@/server/rbac/permissions";
import { getEnv, hasSupabasePublicEnv } from "@/server/env";
import { hasSupabaseAuthCookie } from "@/server/supabase/auth-cookies";
import { createSupabaseServerClient } from "@/server/supabase/server";

export type CurrentErpUser = {
  id: string;
  authUserId: string | null;
  currentSessionId: string;
  fullName: string;
  email: string;
  profilePhotoUrl: string | null;
  roles: AppRole[];
  permissions: EffectivePermissions;
};

// Only the MFA setup/challenge page may use this password-authenticated identity.
export const getErpSessionForMfa = cache(async (): Promise<(CurrentErpUser & {
  assuranceLevel: string;
  hasVerifiedFactor: boolean;
  sessionCreatedAt: string;
}) | null> => {
  if (!hasSupabasePublicEnv()) {
    return null;
  }

  const env = getEnv();
  const cookieStore = await cookies();

  if (
    !hasSupabaseAuthCookie(
      cookieStore.getAll(),
      env.NEXT_PUBLIC_SUPABASE_URL
    )
  ) {
    return null;
  }

  const supabase = await createSupabaseServerClient(cookieStore);
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims?.sub) {
    return null;
  }

  const sessionId = data.claims.session_id;
  if (!sessionId) {
    return null;
  }

  const [user] = await getPrisma().$queryRaw<CurrentErpUserRow[]>(Prisma.sql`
    select
      u.id::text as "id",
      u.auth_user_id::text as "authUserId",
      u.full_name as "fullName",
      u.email,
      coalesce(u.profile_photo_url, he.profile_photo_url) as "profilePhotoUrl",
      coalesce(array_agg(r.code::text) filter (where r.code is not null), array[]::text[]) as "roles",
      exists (
        select 1
        from auth.sessions auth_session
        where auth_session.id = ${sessionId}::uuid
          and auth_session.user_id = u.auth_user_id
          and (auth_session.not_after is null or auth_session.not_after > now())
          and auth_session.created_at > now() - ${ERP_SESSION_MAX_AGE_SQL}
      ) as "authSessionExists",
      (
        select auth_session.created_at
        from auth.sessions auth_session
        where auth_session.id = ${sessionId}::uuid
          and auth_session.user_id = u.auth_user_id
        limit 1
      ) as "sessionCreatedAt",
      exists (select 1 from auth.mfa_factors f where f.user_id = u.auth_user_id and f.status = 'verified') as "hasVerifiedFactor"
    from erp.users u
    left join erp.hr_employees he on he.user_id = u.id
    left join erp.user_roles ur on ur.user_id = u.id
    left join erp.roles r on r.id = ur.role_id
    where u.auth_user_id = ${data.claims.sub}::uuid
      and u.is_active = true
    group by u.id, u.profile_photo_url, he.profile_photo_url
    limit 1
  `);

  if (!user?.authSessionExists) {
    await supabase.auth.signOut({ scope: "local" });
    return null;
  }

  const syncResult = await syncVerifiedAuthSession({
    db: getPrisma(),
    sessionId,
    userId: user.id,
    issuedAt: data.claims.iat,
    headers: await headers(),
  });

  if (syncResult.revoked) {
    await supabase.auth.signOut({ scope: "local" });
    return null;
  }

  const roles = normalizeRoles(user.roles);

  if (!user.sessionCreatedAt) {
    await supabase.auth.signOut({ scope: "local" });
    return null;
  }

  return {
    assuranceLevel: String(data.claims.aal ?? "aal1"),
    hasVerifiedFactor: user.hasVerifiedFactor,
    sessionCreatedAt: new Date(user.sessionCreatedAt).toISOString(),
    id: user.id,
    authUserId: user.authUserId,
    currentSessionId: sessionId,
    fullName: user.fullName,
    email: user.email,
    profilePhotoUrl: user.profilePhotoUrl,
    roles,
    permissions: await loadPermissionsForUser(user.id, roles),
  };
});

export const getCurrentErpUser = cache(async (returnTo?: string): Promise<CurrentErpUser | null> => {
  const user = await getErpSessionForMfa();
  if (user && needsMfa(user.roles, user.hasVerifiedFactor, user.assuranceLevel)) {
    redirect((returnTo ? `/auth/mfa?next=${encodeURIComponent(safeRedirectPath(returnTo))}` : "/auth/mfa") as Route);
  }
  return user;
});

type CurrentErpUserRow = Omit<CurrentErpUser, "permissions" | "roles" | "currentSessionId"> & {
  roles: unknown;
  authSessionExists: boolean;
  hasVerifiedFactor: boolean;
  sessionCreatedAt: Date | string | null;
};

function normalizeRoles(value: unknown): AppRole[] {
  return Array.isArray(value)
    ? value.filter((role): role is AppRole =>
        (Object.values(AppRole) as string[]).includes(String(role))
      )
    : [];
}
