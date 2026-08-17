export const groupWeekdays = {
  MONDAY: "MONDAY",
  TUESDAY: "TUESDAY",
  WEDNESDAY: "WEDNESDAY",
  THURSDAY: "THURSDAY",
  FRIDAY: "FRIDAY",
  SATURDAY: "SATURDAY",
  SUNDAY: "SUNDAY",
} as const;

export type GroupWeekdayCode = (typeof groupWeekdays)[keyof typeof groupWeekdays];

export const weekdayMeta: Record<
  GroupWeekdayCode,
  { label: string; shortLabel: string; index: number }
> = {
  [groupWeekdays.MONDAY]: { label: "Bazar ertəsi", shortLabel: "B.e.", index: 1 },
  [groupWeekdays.TUESDAY]: { label: "Çərşənbə axşamı", shortLabel: "Ç.a.", index: 2 },
  [groupWeekdays.WEDNESDAY]: { label: "Çərşənbə", shortLabel: "Ç.", index: 3 },
  [groupWeekdays.THURSDAY]: { label: "Cümə axşamı", shortLabel: "C.a.", index: 4 },
  [groupWeekdays.FRIDAY]: { label: "Cümə", shortLabel: "C.", index: 5 },
  [groupWeekdays.SATURDAY]: { label: "Şənbə", shortLabel: "Ş.", index: 6 },
  [groupWeekdays.SUNDAY]: { label: "Bazar", shortLabel: "B.", index: 0 },
};

export const orderedWeekdays = Object.values(groupWeekdays).toSorted(
  (left, right) => {
    const leftOrder = weekdayMeta[left].index === 0 ? 7 : weekdayMeta[left].index;
    const rightOrder = weekdayMeta[right].index === 0 ? 7 : weekdayMeta[right].index;
    return leftOrder - rightOrder;
  }
);

export function todayInBaku() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Baku",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function dateFromInput(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

export function toDateInput(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().slice(0, 10);
}

export function weekdayFromDate(value: string) {
  const index = dateFromInput(value).getUTCDay();
  return (
    Object.values(groupWeekdays).find((weekday) => weekdayMeta[weekday].index === index) ??
    groupWeekdays.MONDAY
  );
}

export function formatDateAz(value: string | Date) {
  return new Intl.DateTimeFormat("az-AZ", {
    timeZone: "UTC",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(value instanceof Date ? value : dateFromInput(value));
}

export function formatNumericDateAz(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}.${month}.${year}` : value;
}

export function latestScheduledDate(
  weekdays: GroupWeekdayCode[],
  requested?: string,
  today = todayInBaku()
) {
  const allowed = new Set(weekdays);
  if (
    requested &&
    /^\d{4}-\d{2}-\d{2}$/.test(requested) &&
    requested <= today &&
    allowed.has(weekdayFromDate(requested))
  ) {
    return requested;
  }

  const cursor = dateFromInput(today);
  for (let offset = 0; offset < 14; offset += 1) {
    const candidate = new Date(cursor);
    candidate.setUTCDate(cursor.getUTCDate() - offset);
    const value = toDateInput(candidate);
    if (allowed.has(weekdayFromDate(value))) {
      return value;
    }
  }

  return today;
}
