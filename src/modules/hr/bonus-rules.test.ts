import assert from "node:assert/strict";
import test from "node:test";
import {
  bonusProgress,
  calculateTierAward,
  splitBonusPool,
  teacherWorkloadMultiplier,
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

test("teacher workload uses a bounded square-root scale", () => {
  assert.equal(teacherWorkloadMultiplier(20), 1);
  assert.equal(teacherWorkloadMultiplier(30), 1.22);
  assert.equal(teacherWorkloadMultiplier(5), 0.75);
  assert.equal(teacherWorkloadMultiplier(100), 1.25);
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
