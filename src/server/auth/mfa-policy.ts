/** Password-only MFA challenge must complete within this window. */
export const MFA_CHALLENGE_MAX_AGE_MS = 2 * 60 * 1000;

export function needsMfa(roles: readonly string[], hasVerifiedFactor: boolean, assuranceLevel: unknown) {
  return assuranceLevel !== "aal2" &&
    (hasVerifiedFactor || roles.some((role) => ["SUPER_ADMIN", "OWNER", "ADMIN"].includes(role)));
}

export function mfaChallengeExpiresAt(sessionCreatedAt: Date | string | number) {
  return new Date(sessionCreatedAt).getTime() + MFA_CHALLENGE_MAX_AGE_MS;
}

export function isMfaChallengeExpired(sessionCreatedAt: Date | string | number, now = Date.now()) {
  return now >= mfaChallengeExpiresAt(sessionCreatedAt);
}
