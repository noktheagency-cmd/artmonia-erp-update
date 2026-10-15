import assert from "node:assert/strict";
import test from "node:test";
import { decideMobileStudentMatch, mobileAuthProfile, normalizeMobileMatchPhone } from "./mobile-access-policy";

const candidate = { phoneDisplay: "+994 50 123 45 67", phoneNormalized: "0501234567", linkedAuthUserId: null };

test("mobile matching normalizes Azerbaijan national, international and formatted phones", () => {
  for (const phone of ["+994501234567", "00994501234567", "050 123-45-67", "501234567"]) {
    assert.equal(normalizeMobileMatchPhone(phone), "994501234567");
    assert.equal(decideMobileStudentMatch([candidate], "auth", phone), "match");
  }
  for (const phone of [null, "letters0501234567", "+", "12"]) assert.equal(normalizeMobileMatchPhone(phone), null);
});

test("no match remains member, ambiguity, ownership and phone conflicts require review", () => {
  assert.equal(decideMobileStudentMatch([], "auth", null), "not_found");
  assert.equal(decideMobileStudentMatch([candidate, candidate], "auth", candidate.phoneDisplay), "review_required");
  assert.equal(decideMobileStudentMatch([{ ...candidate, linkedAuthUserId: "other" }], "auth", candidate.phoneDisplay), "review_required");
  for (const phone of [null, "0551234567", "invalid"]) {
    assert.equal(decideMobileStudentMatch([candidate], "auth", phone), "review_required");
  }
  assert.equal(decideMobileStudentMatch([{ ...candidate, phoneNormalized: "994551234567" }], "auth", candidate.phoneDisplay), "review_required");
  assert.equal(decideMobileStudentMatch([{ phoneDisplay: null, phoneNormalized: null, linkedAuthUserId: null }], "auth", null), "match");
});

test("Auth metadata supplies display fields only; verified Auth phone takes priority", () => {
  const user = { id: "auth", email: "a@example.com", emailConfirmed: true, phone: "+994501234567", phoneConfirmed: true,
    metadata: { first_name: "Aylin", last_name: "Məmmədova", phone: "+994551234567", role: "ADMIN", studentId: "fake" }, disabled: false, sessionActive: true };
  assert.deepEqual(mobileAuthProfile(user), { displayName: "Aylin Məmmədova", phone: "+994501234567" });
  assert.deepEqual(mobileAuthProfile({ ...user, phoneConfirmed: false }), { displayName: "Aylin Məmmədova", phone: "+994551234567" });
  assert.deepEqual(mobileAuthProfile({ ...user, phoneConfirmed: false, metadata: { full_name: { role: "ADMIN" }, phone: [] } }),
    { displayName: "Artmonia üzvü", phone: null });
});
