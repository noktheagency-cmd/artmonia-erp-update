import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCompanyKpiMetrics,
  type CompanyKpiActuals,
  type CompanyKpiPeriod,
  type CompanyKpiTargets,
} from "./company-kpi-calculations";

const targets: CompanyKpiTargets = {
  activeStudents: 100,
  newSales: 30,
  churn: 10,
  leads: 200,
  conversion: 10,
  revenue: 10_000,
};

const actuals: CompanyKpiActuals = {
  activeStudents: 95,
  openingActiveStudents: 90,
  newSales: 15,
  churn: 6,
  leads: 100,
  convertedLeads: 5,
  conversion: 5,
  revenue: 5_000,
};

const period: CompanyKpiPeriod = {
  elapsedDays: 15,
  totalDays: 30,
  remainingDays: 16,
  hasStarted: true,
  isComplete: false,
};

test("company KPI flow metrics use elapsed-month pace", () => {
  const metrics = buildCompanyKpiMetrics(targets, actuals, period);
  assert.equal(metrics.find((metric) => metric.key === "newSales")?.status, "success");
  assert.equal(metrics.find((metric) => metric.key === "revenue")?.projected, 10_000);
});

test("churn status is inverted and based on projected limit", () => {
  const metric = buildCompanyKpiMetrics(targets, actuals, period)
    .find((item) => item.key === "churn");
  assert.equal(metric?.projected, 12);
  assert.equal(metric?.status, "danger");
  assert.equal(metric?.difference, 4);
});

test("conversion pace is returned as required additional sales", () => {
  const metric = buildCompanyKpiMetrics(targets, actuals, period)
    .find((item) => item.key === "conversion");
  assert.equal(metric?.requiredDailyKind, "count");
  assert.equal(metric?.requiredDaily, 15 / 16);
});

test("missing targets produce neutral progress", () => {
  const metrics = buildCompanyKpiMetrics(null, actuals, period);
  assert.equal(metrics.every((metric) => metric.status === "neutral"), true);
  assert.equal(metrics.every((metric) => metric.target === 0), true);
});

test("a zero churn limit is green only while no churn exists", () => {
  const zeroChurnTargets = { ...targets, churn: 0 };
  const green = buildCompanyKpiMetrics(
    zeroChurnTargets,
    { ...actuals, churn: 0 },
    period,
  ).find((metric) => metric.key === "churn");
  const red = buildCompanyKpiMetrics(zeroChurnTargets, actuals, period)
    .find((metric) => metric.key === "churn");
  assert.equal(green?.status, "success");
  assert.equal(red?.status, "danger");
});
