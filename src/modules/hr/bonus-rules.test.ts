import assert from "node:assert/strict";
import test from "node:test";
import {
  bonusProgress,
  calculateTeacherStudentBonus,
  calculateTierAward,
  calculatePerUnitAward,
  nextMonthlyBonusPeriod,
  splitBonusPool,
  validateBonusStages,
} from "./bonus-rules";

test("bonus stages must be ascending", () => {
  assert.equal(validateBonusStages([
    { threshold: 20, bonusPool: 0, bonusPercent: 20, fixedAmount: 0 },
    { threshold: 30, bonusPool: 0, bonusPercent: 30, fixedAmount: 100 },
  ]).length, 2);
  assert.throws(() => validateBonusStages([
    { threshold: 20, bonusPool: 0, bonusPercent: 20, fixedAmount: 0 },
    { threshold: 15, bonusPool: 0, bonusPercent: 30, fixedAmount: 100 },
  ]), /artan/);
  assert.throws(() => validateBonusStages([
    { threshold: 20, bonusPool: 0, bonusPercent: 20, fixedAmount: 100 },
    { threshold: 30, bonusPool: 0, bonusPercent: 10, fixedAmount: 100 },
  ]), /azalmamalıdır/);
});

test("percentage and fixed tiers pay only the incremental difference", () => {
  const first = calculateTierAward({ baseAmount: 1000, bonusPercent: 20, fixedAmount: 0 });
  const second = calculateTierAward({
    baseAmount: 1000,
    bonusPercent: 30,
    fixedAmount: 100,
    previousBonusPercent: 20,
    previousFixedAmount: 0,
  });
  assert.deepEqual(first, { baseAmount: 1000, percentAmount: 200, fixedAmount: 0, amount: 200, workloadMultiplier: 1 });
  assert.deepEqual(second, { baseAmount: 1000, percentAmount: 100, fixedAmount: 100, amount: 200, workloadMultiplier: 1 });
  assert.equal(first.amount + second.amount, 400);
});

test("per-unit commission starts only after the mandatory threshold", () => {
  assert.deepEqual(calculatePerUnitAward({
    baseAmount: 1000,
    metricValue: 20,
    requiredThreshold: 20,
    perUnitBonusPercent: 10,
    perUnitBonusAmount: 0,
  }), { unitCount: 0, totalPercent: 0, baseAmount: 1000, percentAmount: 0, fixedAmount: 0, amount: 0 });

  assert.deepEqual(calculatePerUnitAward({
    baseAmount: 1000,
    metricValue: 23,
    requiredThreshold: 20,
    perUnitBonusPercent: 10,
    perUnitBonusAmount: 5,
  }), { unitCount: 3, totalPercent: 30, baseAmount: 1000, percentAmount: 300, fixedAmount: 15, amount: 315 });
});

test("teacher bonus uses student tier base and the highest matching churn deduction", () => {
  const rules = [
    { churnThreshold: 3, deductionAmount: 60 },
    { churnThreshold: 6, deductionAmount: 100 },
  ];
  assert.deepEqual(calculateTeacherStudentBonus(300, 2, rules), { baseBonus: 300, deductionAmount: 0, amount: 300 });
  assert.deepEqual(calculateTeacherStudentBonus(300, 3, rules), { baseBonus: 300, deductionAmount: 60, amount: 240 });
  assert.deepEqual(calculateTeacherStudentBonus(300, 7, rules), { baseBonus: 300, deductionAmount: 100, amount: 200 });
  assert.deepEqual(calculateTeacherStudentBonus(80, 7, rules), { baseBonus: 80, deductionAmount: 100, amount: 0 });
});

test("monthly recurrence starts the next day and preserves a calendar-month period", () => {
  const regular = nextMonthlyBonusPeriod(new Date("2026-07-31T00:00:00.000Z"));
  assert.equal(regular.startsAt.toISOString(), "2026-08-01T00:00:00.000Z");
  assert.equal(regular.endsAt.toISOString(), "2026-08-31T00:00:00.000Z");

  const leapYear = nextMonthlyBonusPeriod(new Date("2024-01-31T00:00:00.000Z"));
  assert.equal(leapYear.startsAt.toISOString(), "2024-02-01T00:00:00.000Z");
  assert.equal(leapYear.endsAt.toISOString(), "2024-02-29T00:00:00.000Z");
});

test("the complete pool is split to cents deterministically", () => {
  const awards = splitBonusPool(10, ["c", "a", "b"]);
  assert.deepEqual(awards, [
    { participantId: "a", amount: 3.34 },
    { participantId: "b", amount: 3.33 },
    { participantId: "c", amount: 3.33 },
  ]);
  assert.equal(Math.round(awards.reduce((sum, award) => sum + award.amount, 0) * 100), 1000);
});

test("progress is clamped", () => {
  assert.equal(bonusProgress(6200, 10000), 62);
  assert.equal(bonusProgress(12000, 10000), 100);
  assert.equal(bonusProgress(-1, 10000), 0);
});
