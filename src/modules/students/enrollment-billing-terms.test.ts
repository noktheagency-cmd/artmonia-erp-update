import assert from "node:assert/strict";
import test from "node:test";
import { InvoiceStatus, type Prisma } from "@/generated/prisma/client";
import {
  applyEnrollmentBillingChange,
  parseEnrollmentBillingMonth,
  resolveRepricedInvoice,
} from "./enrollment-billing-terms";

test("Gülpəri: 75 AZN allocation settles the repriced 75 AZN invoice", () => {
  assert.deepEqual(
    resolveRepricedInvoice({
      amount: 75,
      allocatedAmount: 75,
      dueDate: new Date("2026-08-05T00:00:00.000Z"),
      today: new Date("2026-09-02T00:00:00.000Z"),
    }),
    { amount: 75, balanceDue: 0, status: InvoiceStatus.PAID },
  );
});

test("Aysel: a one-month 50 AZN term settles July without changing August", () => {
  assert.deepEqual(
    resolveRepricedInvoice({
      amount: 50,
      allocatedAmount: 50,
      dueDate: new Date("2026-07-19T00:00:00.000Z"),
      today: new Date("2026-09-02T00:00:00.000Z"),
    }),
    { amount: 50, balanceDue: 0, status: InvoiceStatus.PAID },
  );
});

test("an unpaid past invoice becomes overdue after repricing", () => {
  assert.deepEqual(
    resolveRepricedInvoice({
      amount: 100,
      allocatedAmount: 0,
      dueDate: new Date("2026-08-19T00:00:00.000Z"),
      today: new Date("2026-09-02T00:00:00.000Z"),
    }),
    { amount: 100, balanceDue: 100, status: InvoiceStatus.OVERDUE },
  );
});

test("a paid 100 AZN invoice becomes 130 AZN due when its monthly fee rises to 230 AZN", async () => {
  const periodMonth = new Date("2026-09-01T00:00:00.000Z");
  const dueDate = new Date("2026-09-15T00:00:00.000Z");
  const invoiceUpdates: Array<{ where: { id: string }; data: unknown }> = [];
  let termQueryCount = 0;
  const tx = {
    $queryRaw: async () => {
      termQueryCount += 1;
      return termQueryCount === 2
        ? [{ id: "term-1" }]
        : [{ monthlyFee: termQueryCount === 1 ? 100 : 230, lessonsPerMonth: 12, discountType: null }];
    },
    invoice: {
      findMany: async () => [{
        id: "invoice-1",
        periodMonth,
        dueDate,
        amount: 100,
        balanceDue: 0,
        status: InvoiceStatus.PAID,
        paymentAllocations: [{ amountAllocated: 100 }],
      }],
      update: async (args: { where: { id: string }; data: unknown }) => {
        invoiceUpdates.push(args);
      },
    },
    auditLog: { create: async () => undefined },
  } as unknown as Prisma.TransactionClient;

  const result = await applyEnrollmentBillingChange(tx, {
    actorUserId: "actor-1",
    studentId: "student-1",
    studentCode: "ST-1",
    enrollmentId: "enrollment-1",
    effectiveMonth: periodMonth,
    mode: "FROM_MONTH",
    previousMonthlyFee: 100,
    previousLessonsPerMonth: 8,
    previousDiscountType: null,
    monthlyFee: 230,
    lessonsPerMonth: 12,
    discountType: null,
    reason: "Həftəlik dərs sayı artırıldı",
    today: new Date("2026-09-10T00:00:00.000Z"),
  });

  assert.deepEqual(result.repricedInvoiceIds, ["invoice-1"]);
  assert.deepEqual(invoiceUpdates, [{
    where: { id: "invoice-1" },
    data: { amount: 230, balanceDue: 130, status: InvoiceStatus.PARTIAL },
  }]);
});

test("a term cannot silently turn an already allocated amount into overpayment", () => {
  assert.throws(
    () => resolveRepricedInvoice({
      amount: 75,
      allocatedAmount: 100,
      dueDate: new Date("2026-08-05T00:00:00.000Z"),
      today: new Date("2026-09-02T00:00:00.000Z"),
    }),
    /Artıq ödəniş/,
  );
});

test("billing month parsing accepts real months and rejects malformed input", () => {
  assert.equal(
    parseEnrollmentBillingMonth("2026-08").toISOString(),
    "2026-08-01T00:00:00.000Z",
  );
  assert.throws(() => parseEnrollmentBillingMonth("2026-13"));
});
