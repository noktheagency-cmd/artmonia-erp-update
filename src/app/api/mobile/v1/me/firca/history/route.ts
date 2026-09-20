import { z } from "zod";
import { studentRequest } from "@/modules/firca/api";
import { getFircaHistory } from "@/modules/firca/service";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return studentRequest(request, (identity) =>
    getFircaHistory(
      identity.studentId,
      z
        .string()
        .uuid()
        .optional()
        .parse(new URL(request.url).searchParams.get("cursor") ?? undefined),
    ),
  );
}
