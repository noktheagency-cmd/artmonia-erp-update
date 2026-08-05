import assert from "node:assert/strict";
import test from "node:test";
import {
  isGiftDiscount,
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
