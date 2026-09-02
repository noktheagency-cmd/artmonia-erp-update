import assert from "node:assert/strict";
import test from "node:test";
import { shouldVoidObsoleteImportedInvoice } from "./obsolete-import-invoice";

const jasminLikeCandidate = {
  studentCreatedAt: new Date("2026-08-14T08:31:41.905Z"),
  previousPaymentMonth: new Date("2025-09-01T00:00:00.000Z"),
  currentPaymentMonth: new Date("2026-08-01T00:00:00.000Z"),
  invoicePeriodMonth: new Date("2025-09-01T00:00:00.000Z"),
  invoiceIdempotencyKey: "student-month-ART-1832-2025-09-01",
  invoiceAmount: 80,
  invoiceBalanceDue: 80,
  allocationCount: 0,
  otherMonthlyPaymentCount: 0,
};

test("voids a fully orphaned selection invoice from before the import month", () => {
  assert.equal(shouldVoidObsoleteImportedInvoice(jasminLikeCandidate), true);
});

test("keeps a legitimate future invoice such as Aliye's September invoice", () => {
  assert.equal(
    shouldVoidObsoleteImportedInvoice({
      ...jasminLikeCandidate,
      studentCreatedAt: new Date("2026-08-20T10:00:00.000Z"),
      previousPaymentMonth: new Date("2026-09-01T00:00:00.000Z"),
      invoicePeriodMonth: new Date("2026-09-01T00:00:00.000Z"),
    }),
    false,
  );
});

test("keeps an invoice that still has an allocation or another monthly payment", () => {
  assert.equal(
    shouldVoidObsoleteImportedInvoice({
      ...jasminLikeCandidate,
      allocationCount: 1,
    }),
    false,
  );
  assert.equal(
    shouldVoidObsoleteImportedInvoice({
      ...jasminLikeCandidate,
      otherMonthlyPaymentCount: 1,
    }),
    false,
  );
});

test("keeps normal scheduled invoices and partially paid invoices", () => {
  assert.equal(
    shouldVoidObsoleteImportedInvoice({
      ...jasminLikeCandidate,
      invoiceIdempotencyKey: "student-gap-ART-1832-enrollment-2025-09-01",
    }),
    false,
  );
  assert.equal(
    shouldVoidObsoleteImportedInvoice({
      ...jasminLikeCandidate,
      invoiceBalanceDue: 40,
    }),
    false,
  );
});
