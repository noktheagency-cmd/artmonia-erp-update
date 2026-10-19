import { getPrisma } from "@/server/db/prisma";
import { hasDatabaseEnv } from "@/server/env";

export const dynamic = "force-dynamic";

export async function GET() {
  let database: "ok" | "skipped" | "error" = "skipped";
  let databaseError: string | undefined;

  if (hasDatabaseEnv()) {
    try {
      await getPrisma().$queryRaw`select 1`;
      database = "ok";
    } catch (error) {
      database = "error";
      databaseError = error instanceof Error ? error.message : String(error);
    }
  }

  const ok = database !== "error";
  return Response.json(
    {
      status: ok ? "ok" : "degraded",
      service: "artmonia-erp",
      database,
      ...(databaseError ? { databaseError } : {}),
    },
    {
      status: ok ? 200 : 503,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
