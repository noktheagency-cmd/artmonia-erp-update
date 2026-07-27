import { NextResponse } from "next/server";
import { z } from "zod";
import { getMarketingCampaignAds } from "@/modules/marketing/queries";
import { toActionFailure } from "@/server/actions/safe-action";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const paramsSchema = z.object({ campaignId: z.string().uuid() });
const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function GET(
  request: Request,
  context: { params: Promise<{ campaignId: string }> },
) {
  try {
    const { campaignId } = paramsSchema.parse(await context.params);
    const url = new URL(request.url);
    const filters = querySchema.parse({
      from: url.searchParams.get("from") || undefined,
      to: url.searchParams.get("to") || undefined,
    });
    const result = await getMarketingCampaignAds(campaignId, filters);
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Sorğu parametrləri düzgün deyil." }, { status: 400 });
    }
    const failure = toActionFailure(error, "Reklam məlumatları yüklənmədi.");
    const status =
      failure.code === "UNAUTHORIZED"
        ? 401
        : failure.code === "FORBIDDEN"
          ? 403
          : 500;
    return NextResponse.json(
      { error: failure.message, code: failure.code, errorId: failure.errorId },
      { status, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
