import { timingSafeEqual } from "node:crypto";
import { finalizeDueAttendanceSessions } from "@/modules/attendance/attendance-finalizer";
import { getPrisma } from "@/server/db/prisma";
import { requireEnv } from "@/server/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!hasValidCronSecret(request.headers.get("authorization"))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const run = await getPrisma().jobRun.create({
    data: { jobName: "attendance-finalize", status: "RUNNING" },
    select: { id: true },
  });
  try {
    const result = await finalizeDueAttendanceSessions();
    await getPrisma().jobRun.update({
      where: { id: run.id },
      data: {
        status: "COMPLETED",
        finishedAt: new Date(),
        affectedRows: result.createdAbsences,
      },
    });
    return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    await getPrisma().jobRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        errorMessage: error instanceof Error ? error.message.slice(0, 800) : "Unknown error",
      },
    });
    return Response.json({ error: "Davamiyyət yekunlaşdırıla bilmədi." }, { status: 500 });
  }
}

function hasValidCronSecret(authorization: string | null) {
  let expected: string;
  try {
    expected = `Bearer ${requireEnv("ATTENDANCE_CRON_SECRET")}`;
  } catch {
    return false;
  }
  if (!authorization) return false;
  const actualBuffer = Buffer.from(authorization);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}
