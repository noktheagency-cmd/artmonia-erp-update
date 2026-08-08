import assert from "node:assert/strict";
import test from "node:test";
import { calculateAttendanceAdjustedPayout } from "./teacher-payroll-formula";

test("a present lesson contributes the teacher percentage of its revenue share", () => {
  assert.deepEqual(calculateAttendanceAdjustedPayout({
    paidAmount: 400,
    attendedLessons: 2,
    plannedLessons: 8,
    salaryPercent: 45,
  }), {
    attendanceRatio: 0.25,
    lessonDenominator: 8,
    eligibleRevenue: 100,
    payoutAmount: 45,
  });
});

test("an absent-only journal record does not contribute to percentage salary", () => {
  const result = calculateAttendanceAdjustedPayout({
    paidAmount: 400,
    attendedLessons: 0,
    plannedLessons: 8,
    salaryPercent: 45,
  });

  assert.equal(result.eligibleRevenue, 0);
  assert.equal(result.payoutAmount, 0);
});

test("a transfer splits revenue by attended lesson and applies each teacher percentage", () => {
  const formerTeacher = calculateAttendanceAdjustedPayout({
    paidAmount: 400,
    attendedLessons: 2,
    totalAttendedLessons: 6,
    plannedLessons: 8,
    salaryPercent: 45,
  });
  const currentTeacher = calculateAttendanceAdjustedPayout({
    paidAmount: 400,
    attendedLessons: 4,
    totalAttendedLessons: 6,
    plannedLessons: 8,
    salaryPercent: 55,
  });

  assert.equal(formerTeacher.eligibleRevenue, 100);
  assert.equal(formerTeacher.payoutAmount, 45);
  assert.equal(currentTeacher.eligibleRevenue, 200);
  assert.equal(currentTeacher.payoutAmount, 110);
});

test("extra present records cannot allocate more than the paid revenue", () => {
  const firstTeacher = calculateAttendanceAdjustedPayout({
    paidAmount: 400,
    attendedLessons: 5,
    totalAttendedLessons: 10,
    plannedLessons: 8,
    salaryPercent: 50,
  });
  const secondTeacher = calculateAttendanceAdjustedPayout({
    paidAmount: 400,
    attendedLessons: 5,
    totalAttendedLessons: 10,
    plannedLessons: 8,
    salaryPercent: 50,
  });

  assert.equal(firstTeacher.lessonDenominator, 10);
  assert.equal(firstTeacher.eligibleRevenue + secondTeacher.eligibleRevenue, 400);
});
