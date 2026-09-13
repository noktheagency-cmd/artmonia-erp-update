import { headers } from "next/headers";
import { Prisma } from "@/generated/prisma/client";
import { metadataToRecord } from "@/modules/audit/session-registry";
import { readSessionRequestMetadata } from "@/modules/audit/session-device";
import { getCurrentErpUser } from "@/server/auth/session";
import { ERP_SESSION_MAX_AGE_SQL } from "@/server/auth/session-lifetime";
import { getPrisma } from "@/server/db/prisma";
import { createSupabaseServerClient } from "@/server/supabase/server";

export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const sessionId = data?.claims?.session_id;
  const authUserId = data?.claims?.sub;

  if (error || !sessionId || !authUserId) {
    return endSession(supabase);
  }

  const [record] = await getPrisma().$queryRaw<HeartbeatRow[]>(Prisma.sql`
    select
      sr.revoked_at as "revokedAt",
      sr.last_seen_at as "lastSeenAt",
      u.auth_user_id::text as "authUserId",
      exists(select 1 from auth.sessions s where s.id = sr.id and s.user_id = u.auth_user_id and (s.not_after is null or s.not_after > now()) and s.created_at > now() - ${ERP_SESSION_MAX_AGE_SQL} and u.is_active) as "authSessionExists"
    from erp.auth_session_records sr
    join erp.users u on u.id = sr.user_id
    where sr.id = ${sessionId}::uuid
    limit 1
  `);

  if (!record) {
    const user = await getCurrentErpUser();
    return user ? new Response(null, { status: 204 }) : endSession(supabase);
  }

  if (record.revokedAt || !record.authSessionExists || record.authUserId !== authUserId) {
    return endSession(supabase);
  }

  if (Date.now() - record.lastSeenAt.getTime() >= 120_000) {
    const metadata = readSessionRequestMetadata(await headers());
    await getPrisma().authSessionRecord.update({
      where: { id: sessionId },
      data: { ...metadataToRecord(metadata), lastSeenAt: new Date() },
    });
  }

  return new Response(null, { status: 204 });
}

type HeartbeatRow = {
  revokedAt: Date | null;
  lastSeenAt: Date;
  authUserId: string | null;
  authSessionExists: boolean;
};

async function endSession(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
) {
  await supabase.auth.signOut({ scope: "local" });
  return Response.json({ error: "SESSION_ENDED" }, { status: 401 });
}
