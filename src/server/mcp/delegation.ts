import "server-only";

import { Prisma, AppRole } from "@/generated/prisma/client";
import { getPrisma } from "@/server/db/prisma";
import { ERP_SESSION_MAX_AGE_SQL } from "@/server/auth/session-lifetime";
import type { CurrentErpUser } from "@/server/auth/session";
import { isApprovedMcpOAuthClient } from "./config";
import { permitsMfaDelegation } from "./delegation-policy";

// Append-only security decision, not a rewrite of audit history. The indexed
// actor/client pair identifies the latest delegation; a new approval supersedes it.
export async function recordMfaDelegation(authorizationId: string, actor: CurrentErpUser) {
  if (!actor.authUserId || !actor.roles.includes(AppRole.SUPER_ADMIN)) {
    throw new Error("MCP delegation requires an active Founder");
  }
  const db = getPrisma();
  const [authorization] = await db.$queryRaw<Array<{ clientId: string }>>(Prisma.sql`
    select a.client_id::text as "clientId"
    from auth.oauth_authorizations a
    join auth.sessions s on s.id = ${actor.currentSessionId}::uuid
    where a.authorization_id = ${authorizationId}
      and a.user_id = ${actor.authUserId}::uuid and a.status = 'approved'
      and a.expires_at > now()
      and s.user_id = a.user_id and s.aal = 'aal2'
      and s.oauth_client_id is null
      and (s.not_after is null or s.not_after > now())
      and s.created_at > now() - ${ERP_SESSION_MAX_AGE_SQL}
      and not exists (select 1 from erp.auth_session_records r where r.id = s.id and r.revoked_at is not null)
    limit 1
  `);
  if (!authorization || !isApprovedMcpOAuthClient(authorization.clientId)) {
    throw new Error("MCP delegation could not be verified");
  }
  await db.auditLog.create({ data: {
    actorUserId: actor.id,
    action: "MCP_OAUTH_APPROVED",
    entityType: "MCP_OAUTH_CLIENT",
    entityId: authorization.clientId,
    afterJson: { version: 1, sourceSessionId: actor.currentSessionId },
  } });
}

export async function hasMfaDelegation(actorId: string, subject: string, clientId: string, sessionId: string) {
  const db = getPrisma();
  const grant = await db.auditLog.findFirst({
    where: { actorUserId: actorId, action: "MCP_OAUTH_APPROVED", entityType: "MCP_OAUTH_CLIENT", entityId: clientId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { afterJson: true, createdAt: true },
  });
  const payload = grant?.afterJson;
  if (!grant || !payload || typeof payload !== "object" || Array.isArray(payload) ||
      payload.version !== 1 || typeof payload.sourceSessionId !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(payload.sourceSessionId)) return false;

  const [evidence] = await db.$queryRaw<Array<{
    sourceValid: boolean; sourceAal: string | null; sourceUserId: string;
    oauthUserId: string; oauthClientId: string | null; oauthCreatedAt: Date;
  }>>(Prisma.sql`
    select s.aal::text as "sourceAal", s.user_id::text as "sourceUserId",
      o.user_id::text as "oauthUserId", o.oauth_client_id::text as "oauthClientId",
      o.created_at as "oauthCreatedAt",
      ((s.not_after is null or s.not_after > now())
        and s.created_at > now() - ${ERP_SESSION_MAX_AGE_SQL}
        and s.oauth_client_id is null
        and exists (select 1 from auth.mfa_factors f where f.user_id = s.user_id and f.status = 'verified')
        and not exists (select 1 from erp.auth_session_records r where r.id = s.id and r.revoked_at is not null)) as "sourceValid"
    from auth.sessions s join auth.sessions o on o.id = ${sessionId}::uuid
    where s.id = ${payload.sourceSessionId}::uuid and o.user_id = ${subject}::uuid
    limit 1
  `);
  return !!evidence && permitsMfaDelegation({ ...evidence, approvedClientId: clientId, approvedAt: grant.createdAt });
}
