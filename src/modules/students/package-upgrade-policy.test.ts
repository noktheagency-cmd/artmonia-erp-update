import assert from "node:assert/strict";
import test from "node:test";
import {
  assertPackageUpgradeAllowed,
  earliestPackageUpgradeMonth,
  isPackageUpgrade,
} from "./package-upgrade-policy";

test("BK-15: fee increase or more lessons counts as package upgrade", () => {
  assert.equal(
    isPackageUpgrade({
      previousMonthlyFee: 200,
      previousLessonsPerMonth: 8,
      monthlyFee: 250,
      lessonsPerMonth: 8,
    }),
    true,
  );
  assert.equal(
    isPackageUpgrade({
      previousMonthlyFee: 200,
      previousLessonsPerMonth: 8,
      monthlyFee: 200,
      lessonsPerMonth: 12,
    }),
    true,
  );
  assert.equal(
    isPackageUpgrade({
      previousMonthlyFee: 200,
      previousLessonsPerMonth: 12,
      monthlyFee: 180,
      lessonsPerMonth: 8,
    }),
    false,
  );
});

test("BK-15: earliest upgrade month is the second billing period", () => {
  assert.equal(
    earliestPackageUpgradeMonth(new Date("2026-08-18T00:00:00.000Z")).toISOString(),
    "2026-09-01T00:00:00.000Z",
  );
});

test("BK-15: mid first-month upgrade is blocked (T-37)", () => {
  assert.throws(
    () => assertPackageUpgradeAllowed({
      previousMonthlyFee: 200,
      previousLessonsPerMonth: 8,
      monthlyFee: 300,
      lessonsPerMonth: 12,
      effectiveMonth: new Date("2026-08-01T00:00:00.000Z"),
      billingAnchorDate: new Date("2026-08-18T00:00:00.000Z"),
    }),
    /BK-15/,
  );
});

test("BK-15: upgrade from second period is allowed (T-38)", () => {
  assert.doesNotThrow(() => assertPackageUpgradeAllowed({
    previousMonthlyFee: 200,
    previousLessonsPerMonth: 8,
    monthlyFee: 300,
    lessonsPerMonth: 12,
    effectiveMonth: new Date("2026-09-01T00:00:00.000Z"),
    billingAnchorDate: new Date("2026-08-18T00:00:00.000Z"),
  }));
});

test("BK-15: downgrade in first month stays allowed", () => {
  assert.doesNotThrow(() => assertPackageUpgradeAllowed({
    previousMonthlyFee: 300,
    previousLessonsPerMonth: 12,
    monthlyFee: 200,
    lessonsPerMonth: 8,
    effectiveMonth: new Date("2026-08-01T00:00:00.000Z"),
    billingAnchorDate: new Date("2026-08-18T00:00:00.000Z"),
  }));
});

test("BK-15: before activation, fee edits are initial setup not upgrades", () => {
  assert.doesNotThrow(() => assertPackageUpgradeAllowed({
    previousMonthlyFee: 200,
    previousLessonsPerMonth: 8,
    monthlyFee: 300,
    lessonsPerMonth: 12,
    effectiveMonth: new Date("2026-08-01T00:00:00.000Z"),
    billingAnchorDate: null,
  }));
});
