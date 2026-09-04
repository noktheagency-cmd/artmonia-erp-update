import assert from "node:assert/strict";
import test from "node:test";
import {
  FUTURE_PAYMENT_DATE_ERROR,
  assertPaymentMonthMismatchAcknowledged,
  currentBakuDateValue,
  parsePaymentDateInput,
  paymentMonthDiffersFromPaidDate,
} from "./payment-date-policy";

test("Bakı biznes tarixini gecə sərhədində düzgün hesablayır", () => {
  assert.equal(currentBakuDateValue(new Date("2026-09-03T20:30:00.000Z")), "2026-09-04");
});

test("gələcək ödəniş tarixini rədd edir", () => {
  assert.throws(
    () => parsePaymentDateInput("2999-01-01"),
    new RegExp(FUTURE_PAYMENT_DATE_ERROR.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  );
});

test("real olmayan təqvim tarixini rədd edir", () => {
  assert.throws(() => parsePaymentDateInput("2026-02-31"), /Ödəniş tarixi düzgün deyil/);
});

test("ödəniş tarixi və xidmət ayı fərqini aşkarlayır", () => {
  assert.equal(paymentMonthDiffersFromPaidDate("2026-08-31", "2026-09"), true);
  assert.equal(paymentMonthDiffersFromPaidDate("2026-08-31", "2026-08"), false);
});

test("fərqli xidmət ayı yalnız təsdiqdən sonra qəbul edilir", () => {
  const paidAt = new Date("2026-08-31T00:00:00.000Z");
  const paymentMonth = new Date("2026-09-01T00:00:00.000Z");
  assert.throws(() => assertPaymentMonthMismatchAcknowledged({ paidAt, paymentMonth, acknowledged: false }));
  assert.doesNotThrow(() => assertPaymentMonthMismatchAcknowledged({ paidAt, paymentMonth, acknowledged: true }));
});
