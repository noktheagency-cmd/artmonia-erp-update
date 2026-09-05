import { hasValidMobileAttendanceAuthorization } from "@/modules/attendance/mobile-attendance-auth";
import { getMobileRequestId, mobileError, mobileJson, mobileInternalError } from "@/modules/mobile/mobile-api";
import { PublicActionError } from "@/server/actions/public-action-error";
import { z } from "zod";

export async function workerRequest(request: Request, operation: (raw: unknown) => Promise<object>) {
  const requestId = getMobileRequestId(request);
  if (!hasValidMobileAttendanceAuthorization(request.headers.get("authorization")))
    return mobileError("UNAUTHORIZED", "Server autentifikasiyası tələb olunur.", 401, requestId);
  try {
    // Queue access is server-only; never expose these routes via the student gateway.
    const raw = await request.text();
    if (raw.length > 8192) return mobileError("INVALID_REQUEST", "Sorğu çox böyükdür.", 413, requestId);
    const payload = JSON.parse(raw || "{}");
    return mobileJson(await operation(payload), 200, requestId);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return mobileError("INVALID_REQUEST", "Sorğu düzgün deyil.", 400, requestId);
    if (error instanceof PublicActionError)
      return mobileError(error.code, error.message, error.code === "NOT_FOUND" ? 404 : 409, requestId);
    return mobileInternalError(error, requestId);
  }
}
