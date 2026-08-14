import assert from "node:assert/strict";
import test from "node:test";
import {
  isGiftDiscount,
  resolveInitialFirstLessonAt,
  resolveStudentMonthlyFee,
} from "@/modules/students/student-create-rules";

test("gift discount always resolves the payable monthly fee to zero", () => {
  assert.equal(isGiftDiscount("GIFT"), true);
  assert.equal(resolveStudentMonthlyFee("GIFT", 250), 0);
});

test("regular and custom discount types preserve the entered monthly fee", () => {
  assert.equal(resolveStudentMonthlyFee("DISCOUNT", 180), 180);
  assert.equal(resolveStudentMonthlyFee("Ailə güzəşti", 150), 150);
  assert.equal(resolveStudentMonthlyFee(undefined, 250), 250);
});

test("manual first lesson date is preserved for an imported slot-waiting student", () => {
  const registeredAt = new Date("2026-08-15T00:00:00.000Z");
  const firstLessonAt = new Date("2024-09-10T00:00:00.000Z");

  assert.equal(
    resolveInitialFirstLessonAt({
      lifecycleStatus: "SLOT_WAITING",
      registeredAt,
      mode: "MANUAL",
      requestedFirstLessonAt: firstLessonAt,
    }),
    firstLessonAt,
  );
});

test("automatic first lesson waits for activation and otherwise uses the activation date", () => {
  const registeredAt = new Date("2026-08-15T00:00:00.000Z");

  assert.equal(
    resolveInitialFirstLessonAt({
      lifecycleStatus: "SLOT_WAITING",
      registeredAt,
      mode: "AUTO",
      requestedFirstLessonAt: null,
    }),
    null,
  );
  assert.equal(
    resolveInitialFirstLessonAt({
      lifecycleStatus: "ACTIVE",
      registeredAt,
      mode: "AUTO",
      requestedFirstLessonAt: null,
    }),
    registeredAt,
  );
});
