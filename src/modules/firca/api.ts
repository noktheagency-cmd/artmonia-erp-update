import { z } from "zod";
import {
  authenticateMobileStudentRequest,
  mobileError,
  mobileInternalError,
  mobileJson,
  type MobileStudentIdentity,
} from "@/modules/mobile/mobile-api";
import { MobilePortalError } from "@/modules/mobile/mobile-portal-errors";

export async function studentRequest(
  request: Request,
  handler: (identity: MobileStudentIdentity) => Promise<object>,
) {
  const auth = await authenticateMobileStudentRequest(request);
  if (!auth.ok) return auth.response;
  try {
    return mobileJson(
      await handler(auth.context.identity),
      200,
      auth.context.requestId,
    );
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return mobileError(
        "INVALID_REQUEST",
        "Sorğu düzgün deyil.",
        400,
        auth.context.requestId,
      );
    if (error instanceof MobilePortalError)
      return mobileError(
        error.code,
        error.message,
        error.status,
        auth.context.requestId,
      );
    return mobileInternalError(error, auth.context.requestId);
  }
}
