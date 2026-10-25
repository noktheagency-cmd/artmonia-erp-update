import { EnrollmentStatus, type Prisma } from "@/generated/prisma/client";

export function activeMonthlyEnrollmentWhere(periodMonth: Date): Prisma.EnrollmentWhereInput {
  return {
    status: EnrollmentStatus.ACTIVE,
    startDate: { lt: nextBillingMonth(periodMonth) },
  };
}

/** A monthly receipt pays this month's active packages, not superseded packages.
 * Existing historical debt remains payable when no active package covers that month.
 * ONE_TIME receipts intentionally keep their separate oldest-debt allocation policy.
 */
export function monthlyPaymentInvoiceWhere(periodMonth: Date): Prisma.InvoiceWhereInput {
  const activeEnrollment = activeMonthlyEnrollmentWhere(periodMonth);
  return {
    periodMonth,
    OR: [
      { enrollment: { is: activeEnrollment } },
      { student: { is: { enrollments: { none: activeEnrollment } } } },
    ],
  };
}

export function nextBillingMonth(periodMonth: Date) {
  return new Date(Date.UTC(periodMonth.getUTCFullYear(), periodMonth.getUTCMonth() + 1, 1));
}
