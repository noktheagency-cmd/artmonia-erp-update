import assert from "node:assert/strict";
import test from "node:test";
import {
  ADMISSION_PAYMENT_MIN_MESSAGE,
  isAdmissionAmountBelowMinimum,
  parsePaymentAmount,
} from "./admission-payment-amount";

test("parses decimal amounts with comma or dot", () => {
  assert.equal(parsePaymentAmount("19"), 19);
  assert.equal(parsePaymentAmount("19,5"), 19.5);
  assert.equal(parsePaymentAmount("20.00"), 20);
  assert.equal(parsePaymentAmount(""), null);
});

test("blocks admission amounts under 20 AZN", () => {
  assert.equal(isAdmissionAmountBelowMinimum("19", "ADMISSION"), true);
  assert.equal(isAdmissionAmountBelowMinimum("20", "ADMISSION"), false);
  assert.equal(isAdmissionAmountBelowMinimum("19", "RENEWAL"), false);
  assert.equal(ADMISSION_PAYMENT_MIN_MESSAGE, "Minimum 20 AZN ödəniş edilməlidir.");
});
