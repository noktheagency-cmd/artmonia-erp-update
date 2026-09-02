import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCompanyKpiMetrics,
  buildCompanyKpiRollover,
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

test("unfinished monthly sales are carried into the next completed plan month", () => {
  const rollover = buildCompanyKpiRollover([
    {
      periodMonth: "2026-09",
      baseTargets: { ...targets, newSales: 78 },
      actuals: { ...targets, newSales: 70 },
      isComplete: true,
    },
    {
      periodMonth: "2026-10",
      baseTargets: { ...targets, newSales: 80 },
      actuals: { ...targets, newSales: 0 },
      isComplete: false,
    },
  ]);

  assert.equal(rollover[0]?.carryOut?.newSales, 8);
  assert.equal(rollover[1]?.carryIn?.newSales, 8);
  assert.equal(rollover[1]?.effectiveTargets.newSales, 88);
});

test("over-performance reduces the next target and preserves excess across zero targets", () => {
  const rollover = buildCompanyKpiRollover([
    {
      periodMonth: "2026-09",
      baseTargets: { ...targets, newSales: 50 },
      actuals: { ...targets, newSales: 80 },
      isComplete: true,
    },
    {
      periodMonth: "2026-10",
      baseTargets: { ...targets, newSales: 10 },
      actuals: { ...targets, newSales: 0 },
      isComplete: true,
    },
    {
      periodMonth: "2026-11",
      baseTargets: { ...targets, newSales: 25 },
      actuals: { ...targets, newSales: 0 },
      isComplete: false,
    },
  ]);

  assert.equal(rollover[1]?.effectiveTargets.newSales, 0);
  assert.equal(rollover[1]?.carryOut?.newSales, -20);
  assert.equal(rollover[2]?.effectiveTargets.newSales, 5);
});

test("unused churn allowance is not carried forward, but an overrun tightens the next limit", () => {
  const rollover = buildCompanyKpiRollover([
    {
      periodMonth: "2026-09",
      baseTargets: { ...targets, churn: 10 },
      actuals: { ...targets, churn: 4 },
      isComplete: true,
    },
    {
      periodMonth: "2026-10",
      baseTargets: { ...targets, churn: 10 },
      actuals: { ...targets, churn: 13 },
      isComplete: true,
    },
    {
      periodMonth: "2026-11",
      baseTargets: { ...targets, churn: 10 },
      actuals: { ...targets, churn: 0 },
      isComplete: false,
    },
  ]);

  assert.equal(rollover[0]?.carryOut?.churn, 0);
  assert.equal(rollover[1]?.carryOut?.churn, -3);
  assert.equal(rollover[2]?.effectiveTargets.churn, 7);
});
