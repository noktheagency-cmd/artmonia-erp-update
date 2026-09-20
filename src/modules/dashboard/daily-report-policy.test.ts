import test from "node:test";
import assert from "node:assert/strict";
import { canReadDailyReport, dailyReportWindow } from "./daily-report-policy";
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
