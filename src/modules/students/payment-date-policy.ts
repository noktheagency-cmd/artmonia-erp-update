import { currentBakuDateValue } from "@/lib/baku-date";

export { currentBakuDateValue } from "@/lib/baku-date";

export const FUTURE_PAYMENT_DATE_ERROR =
  "Ödəniş tarixi gələcək tarix ola bilməz. Faktiki pulun daxil olduğu tarixi seçin.";

export const PAYMENT_MONTH_MISMATCH_WARNING =
  "Ödəniş tarixi ilə xidmət ayı fərqlidir. Davam etmək istəyirsiniz?";

export function parsePaymentDateInput(value: string) {
  const normalized = normalizeDateValue(value);
  if (!normalized || !isValidIsoDate(normalized)) {
    throw new Error("Ödəniş tarixi düzgün deyil");
  }
  if (normalized > currentBakuDateValue()) {
    throw new Error(FUTURE_PAYMENT_DATE_ERROR);
  }

  return new Date(`${normalized}T00:00:00.000Z`);
}

export function paymentMonthDiffersFromPaidDate(
  paidDate: string | Date,
  paymentMonth: string | Date,
) {
  const paidMonth = typeof paidDate === "string"
    ? normalizeDateValue(paidDate)?.slice(0, 7)
    : paidDate.toISOString().slice(0, 7);
  const serviceMonth = typeof paymentMonth === "string"
    ? paymentMonth.trim().slice(0, 7)
    : paymentMonth.toISOString().slice(0, 7);

  return Boolean(paidMonth && serviceMonth && paidMonth !== serviceMonth);
}

export function assertPaymentMonthMismatchAcknowledged(input: {
  paidAt: Date;
  paymentMonth: Date;
  acknowledged: boolean;
}) {
  if (
    paymentMonthDiffersFromPaidDate(input.paidAt, input.paymentMonth)
    && !input.acknowledged
  ) {
    throw new Error(PAYMENT_MONTH_MISMATCH_WARNING);
  }
}

function normalizeDateValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const azMatch = trimmed.match(/^(\d{2})[./](\d{2})[./](\d{4})$/);
  if (!azMatch) return null;
  const [, day, month, year] = azMatch;
  return `${year}-${month}-${day}`;
}

function isValidIsoDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return false;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}
