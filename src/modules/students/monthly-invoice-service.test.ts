import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@/generated/prisma/client";
import { ensureStudentMonthlyInvoicesForPeriod } from "./monthly-invoice-service";
import { billingDateForMonth } from "./payment-billing-period";

function utcDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

test("prepayment anchors billing to the confirmed first lesson before activation", async () => {
  const studentUpdates: unknown[] = [];
  let invoiceCreate: unknown;
  let studentReadCount = 0;
  const firstLessonAt = utcDate("2026-08-28");

  const tx = {
    student: {
      findUnique: async () => {
        studentReadCount += 1;
        if (studentReadCount === 1) {
          return {
            code: "ART-1133",
            billingAnchorDate: null,
            originalFirstLessonAt: firstLessonAt,
            enrollments: [{
              id: "enrollment-1",
              startDate: firstLessonAt,
              firstLessonAt,
              monthlyFee: 149,
              lessonsPerMonth: 8,
              discountType: null,
            }],
          };
        }

        return { billingAnchorDate: firstLessonAt };
      },
      updateMany: async (args: unknown) => {
        studentUpdates.push(args);
        return { count: 1 };
      },
    },
    invoice: {
      findFirst: async () => null,
      create: async (args: unknown) => {
        invoiceCreate = args;
      },
    },
    $queryRaw: async (query: Prisma.Sql) => query.sql.includes("student_payment_due_date")
      ? [{ enrollmentId: "enrollment-1", dueDate: firstLessonAt, billable: true }]
      : [],
  } as unknown as Prisma.TransactionClient;

  const periodMonth = await ensureStudentMonthlyInvoicesForPeriod(tx, {
    studentId: "student-1",
    requestedPeriodMonth: utcDate("2026-08-01"),
    asOfDate: utcDate("2026-08-25"),
  });

  assert.equal(periodMonth.toISOString().slice(0, 10), "2026-08-01");
  assert.deepEqual(studentUpdates, [
    {
      where: { id: "student-1", billingAnchorDate: null },
      data: { billingAnchorDate: firstLessonAt },
    },
    {
      where: { id: "student-1", originalFirstLessonAt: null },
      data: { originalFirstLessonAt: firstLessonAt },
    },
  ]);
  assert.deepEqual(invoiceCreate, {
    data: {
      studentId: "student-1",
      enrollmentId: "enrollment-1",
      periodMonth: utcDate("2026-08-01"),
      issueDate: firstLessonAt,
      dueDate: firstLessonAt,
      amount: 149,
      balanceDue: 149,
      status: "OPEN",
      idempotencyKey: "student-period-ART-1133-enrollment-1-2026-08-01",
    },
  });
});

test("prepayment is rejected when no first lesson has been confirmed", async () => {
  const tx = {
    student: {
      findUnique: async () => ({
        code: "ART-0001",
        billingAnchorDate: null,
        originalFirstLessonAt: null,
        enrollments: [{
          id: "enrollment-1",
          startDate: utcDate("2026-08-01"),
          firstLessonAt: null,
          monthlyFee: 149,
          lessonsPerMonth: 8,
          discountType: null,
        }],
      }),
    },
  } as unknown as Prisma.TransactionClient;

  await assert.rejects(
    ensureStudentMonthlyInvoicesForPeriod(tx, {
      studentId: "student-1",
      requestedPeriodMonth: utcDate("2026-08-01"),
      asOfDate: utcDate("2026-08-25"),
    }),
    /təsdiqlənmiş ilk dərs tarixi yoxdur/,
  );
});

test("31-day billing anchors use month end without losing the original anchor", () => {
  const anchor = utcDate("2026-01-31");

  assert.equal(
    billingDateForMonth(utcDate("2026-02-01"), anchor).toISOString().slice(0, 10),
    "2026-02-28",
  );
  assert.equal(
    billingDateForMonth(utcDate("2026-03-01"), anchor).toISOString().slice(0, 10),
    "2026-03-31",
  );
});
