import assert from "node:assert/strict";
import test from "node:test";
import {
  billingDateForMonth,
  parseBillingMonthInput,
  resolvePaymentBillingPeriod,
} from "./payment-billing-period";

function utcDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

test("Nihad: a July payment targets July and cannot settle August", () => {
  assert.equal(
    resolvePaymentBillingPeriod({
      requestedMonth: utcDate("2026-07-01"),
      billingAnchorDate: utcDate("2026-02-05"),
    }).toISOString().slice(0, 10),
    "2026-07-01",
  );
});

test("payment before the first lesson is clamped to the first billing month", () => {
  assert.equal(
    resolvePaymentBillingPeriod({
      requestedMonth: utcDate("2026-07-01"),
      billingAnchorDate: utcDate("2026-08-17"),
    }).toISOString().slice(0, 10),
    "2026-08-01",
  );
});

test("billing due date always follows the protected anchor day", () => {
  assert.equal(
    billingDateForMonth(utcDate("2026-08-01"), utcDate("2026-02-05"))
      .toISOString().slice(0, 10),
    "2026-08-05",
  );
});

test("day 31 is clamped to the last day of a short month", () => {
  assert.equal(
    billingDateForMonth(utcDate("2026-02-01"), utcDate("2026-01-31"))
      .toISOString().slice(0, 10),
    "2026-02-28",
  );
});

test("billing month input is parsed independently from payment date", () => {
  assert.equal(
    parseBillingMonthInput("2026-07", utcDate("2026-08-24"))
      .toISOString().slice(0, 10),
    "2026-07-01",
  );
});
