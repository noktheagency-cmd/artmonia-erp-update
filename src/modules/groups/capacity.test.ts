import assert from "node:assert/strict";
import test from "node:test";
import {
  STUDENT_LESSONS_PER_WEEK,
  calculateGroupCapacity,
} from "./capacity";

function groups(count: number, capacity: number, weeklySessions: number) {
  return Array.from({ length: count }, () => ({
    capacity,
    schedules: Array.from({ length: weeklySessions }),
  }));
}

test("calculates the 420-student weekly capacity for the current group plan", () => {
  const result = calculateGroupCapacity([
    ...groups(12, 10, 5),
    ...groups(12, 10, 2),
  ]);

  assert.equal(STUDENT_LESSONS_PER_WEEK, 2);
  assert.deepEqual(result, {
    weeklyClassPlaces: 840,
    maximumStudentCapacity: 420,
  });
});

test("uses every group's own capacity and schedule count", () => {
  const result = calculateGroupCapacity([
    { capacity: 8, schedules: [{}, {}, {}] },
    { capacity: 12, schedules: [{}, {}] },
  ], 3);

  assert.deepEqual(result, {
    weeklyClassPlaces: 48,
    maximumStudentCapacity: 16,
  });
});

test("returns only whole-student capacity", () => {
  assert.equal(
    calculateGroupCapacity([{ capacity: 5, schedules: [{}] }], 2).maximumStudentCapacity,
    2,
  );
});

test("rejects an invalid weekly lesson frequency", () => {
  assert.throws(() => calculateGroupCapacity([], 0), RangeError);
});
