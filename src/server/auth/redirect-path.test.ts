import assert from "node:assert/strict";
import test from "node:test";
import { safeRedirectPath } from "./redirect-path";

test("login redirects reject browser URL normalization bypasses", () => {
  for (const value of ["//evil.test", "/\\evil.test", "/%5cevil.test", "/%2fevil.test", "/\tevil.test", "https://evil.test", "/%00evil", "/%zz"]) {
    assert.equal(safeRedirectPath(value), "/dashboard", value);
  }
  assert.equal(safeRedirectPath("/oauth/consent?authorization_id=abc"), "/oauth/consent?authorization_id=abc");
});
