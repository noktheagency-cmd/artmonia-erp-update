export function isCalendarMonthAllowed(month: string, min?: string, max?: string) {
  return !(min && month < min.slice(0, 7)) && !(max && month > max.slice(0, 7));
}

export function clampCalendarMonth(month: string, min?: string, max?: string) {
  if (min && month < min.slice(0, 7)) return min.slice(0, 7);
  if (max && month > max.slice(0, 7)) return max.slice(0, 7);
  return month;
}

export function calendarYearOptions(viewYear: number, min?: string, max?: string) {
  const start = Math.max(viewYear - 8, min ? Number(min.slice(0, 4)) : viewYear - 8);
  const end = Math.min(viewYear + 8, max ? Number(max.slice(0, 4)) : viewYear + 8);
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);
}
