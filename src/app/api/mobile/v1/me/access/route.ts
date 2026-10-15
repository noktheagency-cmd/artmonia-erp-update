import { authenticateMobileRequestHeaders, mobileError, mobileInternalError, mobileJson } from "@/modules/mobile/mobile-api";
import { resolveMobileAccess } from "@/modules/mobile/mobile-access-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = authenticateMobileRequestHeaders(request);
  if (!auth.ok) return auth.response;
  const { requestId, accessToken } = auth.context;
  if (new URL(request.url).searchParams.size || Number(request.headers.get("content-length") ?? 0) > 0) {
    return mobileError("INVALID_REQUEST", "Bu sorğu body və query parametr qəbul etmir.", 400, requestId);
  }
  try {
    // Next.js supplies a stream for POST even when the HTTP body is empty.
    // Inspect actual bytes, not stream presence; stop at the first nonempty chunk.
    if (await hasNonemptyBody(request)) {
      return mobileError("INVALID_REQUEST", "Bu sorğu body və query parametr qəbul etmir.", 400, requestId);
    }
    const resolution = await resolveMobileAccess(accessToken);
    if (!resolution.ok) {
      return mobileError(resolution.code, resolution.code === "EMAIL_NOT_VERIFIED"
        ? "Əvvəlcə e-poçtunuzu təsdiqləyin." : "Mobil sessiya etibarsızdır və ya vaxtı bitib.", 401, requestId);
    }
    return mobileJson(resolution.access, 200, requestId);
  } catch (error) {
    return mobileInternalError(error, requestId);
  }
}

async function hasNonemptyBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return false;
      if (value.byteLength > 0) {
        await reader.cancel();
        return true;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
