import assert from "node:assert/strict";
import test from "node:test";
import { calendarYearOptions, clampCalendarMonth, isCalendarMonthAllowed } from "./calendar-range";

test("a current-month minimum prevents calendar navigation to earlier months and years", () => {
  assert.equal(isCalendarMonthAllowed("2026-09", "2026-10-01"), false);
  assert.equal(isCalendarMonthAllowed("2025-12", "2026-10-01"), false);
  assert.equal(isCalendarMonthAllowed("2026-10", "2026-10-01"), true);
  assert.equal(isCalendarMonthAllowed("2027-01", "2026-10-01"), true);
  assert.ok(calendarYearOptions(2026, "2026-10-01").every((year) => year >= 2026));
});

test("old selected values open the calendar at the minimum month", () => {
  assert.equal(clampCalendarMonth("2025-06", "2026-10-01"), "2026-10");
  assert.equal(clampCalendarMonth("2026-10", "2026-10-01"), "2026-10");
  assert.equal(clampCalendarMonth("2027-01", "2026-10-01"), "2027-01");
});

test("actual payment calendars stay within the current month when both bounds are supplied", () => {
  assert.equal(isCalendarMonthAllowed("2026-11", "2026-10-01", "2026-10-25"), false);
  assert.equal(clampCalendarMonth("2027-01", "2026-10-01", "2026-10-25"), "2026-10");
  assert.deepEqual(calendarYearOptions(2026, "2026-10-01", "2026-10-25"), [2026]);
});

test("month pickers accept YYYY-MM bounds across the year boundary", () => {
  assert.equal(isCalendarMonthAllowed("2026-12", "2027-01"), false);
  assert.equal(clampCalendarMonth("2026-12", "2027-01"), "2027-01");
  assert.equal(isCalendarMonthAllowed("2027-02", "2027-01"), true);
});

test("historical calendars without a minimum retain access to past dates", () => {
  assert.equal(isCalendarMonthAllowed("2024-01"), true);
  assert.equal(clampCalendarMonth("2024-01"), "2024-01");
  assert.deepEqual(calendarYearOptions(2026), Array.from({ length: 17 }, (_, index) => 2018 + index));
});
