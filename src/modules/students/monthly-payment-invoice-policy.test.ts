import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@/generated/prisma/client";
import { activeMonthlyEnrollmentWhere, monthlyPaymentInvoiceWhere, nextBillingMonth } from "./monthly-payment-invoice-policy";
import { ensureStudentMonthlyInvoicesForPeriod } from "./monthly-invoice-service";

const date = (value: string) => new Date(`${value}T00:00:00Z`);

test("monthly allocation excludes superseded packages while retaining historical-debt fallback", () => {
  const month = date("2026-10-01");
  const active = { status: "ACTIVE", startDate: { lt: date("2026-11-01") } };
  assert.deepEqual(activeMonthlyEnrollmentWhere(month), active);
  assert.deepEqual(monthlyPaymentInvoiceWhere(month), {
    periodMonth: month,
    OR: [
      { enrollment: { is: active } },
      { student: { is: { enrollments: { none: active } } } },
    ],
  });
  assert.equal(nextBillingMonth(date("2026-12-01")).toISOString(), date("2027-01-01").toISOString());
});

function monthlyTx(options: { paused?: boolean; status?: string; start?: string; billable?: boolean } = {}) {
  const created: Array<{ data: { enrollmentId: string; amount: number } }> = [];
  const seen: string[] = [];
  const tx = {
    student: { findUnique: async (args: { select: { enrollments: { where: { status: string } } } }) => {
      // This is the database boundary: a stale PAUSED package must not be requested.
      assert.equal(args.select.enrollments.where.status, "ACTIVE");
      return {
        code: "ART-TEST", lifecycleStatus: options.status ?? "ACTIVE", billingPaused: options.paused ?? false,
        billingAnchorDate: date("2026-04-01"), originalFirstLessonAt: date("2026-04-01"),
        enrollments: [{ id: "new-package", startDate: date(options.start ?? "2026-09-27"), firstLessonAt: date("2026-09-27"), monthlyFee: 79, lessonsPerMonth: 4, discountType: null }],
      };
    } },
    invoice: {
      findFirst: async (args: { where: { enrollmentId: string } }) => { seen.push(args.where.enrollmentId); return null; },
      create: async (args: { data: { enrollmentId: string; amount: number } }) => { created.push(args); },
    },
    $queryRaw: async (query: Prisma.Sql) => query.sql.includes("student_payment_due_date")
      ? [{ dueDate: date("2026-10-27"), billable: options.billable ?? true }]
      : [],
  } as unknown as Prisma.TransactionClient;
  return { tx, created, seen };
}

test("recording a payment creates only the active replacement package's fee", async () => {
  const state = monthlyTx();
  await ensureStudentMonthlyInvoicesForPeriod(state.tx, { studentId: "student-test", requestedPeriodMonth: date("2026-10-01"), asOfDate: date("2026-10-04") });
  assert.deepEqual(state.seen, ["new-package"]);
  assert.deepEqual(state.created.map(({ data }) => ({ id: data.enrollmentId, amount: data.amount })), [{ id: "new-package", amount: 79 }]);
});

test("a later package is not billed when settling an earlier month's debt", async () => {
  const state = monthlyTx({ start: "2026-10-04" });
  await ensureStudentMonthlyInvoicesForPeriod(state.tx, { studentId: "student-test", requestedPeriodMonth: date("2026-09-01"), asOfDate: date("2026-10-04") });
  assert.deepEqual(state.created, []);
  assert.deepEqual(state.seen, []);
});

test("paused and stopped students can settle history without opening another invoice", async () => {
  for (const options of [{ paused: true }, { status: "STOPPED" }]) {
    const state = monthlyTx(options);
    await ensureStudentMonthlyInvoicesForPeriod(state.tx, { studentId: "student-test", requestedPeriodMonth: date("2026-10-01"), asOfDate: date("2026-10-04") });
    assert.deepEqual(state.created, []);
  }
});

test("a historically non-billable freeze month is not recreated after return", async () => {
  const state = monthlyTx({ billable: false });
  await ensureStudentMonthlyInvoicesForPeriod(state.tx, { studentId: "student-test", requestedPeriodMonth: date("2026-10-01"), asOfDate: date("2026-10-04") });
  assert.deepEqual(state.created, []);
});

test("seat-reserving freeze continues to bill its active package", async () => {
  const state = monthlyTx({ status: "FROZEN", billable: true });
  await ensureStudentMonthlyInvoicesForPeriod(state.tx, { studentId: "student-test", requestedPeriodMonth: date("2026-10-01"), asOfDate: date("2026-10-04") });
  assert.equal(state.created.length, 1);
});
