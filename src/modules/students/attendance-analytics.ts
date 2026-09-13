import { z } from "zod";

const day = 86_400_000;
const dateSchema = z.iso.date();
export const attendancePeriodSchema = z.object({ from: dateSchema, to: dateSchema }).refine(
  ({ from, to }) => from <= to && (Date.parse(to) - Date.parse(from)) / day < 93,
  { message: "Dövr ən çox 93 gün olmalıdır və başlanğıc bitmə tarixindən sonra ola bilməz." },
);

export function attendancePeriod(input: unknown, today: string) {
  const period = attendancePeriodSchema.parse(input);
  if (period.to > today) throw new Error("Gələcək tarix seçilə bilməz.");
  const days = (Date.parse(period.to) - Date.parse(period.from)) / day + 1;
  return { ...period, previousFrom: new Date(Date.parse(period.from) - days * day).toISOString().slice(0, 10), previousTo: new Date(Date.parse(period.from) - day).toISOString().slice(0, 10) };
}

export type AttendanceEntry = {
  sessionId: string; date: string; time: string;
  teacherId: string; teacher: string; groupId: string; group: string;
  studentId: string; student: string; enrollmentId: string;
  status: "PRESENT" | "ABSENT" | "EXCUSED" | null;
};

export function attendanceStats(entries: AttendanceEntry[]) {
  const present = entries.filter((e) => e.status === "PRESENT").length;
  const absent = entries.filter((e) => e.status === "ABSENT").length;
  const excused = entries.filter((e) => e.status === "EXCUSED").length;
  const missing = entries.filter((e) => e.status === null);
  const students = new Map<string, AttendanceEntry[]>();
  for (const entry of entries) {
    const key = `${entry.teacherId}:${entry.studentId}`;
    const history = students.get(key) ?? [];
    history.push(entry);
    students.set(key, history);
  }
  const risky = new Set<string>();
  for (const history of students.values()) {
    if (consecutiveAbsences(history) >= 3) risky.add(history[0].studentId);
  }
  return {
    present, absent, excused, expected: entries.length,
    rate: present + absent ? Math.round(present / (present + absent) * 100) : null,
    missing: missing.length, missingSessions: new Set(missing.map((e) => e.sessionId)).size,
    completeness: entries.length ? Math.round((entries.length - missing.length) / entries.length * 100) : null,
    students: new Set(entries.map((e) => e.studentId)).size, risky: risky.size,
  };
}

export function consecutiveAbsences(entries: AttendanceEntry[]) {
  const sorted = [...entries].sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
  let count = 0;
  for (const entry of sorted) {
    // Unknown/excused lessons break the confirmed consecutive absence sequence.
    if (entry.status !== "ABSENT") break;
    count++;
  }
  return count;
}

export function attendanceTeachers(entries: AttendanceEntry[]) {
  const teachers = new Map<string, { id: string; name: string; entries: AttendanceEntry[] }>();
  for (const entry of entries) {
    const teacher = teachers.get(entry.teacherId) ?? { id: entry.teacherId, name: entry.teacher, entries: [] };
    teacher.entries.push(entry);
    teachers.set(entry.teacherId, teacher);
  }
  return [...teachers.values()].map(({ id, name, entries: rows }) => ({ id, name, ...attendanceStats(rows) }))
    .sort((a, b) => (a.rate ?? 101) - (b.rate ?? 101) || a.name.localeCompare(b.name, "az"));
}

export type AttendanceReport = {
  from: string; to: string; previousFrom: string; previousTo: string;
  entries: AttendanceEntry[]; previousRate: number | null;
};
