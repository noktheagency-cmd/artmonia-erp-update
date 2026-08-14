import { NextResponse } from "next/server";
import { z } from "zod";
import { searchGlobal } from "@/modules/search/global-search";
import { toActionFailure } from "@/server/actions/safe-action";
import { requireErpActor } from "@/server/auth/actor";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  q: z.string().trim().max(80).default(""),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const input = querySchema.parse({ q: url.searchParams.get("q") ?? "" });
    const actor = await requireErpActor();
    const result = await searchGlobal(actor, input.q);

    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { items: [], query: "", error: "Axtarış sorğusu düzgün deyil." },
        { status: 400, headers: { "Cache-Control": "private, no-store" } },
      );
    }

    const failure = toActionFailure(error, "Axtarış hazırda tamamlana bilmədi.");
    const status = failure.code === "UNAUTHORIZED" ? 401 : failure.code === "FORBIDDEN" ? 403 : 500;

    return NextResponse.json(
      { items: [], query: "", error: failure.message, code: failure.code },
      { status, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
