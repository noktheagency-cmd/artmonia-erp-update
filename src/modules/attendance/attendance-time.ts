const BAKU_UTC_OFFSET_MINUTES = 4 * 60;

export type AttendanceWindowPolicy = {
  opensMinutesBefore: number;
  closesMinutesAfter: number;
};

export function buildAttendanceWindow(
  sessionDate: Date | string,
  startTime: string,
  endTime: string,
  policy: AttendanceWindowPolicy,
) {
  const date = typeof sessionDate === "string"
    ? sessionDate.slice(0, 10)
    : sessionDate.toISOString().slice(0, 10);
  const startsAt = bakuLocalDateTimeToUtc(date, startTime);
  const endsAt = bakuLocalDateTimeToUtc(date, endTime);

  return {
    startsAt,
    endsAt,
    opensAt: new Date(startsAt.getTime() - policy.opensMinutesBefore * 60_000),
    closesAt: new Date(endsAt.getTime() + policy.closesMinutesAfter * 60_000),
  };
}

export function bakuLocalDateTimeToUtc(date: string, time: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - BAKU_UTC_OFFSET_MINUTES * 60_000);
}

export function formatBakuIso(value: Date) {
  const local = new Date(value.getTime() + BAKU_UTC_OFFSET_MINUTES * 60_000);
  return `${local.toISOString().slice(0, 19)}+04:00`;
}

export function formatBakuTime(value: Date) {
  return formatBakuIso(value).slice(11, 16);
}

export function attendanceWindowState(now: Date, opensAt: Date, closesAt: Date) {
  if (now < opensAt) return "NOT_OPEN" as const;
  if (now > closesAt) return "CLOSED" as const;
  return "OPEN" as const;
}
