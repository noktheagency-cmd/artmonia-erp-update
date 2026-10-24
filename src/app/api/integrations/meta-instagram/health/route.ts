import { createHmac, timingSafeEqual } from "node:crypto";
import { getEnv } from "@/server/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };

function authorized(value: string | null, secret: string | undefined) {
  if (!value || !secret) return false;
  const actual = Buffer.from(value);
  const expected = Buffer.from(`Bearer ${secret}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

type GraphReply = { id?: string; username?: string; data?: unknown[]; error?: { code?: number; error_subcode?: number; type?: string } };

export async function GET(request: Request) {
  const env = getEnv();
  if (!authorized(request.headers.get("authorization"), env.CRON_SECRET)) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  }
  const accountId = env.META_INSTAGRAM_ACCOUNT_ID;
  const token = env.META_INSTAGRAM_ACCESS_TOKEN;
  const appSecret = env.META_APP_SECRET;
  const verifyToken = env.META_INSTAGRAM_WEBHOOK_VERIFY_TOKEN;
  const missing = [
    !accountId && "META_INSTAGRAM_ACCOUNT_ID",
    !token && "META_INSTAGRAM_ACCESS_TOKEN",
    !appSecret && "META_APP_SECRET",
    !verifyToken && "META_INSTAGRAM_WEBHOOK_VERIFY_TOKEN",
  ].filter(Boolean);
  if (missing.length) {
    return Response.json({ connected: false, stage: "configuration", missing }, { status: 503, headers });
  }

  async function probe(path: string, params: Record<string, string> = {}) {
    const url = new URL(`https://graph.instagram.com/${env.META_GRAPH_API_VERSION}/${path}`);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    url.searchParams.set("appsecret_proof", createHmac("sha256", appSecret!).update(token!).digest("hex"));
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        cache: "no-store", signal: AbortSignal.timeout(12000),
      });
      const body = (await response.json().catch(() => ({}))) as GraphReply;
      return { ok: response.ok && !body.error, httpStatus: response.status, errorCode: body.error?.code ?? null,
        errorSubcode: body.error?.error_subcode ?? null, body };
    } catch {
      return { ok: false, httpStatus: null, errorCode: "NETWORK_OR_TIMEOUT", errorSubcode: null, body: {} as GraphReply };
    }
  }

  const profile = await probe(accountId!, { fields: "id,username" });
  if (!profile.ok) {
    return Response.json({ connected: false, stage: "profile", httpStatus: profile.httpStatus,
      errorCode: profile.errorCode, errorSubcode: profile.errorSubcode }, { status: 502, headers });
  }
  const conversations = await probe(`${accountId}/conversations`, { platform: "instagram", fields: "id", limit: "1" });
  return Response.json({ connected: conversations.ok, stage: conversations.ok ? "verified" : "conversations",
    accountIdMatches: profile.body.id === accountId,
    username: profile.body.username ?? null,
    messagingPermissionVerified: conversations.ok,
    httpStatus: conversations.httpStatus,
    errorCode: conversations.errorCode,
    errorSubcode: conversations.errorSubcode,
    webhookConfigured: Boolean(verifyToken && appSecret),
    webhookDeliveryVerified: false,
  }, { status: conversations.ok ? 200 : 502, headers });
}
