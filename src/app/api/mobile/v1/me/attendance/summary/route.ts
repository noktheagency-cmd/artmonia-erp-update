import { z } from "zod";
import {
  authenticateMobileStudentRequest,
  mobileError,
  mobileInternalError,
  mobileJson,
} from "@/modules/mobile/mobile-api";
import { mobileAttendanceSummaryQuerySchema } from "@/modules/mobile/mobile-portal-contract";
import {
  getMobileAttendanceSummary,
  MobilePortalError,
} from "@/modules/mobile/mobile-portal-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await authenticateMobileStudentRequest(request);
  if (!auth.ok) return auth.response;
  const requestId = auth.context.requestId;
  try {
    const query = mobileAttendanceSummaryQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    return mobileJson(
      await getMobileAttendanceSummary(auth.context.identity, query),
      200,
      requestId,
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return mobileError("INVALID_REQUEST", "Tarix filtrləri düzgün deyil.", 400, requestId);
    }
    if (error instanceof MobilePortalError) {
      return mobileError(error.code, error.message, error.status, requestId);
    }
    return mobileInternalError(error, requestId);
  }
}
