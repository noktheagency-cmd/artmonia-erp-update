import { timingSafeEqual } from "node:crypto";
import { syncInstagramDmHistory } from "@/modules/instagram-dm/meta-sync";
import { getPrisma } from "@/server/db/prisma";
import { requireEnv } from "@/server/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!hasValidCronSecret(request.headers.get("authorization"))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const prisma = getPrisma();
  const run = await prisma.jobRun.create({
    data: { jobName: "instagram-dm-history-sync", status: "RUNNING" },
    select: { id: true },
  });

  try {
    const result = await syncInstagramDmHistory();
    await prisma.jobRun.update({
      where: { id: run.id },
      data: {
        status: "COMPLETED",
        finishedAt: new Date(),
        affectedRows: result.insertedMessages,
      },
    });
    return Response.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    await prisma.jobRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        errorMessage: error instanceof Error ? error.message.slice(0, 800) : "Unknown error",
      },
    });
    return Response.json(
      { error: "Instagram DM tarixçəsi sinxronlaşdırılmadı." },
      { status: 502, headers: { "Cache-Control": "private, no-store" } },
    );
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
