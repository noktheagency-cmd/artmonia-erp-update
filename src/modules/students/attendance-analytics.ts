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

/** Terminal / paused statuses are churn outcomes, not early-warning risk. */
const RISK_EXCLUDED_LIFECYCLES = new Set(["FROZEN", "STOPPED", "DECLINED", "COMPLETED"]);

export type AttendanceEntry = {
  sessionId: string; date: string; time: string;
  teacherId: string; teacher: string; groupId: string; group: string;
  studentId: string; student: string; enrollmentId: string;
  status: "PRESENT" | "ABSENT" | "EXCUSED" | null;
  /** Current lifecycle on the student card; used to keep risk actionable. */
  lifecycleStatus: string;
};

export function isRiskEligibleLifecycle(lifecycleStatus: string | null | undefined) {
  return !lifecycleStatus || !RISK_EXCLUDED_LIFECYCLES.has(lifecycleStatus);
}

export function isAtRiskStreak(entries: AttendanceEntry[]) {
  return consecutiveAbsences(entries) >= 3 && isRiskEligibleLifecycle(entries[0]?.lifecycleStatus);
}

export type AttendanceRiskLevel = "danger" | "warning";

/** 2 ardıcıl qayıb = sarı, 3 və daha çox = qırmızı. */
export const WARNING_ABSENCE_STREAK = 2;
export const DANGER_ABSENCE_STREAK = 3;

export function attendanceRiskLevel(streak: number): AttendanceRiskLevel | null {
  if (streak >= DANGER_ABSENCE_STREAK) return "danger";
  if (streak >= WARNING_ABSENCE_STREAK) return "warning";
  return null;
}

export type StudentAttendanceRisk = {
  studentId: string;
  student: string;
  level: AttendanceRiskLevel;
  streak: number;
  teacher: string;
  group: string;
  lastAbsentDate: string;
};

/** Hər tələbə üçün ən uzun ardıcıl qayıb seriyasına görə risk səviyyəsi. */
export function studentAttendanceRisks(entries: AttendanceEntry[]) {
  const byPair = new Map<string, AttendanceEntry[]>();
  for (const entry of entries) {
    const key = `${entry.teacherId}:${entry.studentId}`;
    const history = byPair.get(key) ?? [];
    history.push(entry);
    byPair.set(key, history);
  }
  const risks = new Map<string, StudentAttendanceRisk>();
  for (const history of byPair.values()) {
    if (!isRiskEligibleLifecycle(history[0]?.lifecycleStatus)) continue;
    const streak = consecutiveAbsences(history);
    const level = attendanceRiskLevel(streak);
    if (!level) continue;
    const latest = [...history].sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`))[0];
    const current = risks.get(latest.studentId);
    if (current && current.streak >= streak) continue;
    risks.set(latest.studentId, {
      studentId: latest.studentId, student: latest.student, level, streak,
      teacher: latest.teacher, group: latest.group, lastAbsentDate: latest.date,
    });
  }
  return risks;
}

/** Unique student IDs with a qualifying consecutive-absence streak (per teacher pair). */
export function riskyStudentIds(entries: AttendanceEntry[]) {
  const byPair = new Map<string, AttendanceEntry[]>();
  for (const entry of entries) {
    const key = `${entry.teacherId}:${entry.studentId}`;
    const history = byPair.get(key) ?? [];
    history.push(entry);
    byPair.set(key, history);
  }
  const risky = new Set<string>();
  for (const history of byPair.values()) {
    if (isAtRiskStreak(history)) risky.add(history[0].studentId);
  }
  return [...risky];
}

export function attendanceStats(entries: AttendanceEntry[]) {
  const present = entries.filter((e) => e.status === "PRESENT").length;
  const absent = entries.filter((e) => e.status === "ABSENT").length;
  const excused = entries.filter((e) => e.status === "EXCUSED").length;
  const missing = entries.filter((e) => e.status === null);
  const risky = riskyStudentIds(entries).length;
  return {
    present, absent, excused, expected: entries.length,
    rate: present + absent ? Math.round(present / (present + absent) * 100) : null,
    missing: missing.length, missingSessions: new Set(missing.map((e) => e.sessionId)).size,
    completeness: entries.length ? Math.round((entries.length - missing.length) / entries.length * 100) : null,
    students: new Set(entries.map((e) => e.studentId)).size, risky,
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
