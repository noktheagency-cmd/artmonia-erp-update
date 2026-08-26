export function resolvePaymentBillingPeriod({
  requestedMonth,
  billingAnchorDate,
}: {
  requestedMonth: Date;
  billingAnchorDate: Date | null | undefined;
}) {
  const requested = startOfUtcMonth(requestedMonth);
  if (!billingAnchorDate) return requested;

  const firstBillingMonth = startOfUtcMonth(billingAnchorDate);
  return requested < firstBillingMonth ? firstBillingMonth : requested;
}

export function billingDateForMonth(periodMonth: Date, billingAnchorDate: Date) {
  const period = startOfUtcMonth(periodMonth);
  const lastDay = new Date(Date.UTC(
    period.getUTCFullYear(),
    period.getUTCMonth() + 1,
    0,
  )).getUTCDate();

  return new Date(Date.UTC(
    period.getUTCFullYear(),
    period.getUTCMonth(),
    Math.min(billingAnchorDate.getUTCDate(), lastDay),
  ));
}

export function parseBillingMonthInput(value: string | null | undefined, fallbackDate: Date) {
  if (!value) return startOfUtcMonth(fallbackDate);
  if (!/^\d{4}-\d{2}$/.test(value)) {
    throw new Error("Ödənişin aid olduğu ay düzgün deyil");
  }

  const [yearText, monthText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isInteger(year) || month < 1 || month > 12) {
    throw new Error("Ödənişin aid olduğu ay düzgün deyil");
  }

  return new Date(Date.UTC(year, month - 1, 1));
}

export function formatBillingMonthInput(value: Date) {
  return startOfUtcMonth(value).toISOString().slice(0, 7);
}

function startOfUtcMonth(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
}
