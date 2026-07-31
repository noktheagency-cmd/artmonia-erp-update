import assert from "node:assert/strict";
import test from "node:test";
import { resolveNextPaymentAt, resolveNextPaymentDateInput } from "./payment-schedule";

function utcDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

test("anchors the next payment to one month after the group join month", () => {
  assert.equal(
    resolveNextPaymentAt({
      groupJoinedAt: utcDate("2026-07-08"),
      paymentMonth: utcDate("2026-07-01"),
      paidAt: utcDate("2026-07-05"),
    }).toISOString().slice(0, 10),
    "2026-08-08",
  );
});

test("keeps the group join day for following billing months", () => {
  assert.equal(
    resolveNextPaymentDateInput({ groupJoinedAt: "2026-07-08", paidAt: "2026-08-05" }),
    "2026-09-08",
  );
});

test("never schedules before one month after a later group join", () => {
  assert.equal(
    resolveNextPaymentDateInput({ groupJoinedAt: "08.07.2026", paidAt: "2026-06-05" }),
    "2026-08-08",
  );
});

test("clamps group days that do not exist in the target month", () => {
  assert.equal(
    resolveNextPaymentDateInput({ groupJoinedAt: "2026-01-31", paidAt: "2026-01-10" }),
    "2026-02-28",
  );
});

test("falls back to the payment day when the student has no group", () => {
  assert.equal(
    resolveNextPaymentDateInput({ groupJoinedAt: null, paidAt: "2026-07-05" }),
    "2026-08-05",
  );
});
