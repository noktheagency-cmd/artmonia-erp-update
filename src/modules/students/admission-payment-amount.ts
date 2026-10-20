export const MIN_ADMISSION_PAYMENT_AZN = 20;

export const ADMISSION_PAYMENT_MIN_MESSAGE =
  "Minimum 20 AZN ödəniş edilməlidir.";

export function parsePaymentAmount(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

export function isAdmissionAmountBelowMinimum(amount: string, purpose: string) {
  if (purpose !== "ADMISSION") return false;
  const parsed = parsePaymentAmount(amount);
  if (parsed === null) return false;
  return parsed < MIN_ADMISSION_PAYMENT_AZN;
}
