import assert from "node:assert/strict";
import test from "node:test";
import { getCrmPeriodRange, normalizeCrmPeriod } from "@/modules/crm/period";

test("BK-22: default CRM period remains this_month for other reports", () => {
  assert.equal(normalizeCrmPeriod(undefined), "this_month");
  assert.ok(getCrmPeriodRange("this_month"));
});

test("BK-22: all period clears created_at bounds for list matching stage cards", () => {
  assert.equal(normalizeCrmPeriod("all"), "all");
  assert.equal(getCrmPeriodRange("all"), null);
});

test("BK-22/23: stage card scope is independent of month filter", () => {
  // Card counts use actor scope only; click forces period=all so list matches.
  const monthRange = getCrmPeriodRange("this_month");
  const allRange = getCrmPeriodRange("all");
  assert.ok(monthRange?.gte);
  assert.equal(allRange, null);
});
