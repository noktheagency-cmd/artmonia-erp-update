import assert from "node:assert/strict";
import test from "node:test";
import { isBearerTokenAllowed } from "./mobile-attendance-auth";

const active = "active-mobile-attendance-secret-000001";
const next = "next-mobile-attendance-secret-00000002";

test("aktiv və rotasiya üçün növbəti server tokenini qəbul edir", () => {
  assert.equal(isBearerTokenAllowed(`Bearer ${active}`, [active, next]), true);
  assert.equal(isBearerTokenAllowed(`Bearer ${next}`, [active, next]), true);
});

test("yanlış, boş və formatı pozulmuş tokenləri rədd edir", () => {
  assert.equal(isBearerTokenAllowed("Bearer wrong", [active]), false);
  assert.equal(isBearerTokenAllowed("Basic value", [active]), false);
  assert.equal(isBearerTokenAllowed(`Bearer ${active} `, [active]), false);
  assert.equal(isBearerTokenAllowed(null, [active]), false);
});
