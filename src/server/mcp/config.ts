import "server-only";

import { getEnv, requireEnv } from "@/server/env";

function csv(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function hostname(value: string | undefined) {
  if (!value) return null;

  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

export function getMcpPublicUrl() {
  const configured = getEnv().MCP_PUBLIC_URL;

  if (configured) {
    const url = new URL(configured);
    url.pathname = "/mcp";
    url.search = "";
    url.hash = "";
    return url;
  }

  if (process.env.NODE_ENV !== "production") {
    return new URL("http://localhost:3000/mcp");
  }

  throw new Error("Missing required environment variable: MCP_PUBLIC_URL");
}

export function getMcpOAuthClientIds() {
  const env = getEnv();
  const clientIds = csv(env.MCP_OAUTH_CLIENT_IDS ?? env.MCP_OAUTH_CLIENT_ID);

  if (clientIds.length === 0) {
    throw new Error(
      "Missing required environment variable: MCP_OAUTH_CLIENT_IDS or MCP_OAUTH_CLIENT_ID",
    );
  }

  return new Set(clientIds);
}

export function isApprovedMcpOAuthClient(clientId: string) {
  return getMcpOAuthClientIds().has(clientId);
}

export function getMcpNetworkPolicy() {
  const env = getEnv();
  const allowedHosts = new Set([
    hostname(env.MCP_PUBLIC_URL),
    hostname(env.NEXT_PUBLIC_APP_URL),
    process.env.RAILWAY_PUBLIC_DOMAIN,
    ...csv(env.MCP_ALLOWED_HOSTS),
  ]);
  const allowedOrigins = new Set([
    hostname(env.MCP_PUBLIC_URL),
    hostname(env.NEXT_PUBLIC_APP_URL),
    ...csv(env.MCP_ALLOWED_ORIGINS).map(hostname),
  ]);

  if (process.env.NODE_ENV !== "production") {
    allowedHosts.add("localhost");
    allowedHosts.add("127.0.0.1");
    allowedOrigins.add("localhost");
    allowedOrigins.add("127.0.0.1");
  }

  return {
    allowedHosts: [...allowedHosts].filter((value): value is string => Boolean(value)),
    allowedOrigins: [...allowedOrigins].filter(
      (value): value is string => Boolean(value),
    ),
  };
}

export function getSupabaseAuthorizationServerUrl() {
  return new URL("/auth/v1", requireEnv("NEXT_PUBLIC_SUPABASE_URL"));
}

export function getProtectedResourceMetadataUrl() {
  return new URL("/.well-known/oauth-protected-resource/mcp", getMcpPublicUrl());
}
