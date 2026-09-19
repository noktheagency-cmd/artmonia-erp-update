import assert from "node:assert/strict";
import test from "node:test";
import { permitsMfaDelegation, type DelegationEvidence } from "./delegation-policy";

const valid: DelegationEvidence = {
  sourceValid: true, sourceAal: "aal2", sourceUserId: "founder-a",
  oauthUserId: "founder-a", oauthClientId: "client-a", approvedClientId: "client-a",
  approvedAt: new Date("2026-09-20T00:00:00Z"),
  oauthCreatedAt: new Date("2026-09-20T00:00:01Z"),
};

test("new OAuth session can use its user's client-specific MFA approval", () => {
  assert.equal(permitsMfaDelegation(valid), true);
});

for (const [label, change] of Object.entries<Partial<DelegationEvidence>>({
  "revoked or expired source session": { sourceValid: false },
  "password-only source": { sourceAal: "aal1" },
  "missing MFA assurance": { sourceAal: null },
  "different user": { oauthUserId: "founder-b" },
  "different client": { oauthClientId: "client-b" },
  "non-OAuth session": { oauthClientId: null },
  "token session predating approval": { oauthCreatedAt: new Date("2026-09-19T23:59:59Z") },
  "malformed approval time": { approvedAt: new Date(NaN) },
  "malformed session time": { oauthCreatedAt: new Date(NaN) },
})) {
  test(`MFA delegation rejects ${label}`, () => {
    assert.equal(permitsMfaDelegation({ ...valid, ...change }), false);
  });
}
