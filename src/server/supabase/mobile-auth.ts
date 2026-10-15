import "server-only";

import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { getSupabaseAdminClient } from "@/server/supabase/admin";

const identitySchema = z.object({ sub: z.string().uuid(), session_id: z.string().uuid() });

export type MobileTokenIdentity = { authUserId: string; sessionId: string };
export type MobileAuthUser = {
  id: string;
  email: string | null;
  emailConfirmed: boolean;
  phone: string | null;
  phoneConfirmed: boolean;
  metadata: unknown;
  disabled: boolean;
  sessionActive: boolean;
};

// getClaims verifies the signature and expiry. Neither client IDs nor metadata
// are accepted as identity or ERP permissions.
export async function verifyMobileToken(token: string): Promise<MobileTokenIdentity | null> {
  const { data, error } = await getSupabaseAdminClient().auth.getClaims(token);
  if (error) return null;
  const parsed = identitySchema.safeParse(data?.claims);
  return parsed.success
    ? { authUserId: parsed.data.sub, sessionId: parsed.data.session_id }
    : null;
}

export async function loadMobileAuthUser(
  db: Pick<Prisma.TransactionClient, "$queryRaw">,
  identity: MobileTokenIdentity,
  lock = false,
): Promise<MobileAuthUser | null> {
  const [user] = await db.$queryRaw<MobileAuthUser[]>(Prisma.sql`
    select u.id::text, u.email,
      u.email_confirmed_at is not null as "emailConfirmed",
      u.phone, u.phone_confirmed_at is not null as "phoneConfirmed",
      u.raw_user_meta_data as metadata,
      coalesce(u.banned_until > now(), false) as disabled,
      exists(select 1 from auth.sessions s
        where s.id = ${identity.sessionId}::uuid and s.user_id = u.id
          and (s.not_after is null or s.not_after > now())) as "sessionActive"
    from auth.users u
    where u.id = ${identity.authUserId}::uuid and u.deleted_at is null
      and not coalesce(u.is_anonymous, false)
    ${lock ? Prisma.sql`for update of u` : Prisma.empty}
  `);
  return user ?? null;
}
