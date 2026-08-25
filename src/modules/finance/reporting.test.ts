import assert from "node:assert/strict";
import test from "node:test";
import {
  EVENT_REPORTING_CATEGORY,
  getExpenseReportingCategory,
  getIncomeDescription,
  getIncomeReportingCategory,
  calculateFinanceStatement,
  isCashInflow,
} from "./reporting";

test("workshop expenses are grouped under the event reporting category", () => {
  assert.equal(getExpenseReportingCategory("event-id", "Material"), EVENT_REPORTING_CATEGORY);
  assert.equal(getExpenseReportingCategory(null, "Material"), "Material");
});

test("profit excludes capex and financing while cash flow includes them", () => {
  assert.deepEqual(
    calculateFinanceStatement({
      operatingIncome: 10_000,
      directCost: 2_500,
      opex: 3_000,
      capex: 1_200,
      financingIn: 5_000,
      financingOut: 700,
      legacyLiability: 400,
    }),
    {
      grossProfit: 7_500,
      operatingProfit: 4_500,
      netProfit: 4_500,
      netCash: 7_200,
    },
  );
});

test("financing received is a cash inflow but an expense is not", () => {
  assert.equal(isCashInflow("FINANCING_IN"), true);
  assert.equal(isCashInflow("INCOME"), true);
  assert.equal(isCashInflow("EXPENSE"), false);
  assert.equal(isCashInflow("CAPEX_OUT"), false);
});

test("income reporting distinguishes workshop and student sources", () => {
  assert.equal(getIncomeReportingCategory("WORKSHOP"), "Tədbir gəliri");
  assert.equal(getIncomeReportingCategory("STUDENT"), "Təhsil haqqı");
  assert.equal(
    getIncomeDescription("WORKSHOP", "Aysel Məmmədova", "Keramika workshop"),
    "Aysel Məmmədova — Keramika workshop",
  );
});
