"use client";

import {
  PAYMENT_MONTH_MISMATCH_WARNING,
  paymentMonthDiffersFromPaidDate,
} from "@/modules/students/payment-date-policy";

export function confirmPaymentMonthMismatch(formData: FormData, input?: {
  paidDateField?: string;
  paymentMonthField?: string;
}) {
  const paidDate = String(formData.get(input?.paidDateField ?? "paidDate") ?? "");
  const paymentMonth = String(formData.get(input?.paymentMonthField ?? "billingMonth") ?? "");
  if (!paymentMonthDiffersFromPaidDate(paidDate, paymentMonth)) {
    formData.set("paymentMonthMismatchAcknowledged", "false");
    return true;
  }

  const confirmed = window.confirm(PAYMENT_MONTH_MISMATCH_WARNING);
  formData.set("paymentMonthMismatchAcknowledged", confirmed ? "true" : "false");
  return confirmed;
}
