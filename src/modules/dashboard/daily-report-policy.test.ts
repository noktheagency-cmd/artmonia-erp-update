import test from "node:test";
import assert from "node:assert/strict";
import { canReadDailyReport, dailyReportWindow, filteredDailyReportWindow, recentDailyReportDates } from "./daily-report-policy";
import type { EffectivePermissions } from "@/server/rbac/permissions";

const permissions = (): EffectivePermissions => new Map([
  ["dashboard.owner.read", "ALL"], ["crm.lead.read", "ALL"], ["student.read", "ALL"], ["billing.payment.read", "ALL"], ["task.read", "ALL"],
]);
test("daily report is limited to the two accounts with full read scopes", () => {
  for (const id of ["f74ddcf3-fed2-4d36-86e5-5e75ab94f225", "d0fb9ad2-ec06-4bc6-8dc9-5c037775486a"]) {
    assert.equal(canReadDailyReport(id, permissions()), true);
    for (const key of permissions().keys()) {
      const restricted = permissions(); restricted.delete(key);
      assert.equal(canReadDailyReport(id, restricted), false);
      restricted.set(key, "ASSIGNED");
      assert.equal(canReadDailyReport(id, restricted), false);
    }
  }
  assert.equal(canReadDailyReport("other", permissions()), false);
});
test("daily report crosses midnight in Baku, including year rollover", () => {
  const before = dailyReportWindow(new Date("2026-12-31T19:59:59Z"));
  assert.equal(before.date, "2026-12-31");
  assert.equal(before.nextDate, "2027-01-01");
  const after = dailyReportWindow(new Date("2026-12-31T20:00:00Z"));
  assert.equal(after.date, "2027-01-01");
  assert.equal(after.start.toISOString(), "2026-12-31T20:00:00.000Z");
  assert.equal(after.end.toISOString(), "2027-01-01T20:00:00.000Z");
});

test("filter permits exactly today and the previous two Baku dates", () => {
  const now = new Date("2026-09-20T10:00:00Z");
  assert.deepEqual(recentDailyReportDates(now), ["2026-09-20", "2026-09-19", "2026-09-18"]);
  assert.equal(filteredDailyReportWindow(undefined, now).date, "2026-09-20");
  for (const date of recentDailyReportDates(now)) {
    const window = filteredDailyReportWindow(date, now);
    assert.equal(window.date, date);
    assert.equal(window.end.getTime() - window.start.getTime(), 86_400_000);
    assert.equal(dailyReportWindow(window.start).date, date);
  }
  for (const date of ["2026-09-17", "2026-09-21", "2025-09-20", "2026-02-30", "20.09.2026", "2026-09-20T00:00:00Z", ""]) {
    assert.throws(() => filteredDailyReportWindow(date, now), /Yalnız bu gün/);
  }
});

test("three-day filter handles year rollover, leap days and Baku midnight", () => {
  assert.deepEqual(recentDailyReportDates(new Date("2026-12-31T20:00:00Z")), ["2027-01-01", "2026-12-31", "2026-12-30"]);
  assert.deepEqual(recentDailyReportDates(new Date("2024-03-01T10:00:00Z")), ["2024-03-01", "2024-02-29", "2024-02-28"]);
  assert.doesNotThrow(() => filteredDailyReportWindow("2026-09-18", new Date("2026-09-20T19:59:59Z")));
  assert.throws(() => filteredDailyReportWindow("2026-09-18", new Date("2026-09-20T20:00:00Z")));
  const yesterday = filteredDailyReportWindow("2026-12-31", new Date("2027-01-01T10:00:00Z"));
  assert.equal(yesterday.start.toISOString(), "2026-12-30T20:00:00.000Z");
  assert.equal(yesterday.nextDate, "2027-01-01");
});
