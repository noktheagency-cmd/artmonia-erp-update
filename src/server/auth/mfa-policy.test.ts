import assert from "node:assert/strict";
import test from "node:test";
import { needsMfa } from "./mfa-policy";
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
