import assert from "node:assert/strict";
import test from "node:test";
import { isStrongPassword, breachRangeContains } from "./password-policy";
test("password policy rejects short, incomplete, and bcrypt-truncated passwords", () => {
  assert.equal(isStrongPassword("Abc123!short"), false);
  assert.equal(isStrongPassword("a".repeat(24)), false);
  assert.equal(isStrongPassword("Aa1!"+"ə".repeat(35)), false);
  assert.equal(isStrongPassword("A9!brave-Forest-17z"), true);
});
test("padded HIBP responses only reject exact positive-count matches", () => {
  assert.equal(breachRangeContains("ABC:0\r\nDEF:20\r\n", "ABC"), false);
  assert.equal(breachRangeContains("ABC:0\r\nDEF:20\r\n", "def"), true);
  assert.equal(breachRangeContains("ABC:1", "AB"), false);
});
