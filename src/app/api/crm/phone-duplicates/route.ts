import { NextResponse } from "next/server";
import { z } from "zod";
import { findDuplicatePhoneMatches } from "@/modules/crm/duplicate-phone";
import { requireErpActor } from "@/server/auth/actor";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  phone: z.string().max(40).default(""),
});

export async function GET(request: Request) {
  try {
    await requireErpActor("crm.lead.read");

    const url = new URL(request.url);
    const input = querySchema.parse({
      phone: url.searchParams.get("phone") ?? "",
    });
    const matches = await findDuplicatePhoneMatches(input.phone);

    return NextResponse.json({ matches });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ matches: [] }, { status: 400 });
    }

    return NextResponse.json({ matches: [] }, { status: 401 });
  }
}
