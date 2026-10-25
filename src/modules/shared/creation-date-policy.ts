import { currentBakuDateValue } from "@/lib/baku-date";

export function currentBakuMonthStart(now = new Date()) {
  return `${currentBakuDateValue(now).slice(0, 7)}-01`;
}

type CreationDate = {
  label: string;
  // Date objects here represent stored date-only values (UTC calendar dates).
  value: string | Date | null | undefined;
};

export function assertCreationDatesAllowed(dates: readonly CreationDate[], now = new Date()) {
  const earliestDate = currentBakuMonthStart(now);
  for (const { label, value } of dates) {
    if (value == null) continue;
    const date = normalizeCreationDate(value);
    if (!date) throw new Error(`${label} düzgün deyil.`);
    if (date < earliestDate) {
      throw new Error(`${label} cari aydan əvvəlki aya aid ola bilməz. Cari və ya gələcək ayı seçin.`);
    }
  }
}

function normalizeCreationDate(value: string | Date) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }
  const trimmed = value.trim();
  const azDate = trimmed.match(/^(\d{2})[./](\d{2})[./](\d{4})$/);
  const normalized = azDate
    ? `${azDate[3]}-${azDate[2]}-${azDate[1]}`
    : /^\d{4}-\d{2}$/.test(trimmed) ? `${trimmed}-01` : trimmed;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === normalized
    ? normalized
    : null;
}
