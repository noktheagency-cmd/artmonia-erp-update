import assert from "node:assert/strict";
import test from "node:test";
import { InvoiceStatus } from "@/generated/prisma/client";
import {
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
