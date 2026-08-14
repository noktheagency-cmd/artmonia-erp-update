import assert from "node:assert/strict";
import test from "node:test";
import {
  isStudentDebtDue,
  resolveStudentLifecycleStatus,
  resolveStudentPaymentStatus,
} from "./student-debt-status";

function utcDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

test("does not mark a student as debtor before the next payment date", () => {
  const today = utcDate("2026-08-15");
  const nextPaymentAt = utcDate("2026-08-20");

  assert.equal(isStudentDebtDue({ balance: 250, nextPaymentAt, today }), false);
  assert.deepEqual(
    resolveStudentPaymentStatus({ balance: 250, nextPaymentAt, today }),
    { label: "Ödəniş tarixi gözlənilir", tone: "neutral" },
  );
  assert.equal(
    resolveStudentLifecycleStatus({ lifecycleStatus: "DEBT", debtDue: false }),
    "ACTIVE",
  );
});

test("marks a student as debtor when the next payment date is today", () => {
  const today = utcDate("2026-08-15");

  assert.equal(
    isStudentDebtDue({ balance: 250, nextPaymentAt: today, today }),
    true,
  );
  assert.deepEqual(
    resolveStudentPaymentStatus({ balance: 250, nextPaymentAt: today, today }),
    { label: "Qalıq borc", tone: "warning" },
  );
  assert.equal(
    resolveStudentLifecycleStatus({ lifecycleStatus: "ACTIVE", debtDue: true }),
    "DEBT",
  );
});

test("marks a student as overdue after the next payment date", () => {
  assert.deepEqual(
    resolveStudentPaymentStatus({
      balance: 250,
      nextPaymentAt: utcDate("2026-08-14"),
      today: utcDate("2026-08-15"),
    }),
    { label: "Gecikmiş ödəniş", tone: "danger" },
  );
});

test("requires both an outstanding balance and a scheduled payment date", () => {
  const today = utcDate("2026-08-15");

  assert.equal(isStudentDebtDue({ balance: 0, nextPaymentAt: today, today }), false);
  assert.equal(isStudentDebtDue({ balance: 250, nextPaymentAt: null, today }), false);
});
