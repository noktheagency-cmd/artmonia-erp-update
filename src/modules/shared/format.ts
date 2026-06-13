const amountFormatter = new Intl.NumberFormat("az-AZ", {
  maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat("az-AZ", {
  day: "2-digit",
  month: "short",
});

const monthFormatter = new Intl.DateTimeFormat("az-AZ", {
  month: "short",
});

const topbarDateFormatter = new Intl.DateTimeFormat("az-AZ", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Baku",
});

export function toNumber(value: unknown) {
  if (value === null || value === undefined) {
    return 0;
  }

  return Number(value);
}

export function formatAmount(value: unknown) {
  return `${amountFormatter.format(toNumber(value))} AZN`;
}

export function formatCount(value: number) {
  return amountFormatter.format(value);
}

export function formatShortDate(value: Date | string | null | undefined) {
  if (!value) {
    return "-";
  }

  return dateFormatter.format(new Date(value));
}

export function formatMonth(value: Date | string) {
  return monthFormatter.format(new Date(value));
}

export function formatTodayLabel(value = new Date()) {
  return `Bu gün, ${topbarDateFormatter.format(value)}`;
}

export function startOfMonth(reference = new Date()) {
  return new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1));
}

export function addMonths(reference: Date, amount: number) {
  const next = new Date(reference);
  next.setUTCMonth(next.getUTCMonth() + amount);
  return next;
}
