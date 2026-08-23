import { z } from "zod";
import {
  authenticateMobileStudentRequest,
  mobileError,
  mobileInternalError,
  mobileJson,
} from "@/modules/mobile/mobile-api";
import { mobileProfilePatchSchema } from "@/modules/mobile/mobile-portal-contract";
import {
  getMobileProfile,
  MobilePortalError,
  updateMobileProfile,
} from "@/modules/mobile/mobile-portal-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PROFILE_BODY_BYTES = 8 * 1024;

export async function GET(request: Request) {
  const auth = await authenticateMobileStudentRequest(request);
  if (!auth.ok) return auth.response;
  try {
    return mobileJson(await getMobileProfile(auth.context.identity), 200, auth.context.requestId);
  } catch (error) {
    return portalFailure(error, auth.context.requestId);
  }
}

export async function PATCH(request: Request) {
  const auth = await authenticateMobileStudentRequest(request);
  if (!auth.ok) return auth.response;
  const requestId = auth.context.requestId;
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return mobileError("UNSUPPORTED_MEDIA_TYPE", "Content-Type application/json olmalıdır.", 415, requestId);
  }
  try {
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_PROFILE_BODY_BYTES) {
      return mobileError("PAYLOAD_TOO_LARGE", "Sorğu body-si çox böyükdür.", 413, requestId);
    }
    const input = mobileProfilePatchSchema.parse(JSON.parse(rawBody));
    const profile = await updateMobileProfile(auth.context.identity, input);
    return mobileJson(profile, 200, requestId);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return mobileError("INVALID_REQUEST", "Profil məlumatı düzgün deyil.", 400, requestId);
    }
    return portalFailure(error, requestId);
  }
}

function portalFailure(error: unknown, requestId: string) {
  if (error instanceof MobilePortalError) {
    return mobileError(error.code, error.message, error.status, requestId);
  }
  return mobileInternalError(error, requestId);
}
