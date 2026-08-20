import assert from "node:assert/strict";
import test from "node:test";
import { formatBakuDate, formatBakuDateTime } from "./notification-date";

test("formats notification timestamps deterministically in Bakı time", () => {
  const value = "2026-08-20T18:15:33.719Z";
  assert.equal(formatBakuDate(value), "20.08.2026");
  assert.equal(formatBakuDateTime(value), "20.08.2026, 22:15");
});

test("keeps task deadlines as calendar dates", () => {
  assert.equal(formatBakuDate("2026-08-21T12:00:00.000Z"), "21.08.2026");
});
