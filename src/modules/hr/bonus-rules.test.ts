import assert from "node:assert/strict";
import test from "node:test";
import { bonusProgress, splitBonusPool, validateBonusStages } from "./bonus-rules";

test("bonus stages must be ascending", () => {
  assert.equal(validateBonusStages([{ threshold: 5000, bonusPool: 250 }, { threshold: 10000, bonusPool: 500 }]).length, 2);
  assert.throws(() => validateBonusStages([{ threshold: 5000, bonusPool: 250 }, { threshold: 4000, bonusPool: 500 }]), /artan/);
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
