import {
  dateFromInput,
  toDateInput,
  weekdayFromDate,
  type GroupWeekdayCode,
} from "@/modules/groups/shared";

export function recentScheduledDates(input: {
  weekday: GroupWeekdayCode;
  validFrom: string;
  today: string;
  limit?: number;
}) {
  const limit = Math.max(1, Math.min(Math.trunc(input.limit ?? 12), 52));
  const cursor = dateFromInput(input.today);
  const dates: string[] = [];

  for (let offset = 0; dates.length < limit && offset < 370; offset += 1) {
    const candidate = new Date(cursor);
    candidate.setUTCDate(cursor.getUTCDate() - offset);
    const value = toDateInput(candidate);
    if (value < input.validFrom) break;
    if (weekdayFromDate(value) === input.weekday) dates.push(value);
  }

  return dates;
}

export function canEditAttendanceToday(input: {
  today: string;
  weekday: GroupWeekdayCode;
  validFrom: string;
  hasTeacher: boolean;
  sessionStatus?: "SCHEDULED" | "COMPLETED" | "CANCELLED" | "RESCHEDULED";
}) {
  if (!input.hasTeacher) return { canEdit: false, reason: "Slota müəllim təyin edilməyib" };
  if (input.today < input.validFrom) return { canEdit: false, reason: "Slotun başlanğıc tarixi çatmayıb" };
  if (weekdayFromDate(input.today) !== input.weekday) {
    return { canEdit: false, reason: "Bu gün bu slot üzrə dərs yoxdur" };
  }
  if (input.sessionStatus === "CANCELLED") {
    return { canEdit: false, reason: "Bugünkü dərs ləğv edilib" };
  }
  return { canEdit: true, reason: null };
}
