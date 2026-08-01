import "server-only";

import {
  OAuthError,
  OAuthErrorCode,
  type AuthInfo,
  type OAuthTokenVerifier,
} from "@modelcontextprotocol/server";
import { createClient } from "@supabase/supabase-js";
import { AppRole } from "@/generated/prisma/client";
import { getPrisma } from "@/server/db/prisma";
import { getEnv, requireEnv } from "@/server/env";
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

function invalidToken(message = "Access token is not valid for this ERP connector") {
  return new OAuthError(OAuthErrorCode.InvalidToken, message);
}

export const founderTokenVerifier: OAuthTokenVerifier = {
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const { data, error } = await getPublicSupabaseClient().auth.getClaims(token);
    if (error || !data?.claims || typeof data.claims !== "object") {
      throw invalidToken();
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
      throw invalidToken();
    }

    if (!approvedClientIds.has(clientId)) {
      throw invalidToken();
    }

    if (
      env.MCP_EXPECTED_AUDIENCE &&
      !audienceMatches(claims, env.MCP_EXPECTED_AUDIENCE)
    ) {
      throw invalidToken();
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
      throw invalidToken("This account is not an active ERP Founder account");
    }

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
