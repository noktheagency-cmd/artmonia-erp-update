const BAKU_OFFSET_MS = 4 * 60 * 60 * 1000;

export type MarketingDateRange = {
  from: string;
  to: string;
  defaultFrom: string;
  defaultTo: string;
  rangeStart: Date;
  rangeEndExclusive: Date;
  businessStart: Date;
  businessEnd: Date;
  days: number;
};

export function resolveMarketingDateRange(
  filters?: { from?: string; to?: string },
  reference = new Date(),
): MarketingDateRange {
  const currentBakuDate = bakuDateKey(reference);
  const defaultFrom = `${currentBakuDate.slice(0, 7)}-01`;
  const [year, month] = defaultFrom.split("-").map(Number);
  const monthLastDay = new Date(Date.UTC(year!, month!, 0)).getUTCDate();
  const defaultTo = `${currentBakuDate.slice(0, 7)}-${String(monthLastDay).padStart(2, "0")}`;
  const requestedFrom = validMarketingDateKey(filters?.from) ? filters.from : defaultFrom;
  const requestedTo = validMarketingDateKey(filters?.to) ? filters.to : defaultTo;
  const from = requestedFrom <= requestedTo ? requestedFrom : requestedTo;
  const to = requestedFrom <= requestedTo ? requestedTo : requestedFrom;
  const rangeStart = new Date(`${from}T00:00:00.000Z`);
  const rangeEndExclusive = new Date(`${to}T00:00:00.000Z`);
  rangeEndExclusive.setUTCDate(rangeEndExclusive.getUTCDate() + 1);
  const businessStart = new Date(rangeStart.getTime() - BAKU_OFFSET_MS);
  const businessEnd = new Date(rangeEndExclusive.getTime() - BAKU_OFFSET_MS);
  const days = Math.round((rangeEndExclusive.getTime() - rangeStart.getTime()) / 86_400_000);

  return {
    from,
    to,
    defaultFrom,
    defaultTo,
    rangeStart,
    rangeEndExclusive,
    businessStart,
    businessEnd,
    days,
  };
}

export function validMarketingDateKey(value?: string): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function bakuDateKey(value: Date) {
  return new Date(value.getTime() + BAKU_OFFSET_MS).toISOString().slice(0, 10);
}
