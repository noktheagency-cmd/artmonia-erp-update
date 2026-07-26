import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { syncMetaMarketing } from "@/modules/marketing/meta-ads";
import { getEnv, requireEnv } from "@/server/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!hasValidCronSecret(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const env = getEnv();
    const until = new Date(Date.now() + 4 * 60 * 60 * 1000);
    const since = new Date(until);
    since.setUTCDate(since.getUTCDate() - env.META_SYNC_LOOKBACK_DAYS);
    const result = await syncMetaMarketing({ since, until });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Meta sync uğursuz oldu.";
    console.error("Meta Ads scheduled sync failed", { message });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

function hasValidCronSecret(authorization: string | null) {
  let expected: string;
  try {
    expected = `Bearer ${requireEnv("CRON_SECRET")}`;
  } catch {
    return false;
  }
  if (!authorization) return false;
  const actualBuffer = Buffer.from(authorization);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}
