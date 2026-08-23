import {
  authenticateMobileStudentRequest,
  mobileError,
  mobileInternalError,
  mobileJson,
} from "@/modules/mobile/mobile-api";
import { getMobileHome, MobilePortalError } from "@/modules/mobile/mobile-portal-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await authenticateMobileStudentRequest(request);
  if (!auth.ok) return auth.response;
  try {
    return mobileJson(await getMobileHome(auth.context.identity), 200, auth.context.requestId);
  } catch (error) {
    if (error instanceof MobilePortalError) {
      return mobileError(error.code, error.message, error.status, auth.context.requestId);
    }
    return mobileInternalError(error, auth.context.requestId);
  }
}
