import "server-only";

import {
  OAuthError,
  OAuthErrorCode,
  type AuthInfo,
  type OAuthTokenVerifier,
} from "@modelcontextprotocol/server";
import { createClient } from "@supabase/supabase-js";
import { AppRole, Prisma } from "@/generated/prisma/client";
import { ERP_SESSION_MAX_AGE_SQL } from "@/server/auth/session-lifetime";
import { getPrisma } from "@/server/db/prisma";
import { getEnv, requireEnv } from "@/server/env";
import { hasMfaDelegation } from "./delegation";
import {
  getMcpOAuthClientIds,
  getMcpPublicUrl,
} from "@/server/mcp/config";

type Claims = Record<string, unknown>;

let publicSupabaseClient:
  | ReturnType<typeof createClient>
  | undefined;

function getPublicSupabaseClient() {
  publicSupabaseClient ??= createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  return publicSupabaseClient;
}

function stringClaim(claims: Claims, key: string) {
  const value = claims[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numericClaim(claims: Claims, key: string) {
  const value = claims[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function scopesFromClaims(claims: Claims) {
  const scope = claims.scope;
  if (typeof scope === "string") {
    return scope.split(/\s+/).filter(Boolean);
  }

  const scopes = claims.scopes;
  return Array.isArray(scopes)
    ? scopes.filter((value): value is string => typeof value === "string")
    : [];
}

function audienceMatches(claims: Claims, expected: string) {
  const audience = claims.aud;
  return audience === expected ||
    (Array.isArray(audience) && audience.includes(expected));
}

type RejectionReason =
  | "TOKEN_VERIFICATION_FAILED"
  | "TOKEN_CLAIMS_INVALID_OR_EXPIRED"
  | "CLIENT_NOT_APPROVED"
  | "AUDIENCE_MISMATCH"
  | "FOUNDER_NOT_ACTIVE"
  | "SESSION_ID_INVALID"
  | "MFA_REQUIRED"
  | "SESSION_EXPIRED_OR_REVOKED";

function invalidToken(reason: RejectionReason, message = "Access token is not valid for this ERP connector") {
  // Only call with static reason codes. Never log claims, tokens or provider errors.
  console.warn("[mcp] authentication rejected", { reason });
  return new OAuthError(OAuthErrorCode.InvalidToken, message);
}

export const founderTokenVerifier: OAuthTokenVerifier = {
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const { data, error } = await getPublicSupabaseClient().auth.getClaims(token);
    if (error || !data?.claims || typeof data.claims !== "object") {
      throw invalidToken("TOKEN_VERIFICATION_FAILED");
    }

    const claims = data.claims as Claims;
    const subject = stringClaim(claims, "sub");
    const clientId = stringClaim(claims, "client_id");
    const issuer = stringClaim(claims, "iss");
    const expiresAt = numericClaim(claims, "exp");
    const env = getEnv();
    const approvedClientIds = getMcpOAuthClientIds();
    const expectedIssuer = new URL(
      "/auth/v1",
      requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    ).toString().replace(/\/$/, "");

    if (
      !subject ||
      !clientId ||
      !expiresAt ||
      expiresAt <= Math.floor(Date.now() / 1000) ||
      issuer?.replace(/\/$/, "") !== expectedIssuer
    ) {
      throw invalidToken("TOKEN_CLAIMS_INVALID_OR_EXPIRED");
    }

    if (!approvedClientIds.has(clientId)) {
      throw invalidToken("CLIENT_NOT_APPROVED");
    }

    if (
      env.MCP_EXPECTED_AUDIENCE &&
      !audienceMatches(claims, env.MCP_EXPECTED_AUDIENCE)
    ) {
      throw invalidToken("AUDIENCE_MISMATCH");
    }

    const founder = await getPrisma().user.findFirst({
      where: {
        authUserId: subject,
        isActive: true,
        roles: { some: { role: { code: AppRole.SUPER_ADMIN } } },
      },
      select: { id: true, fullName: true, email: true },
    });

    if (!founder) {
      throw invalidToken("FOUNDER_NOT_ACTIVE", "This account is not an active ERP Founder account");
    }

    const sessionId = stringClaim(claims, "session_id");
    if (!sessionId || !/^[0-9a-f-]{36}$/i.test(sessionId)) {
      throw invalidToken("SESSION_ID_INVALID", "Reconnect after completing two-factor authentication");
    }
    if (claims.aal !== "aal2" &&
        !(claims.aal === "aal1" && await hasMfaDelegation(founder.id, subject, clientId, sessionId))) {
      throw invalidToken("MFA_REQUIRED", "Reconnect after completing two-factor authentication");
    }
    const [session] = await getPrisma().$queryRaw<Array<{ valid: boolean }>>(Prisma.sql`
      select exists (
        select 1 from auth.sessions s
        where s.id = ${sessionId}::uuid and s.user_id = ${subject}::uuid
          and (s.not_after is null or s.not_after > now())
          and s.created_at > now() - ${ERP_SESSION_MAX_AGE_SQL}
          and not exists (select 1 from erp.auth_session_records r where r.id = s.id and r.revoked_at is not null)
      ) as valid
    `);
    if (!session?.valid) throw invalidToken("SESSION_EXPIRED_OR_REVOKED", "ERP connector session has expired or was revoked");

    return {
      token,
      clientId,
      scopes: scopesFromClaims(claims),
      expiresAt,
      resource: getMcpPublicUrl(),
      extra: {
        erpUserId: founder.id,
        erpUserName: founder.fullName,
        erpUserEmail: founder.email,
        erpRole: AppRole.SUPER_ADMIN,
      },
    };
  },
};
