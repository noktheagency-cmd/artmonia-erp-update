const BAKU_UTC_OFFSET_MS = 4 * 60 * 60 * 1_000;

export function formatBakuDate(value: Date | string) {
  const date = toBakuClock(value);
  return `${pad(date.getUTCDate())}.${pad(date.getUTCMonth() + 1)}.${date.getUTCFullYear()}`;
}

export function formatBakuDateTime(value: Date | string) {
  const date = toBakuClock(value);
  return `${formatBakuDate(value)}, ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

function toBakuClock(value: Date | string) {
  return new Date(new Date(value).getTime() + BAKU_UTC_OFFSET_MS);
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}
