import assert from "node:assert/strict";
import test from "node:test";
import { isMfaChallengeExpired, MFA_CHALLENGE_MAX_AGE_MS, needsMfa } from "./mfa-policy";
test("privileged access requires MFA even before initial enrollment", () => {
  for (const role of ["SUPER_ADMIN", "OWNER", "ADMIN"]) {
    assert.equal(needsMfa([role], false, "aal1"), true);
    assert.equal(needsMfa([role], false, undefined), true);
    assert.equal(needsMfa([role], true, "aal2"), false);
  }
});
test("enrolled staff cannot bypass MFA with a password-only session", () => {
  assert.equal(needsMfa(["TEACHER"], true, "aal1"), true);
  assert.equal(needsMfa(["TEACHER"], false, "aal1"), false);
});
test("MFA challenge expires two minutes after session creation", () => {
  const createdAt = Date.parse("2026-10-20T10:00:00.000Z");
  assert.equal(isMfaChallengeExpired(createdAt, createdAt + MFA_CHALLENGE_MAX_AGE_MS - 1), false);
  assert.equal(isMfaChallengeExpired(createdAt, createdAt + MFA_CHALLENGE_MAX_AGE_MS), true);
});
