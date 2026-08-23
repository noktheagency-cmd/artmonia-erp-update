import { createHash, timingSafeEqual } from "node:crypto";
import { getEnv } from "@/server/env";

export function hasValidMobileAttendanceAuthorization(authorization: string | null) {
  const configured = getEnv().MOBILE_ATTENDANCE_SERVER_TOKENS;
  if (!configured) return false;

  return isBearerTokenAllowed(
    authorization,
    configured.split(",").map((item) => item.trim()).filter(Boolean),
  );
}

export function isBearerTokenAllowed(authorization: string | null, allowedTokens: string[]) {
  if (!authorization?.startsWith("Bearer ")) return false;
  const candidate = authorization.slice("Bearer ".length);
  if (!candidate || candidate.trim() !== candidate) return false;

  const candidateHash = createHash("sha256").update(candidate).digest();
  let matched = false;
  for (const token of allowedTokens) {
    const expectedHash = createHash("sha256").update(token).digest();
    matched = timingSafeEqual(candidateHash, expectedHash) || matched;
  }
  return matched;
}
