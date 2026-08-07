export const STUDENT_REMINDER_ENTITY_TYPE = "student";

export const studentReminderKinds = ["PAYMENT", "GENERAL"] as const;

export type StudentReminderKind = (typeof studentReminderKinds)[number];

export const studentReminderMeta: Record<
  StudentReminderKind,
  { label: string; taskType: string }
> = {
  PAYMENT: {
    label: "Ödəniş xatırlatması",
    taskType: "student_payment_reminder",
  },
  GENERAL: {
    label: "Ümumi bildiriş",
    taskType: "student_general_reminder",
  },
};

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const AZ_DATE_PATTERN = /^(\d{2})[./](\d{2})[./](\d{4})$/;

export function getStudentReminderKind(taskType: string): StudentReminderKind | null {
  const entry = Object.entries(studentReminderMeta).find(
    ([, meta]) => meta.taskType === taskType,
  );

  return (entry?.[0] as StudentReminderKind | undefined) ?? null;
}

export function parseStudentReminderDate(value: string) {
  const trimmed = value.trim();
  const isoMatch = trimmed.match(ISO_DATE_PATTERN);
  const azMatch = trimmed.match(AZ_DATE_PATTERN);
  const parts = isoMatch
    ? [Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3])]
    : azMatch
      ? [Number(azMatch[3]), Number(azMatch[2]), Number(azMatch[1])]
      : null;

  if (!parts) {
    throw new Error("Xatırlatma tarixi düzgün deyil");
  }

  const [year, month, day] = parts;
  const date = new Date(Date.UTC(year, month - 1, day, 12));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error("Xatırlatma tarixi düzgün deyil");
  }

  return date;
}

export function getBakuDateInput(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Baku",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = new Map(parts.map((part) => [part.type, part.value]));

  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

export function getReminderDayRange(dateInput: string) {
  const dueAt = parseStudentReminderDate(dateInput);
  const start = new Date(dueAt);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  return { start, end };
}
