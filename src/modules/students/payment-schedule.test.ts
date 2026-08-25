import assert from "node:assert/strict";
import test from "node:test";
import { resolveNextPaymentAt, resolveNextPaymentDateInput } from "./payment-schedule";

function utcDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

test("Jasmin: first lesson 18 August and payment 22 August gives 18 September", () => {
  assert.equal(
    resolveNextPaymentAt({
      billingAnchorDate: utcDate("2026-08-18"),
      paymentMonth: utcDate("2026-08-01"),
    })?.toISOString().slice(0, 10),
    "2026-09-18",
  );
});

test("Fatimə: payment cycle stays on the confirmed first lesson day", () => {
  assert.equal(
    resolveNextPaymentDateInput({ billingAnchorDate: "2026-07-22", paidAt: "2026-08-25" }),
    "2026-09-22",
  );
});

test("slot-added date is not an input to billing", () => {
  assert.equal(
    resolveNextPaymentDateInput({ billingAnchorDate: "22.07.2026", paidAt: "2026-07-20" }),
    "2026-08-22",
  );
});

test("clamps day 31 to the final day of a short month", () => {
  assert.equal(
    resolveNextPaymentDateInput({ billingAnchorDate: "2026-01-31", paidAt: "2026-01-10" }),
    "2026-02-28",
  );
});

test("does not invent a date without a confirmed first lesson", () => {
  assert.equal(
    resolveNextPaymentDateInput({ billingAnchorDate: null, paidAt: "2026-07-05" }),
    "",
  );
});
