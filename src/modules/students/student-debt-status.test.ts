import assert from "node:assert/strict";
import test from "node:test";
import {
  isStudentDebtDue,
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
    { code: "UPCOMING", label: "Gələcək ödəniş", tone: "neutral" },
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
    { code: "DUE", label: "Ödəniş günü çatıb", tone: "warning" },
  );
});

test("marks a student as overdue after the next payment date", () => {
  assert.deepEqual(
    resolveStudentPaymentStatus({
      balance: 250,
      nextPaymentAt: utcDate("2026-08-14"),
      today: utcDate("2026-08-15"),
    }),
    { code: "OVERDUE", label: "Gecikib", tone: "danger" },
  );
});

test("uses the 3+ overdue status after three full days", () => {
  assert.deepEqual(
    resolveStudentPaymentStatus({
      balance: 250,
      nextPaymentAt: utcDate("2026-08-12"),
      today: utcDate("2026-08-15"),
    }),
    { code: "OVERDUE_3_PLUS", label: "3+ gün gecikib", tone: "danger" },
  );
});

test("treats an unscheduled outstanding balance as actionable debt", () => {
  const today = utcDate("2026-08-15");

  assert.equal(isStudentDebtDue({ balance: 0, nextPaymentAt: today, today }), false);
  assert.equal(isStudentDebtDue({ balance: 250, nextPaymentAt: null, today }), true);
  assert.deepEqual(
    resolveStudentPaymentStatus({ balance: 250, nextPaymentAt: null, today }),
    { code: "DUE", label: "Ödəniş gözləyir", tone: "warning" },
  );
});
