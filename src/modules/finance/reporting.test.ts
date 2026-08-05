import assert from "node:assert/strict";
import test from "node:test";
import {
  EVENT_REPORTING_CATEGORY,
  getExpenseReportingCategory,
  getIncomeDescription,
  getIncomeReportingCategory,
} from "./reporting";

test("workshop expenses are grouped under the event reporting category", () => {
  assert.equal(getExpenseReportingCategory("event-id", "Material"), EVENT_REPORTING_CATEGORY);
  assert.equal(getExpenseReportingCategory(null, "Material"), "Material");
});

test("income reporting distinguishes workshop and student sources", () => {
  assert.equal(getIncomeReportingCategory("WORKSHOP"), "Tədbir gəliri");
  assert.equal(getIncomeReportingCategory("STUDENT"), "Təhsil haqqı");
  assert.equal(
    getIncomeDescription("WORKSHOP", "Aysel Məmmədova", "Keramika workshop"),
    "Aysel Məmmədova — Keramika workshop",
  );
});
