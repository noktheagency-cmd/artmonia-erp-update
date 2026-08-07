const MINUTES_IN_DAY = 24 * 60;
const LAST_FULL_HOUR = 23 * 60;

export const bakuTimeOptions = Array.from(
  { length: MINUTES_IN_DAY / 30 },
  (_, index) => minutesToTime(index * 30),
);

export function buildPlannerTimeAxis(
  slots: Array<{ startTime: string; endTime: string }>,
) {
  if (!slots.length) return [];

  const starts = slots.map((slot) => timeToMinutes(slot.startTime));
  const ends = slots.map((slot) => timeToMinutes(slot.endTime));
  const earliest = Math.floor(Math.min(...starts) / 60) * 60;
  const latest = Math.min(Math.ceil(Math.max(...ends) / 60) * 60, LAST_FULL_HOUR);
  const values = new Set(slots.map((slot) => slot.startTime));

  for (let minute = earliest; minute <= latest; minute += 60) {
    values.add(minutesToTime(minute));
  }

  return [...values].toSorted((left, right) => timeToMinutes(left) - timeToMinutes(right));
}

function timeToMinutes(value: string) {
  const [hour = "0", minute = "0"] = value.split(":");
  return Number(hour) * 60 + Number(minute);
}

function minutesToTime(value: number) {
  const hour = Math.floor(value / 60);
  const minute = value % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
