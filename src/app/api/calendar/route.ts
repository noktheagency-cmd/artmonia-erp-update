import { NextResponse } from "next/server";
import { z } from "zod";
import { getErpCalendarData } from "@/modules/calendar/queries";
import { requireErpActor } from "@/server/auth/actor";
import { toActionFailure } from "@/server/actions/safe-action";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const { month } = querySchema.parse({ month: url.searchParams.get("month") });
    const actor = await requireErpActor();
    const result = await getErpCalendarData(actor, month);

    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { events: [], counts: {}, error: "Calendar ayı düzgün deyil." },
        { status: 400, headers: { "Cache-Control": "private, no-store" } },
      );
    }

    const failure = toActionFailure(error, "Calendar məlumatları yüklənmədi.");
    const status = failure.code === "UNAUTHORIZED" ? 401 : failure.code === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json(
      { events: [], counts: {}, error: failure.message, code: failure.code },
      { status, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
