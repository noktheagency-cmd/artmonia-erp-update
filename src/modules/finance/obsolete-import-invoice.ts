import { startOfMonth } from "@/modules/shared/format";

export type ObsoleteImportedInvoiceCandidate = {
  studentCreatedAt: Date;
  previousPaymentMonth: Date;
  currentPaymentMonth: Date;
  invoicePeriodMonth: Date;
  invoiceIdempotencyKey: string | null;
  invoiceAmount: number;
  invoiceBalanceDue: number;
  allocationCount: number;
  otherMonthlyPaymentCount: number;
};

const moneyEquals = (left: number, right: number) =>
  Math.abs(left - right) < 0.005;

/**
 * Detects an invoice that existed only because an imported payment was first
 * assigned to the wrong historical month. Keeping this rule pure makes the
 * destructive decision explicit and independently testable.
 */
export function shouldVoidObsoleteImportedInvoice(
  candidate: ObsoleteImportedInvoiceCandidate,
) {
  if (
    candidate.previousPaymentMonth.getTime() ===
    candidate.currentPaymentMonth.getTime()
  ) {
    return false;
  }

  if (
    candidate.invoicePeriodMonth.getTime() !==
    candidate.previousPaymentMonth.getTime()
  ) {
    return false;
  }

  if (
    candidate.invoicePeriodMonth.getTime() >=
    startOfMonth(candidate.studentCreatedAt).getTime()
  ) {
    return false;
  }

  const isSelectionGenerated =
    candidate.invoiceIdempotencyKey?.startsWith("student-period-") === true ||
    candidate.invoiceIdempotencyKey?.startsWith("student-month-") === true;

  return (
    isSelectionGenerated &&
    moneyEquals(candidate.invoiceAmount, candidate.invoiceBalanceDue) &&
    candidate.allocationCount === 0 &&
    candidate.otherMonthlyPaymentCount === 0
  );
}
