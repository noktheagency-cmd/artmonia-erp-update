import assert from "node:assert/strict";
import test from "node:test";
import { resolveNextPaymentAt, resolveNextPaymentDateInput } from "./payment-schedule";

function utcDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

test("anchors the next payment to one month after the slot start month", () => {
  assert.equal(
    resolveNextPaymentAt({
      slotStartedAt: utcDate("2026-07-08"),
      paymentMonth: utcDate("2026-07-01"),
    })?.toISOString().slice(0, 10),
    "2026-08-08",
  );
});

test("keeps the slot start day for following billing months", () => {
  assert.equal(
    resolveNextPaymentDateInput({ slotStartedAt: "2026-07-08", paidAt: "2026-08-05" }),
    "2026-09-08",
  );
});

test("never schedules before one month after a later slot start", () => {
  assert.equal(
    resolveNextPaymentDateInput({ slotStartedAt: "08.07.2026", paidAt: "2026-06-05" }),
    "2026-08-08",
  );
});

test("clamps slot start days that do not exist in the target month", () => {
  assert.equal(
    resolveNextPaymentDateInput({ slotStartedAt: "2026-01-31", paidAt: "2026-01-10" }),
    "2026-02-28",
  );
});

test("does not schedule a next payment when the student has no active slot", () => {
  assert.equal(
    resolveNextPaymentDateInput({ slotStartedAt: null, paidAt: "2026-07-05" }),
    "",
  );
});
