import test from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@/generated/prisma/client";
import { calculateGuestLessonPayout, STATIC_GUEST_LESSON_PERCENT } from "./guest-lesson-payroll";

test("guest lessons use the teacher percentage, while static teachers receive 35%", () => {
  assert.equal(calculateGuestLessonPayout(new Prisma.Decimal(25), 40).payoutAmount.toFixed(2), "10.00");
  assert.equal(calculateGuestLessonPayout(new Prisma.Decimal(25), STATIC_GUEST_LESSON_PERCENT).payoutAmount.toFixed(2), "8.75");
});
test("guest commission rounds decimal cents once per paid visit", () => {
  assert.equal(calculateGuestLessonPayout(new Prisma.Decimal("10.10"), 35).payoutAmount.toFixed(2), "3.54");
  assert.equal(calculateGuestLessonPayout(new Prisma.Decimal("0.01"), 35).payoutAmount.toFixed(2), "0.00");
  assert.equal(calculateGuestLessonPayout(new Prisma.Decimal(25), 0).payoutAmount.toFixed(2), "0.00");
});
