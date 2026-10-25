import assert from "node:assert/strict";
import test from "node:test";
import { attendancePeriod, attendanceRiskPeriod, attendanceRiskSummary, attendanceStats, attendanceTeachers, consecutiveAbsences, isAtRiskStreak, riskyStudentIds, studentAttendanceRisks, type AttendanceEntry } from "./attendance-analytics";
import { attendanceAnalyticsScope } from "./attendance-analytics-scope";

function entry(status: AttendanceEntry["status"], date = "2026-09-01", extra: Partial<AttendanceEntry> = {}): AttendanceEntry {
  return { sessionId: date, date, time: "10:00", teacherId: "teacher-1", teacher: "Müəllim A", groupId: "group-1", group: "Qrup A", studentId: "student-1", student: "Tələbə A", enrollmentId: "enrollment-1", status, lifecycleStatus: "ACTIVE", ...extra };
}

test("unknown and excused attendance are not treated as absences or included in the rate", () => {
  const stats = attendanceStats([entry("PRESENT"), entry("ABSENT"), entry("EXCUSED"), entry(null)]);
  assert.equal(stats.rate, 50);
  assert.equal(stats.expected, 4);
  assert.equal(stats.completeness, 75);
  assert.equal(stats.excused, 1);
  assert.equal(stats.missingSessions, 1);
  assert.equal(attendanceStats([entry(null), entry("EXCUSED")]).rate, null);
  assert.equal(attendanceStats([]).rate, null);
});

test("school rate is weighted by student-lessons, not teacher averages", () => {
  const rows = [entry("PRESENT"), entry("PRESENT"), entry("PRESENT"), entry("ABSENT", undefined, { teacherId: "teacher-2" })];
  assert.equal(attendanceStats(rows).rate, 75);
  assert.deepEqual(attendanceTeachers(rows).map((teacher) => teacher.rate), [0, 100]);
});

test("three most recent confirmed absences flag risk; presence, excused and unknown break it", () => {
  const rows = [entry("ABSENT", "2026-09-03"), entry("ABSENT", "2026-09-01"), entry("ABSENT", "2026-09-02")];
  assert.equal(consecutiveAbsences(rows), 3);
  assert.equal(attendanceStats(rows).risky, 1);
  assert.deepEqual(riskyStudentIds(rows), ["student-1"]);
  for (const status of ["PRESENT", "EXCUSED", null] as const) {
    assert.equal(consecutiveAbsences([...rows, entry(status, "2026-09-04")]), 0);
    assert.equal(attendanceStats([...rows, entry(status, "2026-09-04")]).risky, 0);
  }
  assert.equal(attendanceStats(rows.map((row, index) => ({ ...row, teacherId: `teacher-${index}` }))).risky, 0);
  assert.deepEqual(riskyStudentIds(rows.map((row, index) => ({ ...row, teacherId: `teacher-${index}` }))), []);
});

test("two absences count as warning risk in both the panel and attendance analytics", () => {
  const rows = [entry("ABSENT", "2026-09-01"), entry("ABSENT", "2026-09-02")];
  assert.equal(studentAttendanceRisks(rows).get("student-1")?.level, "warning");
  assert.equal(isAtRiskStreak(rows), true);
  assert.deepEqual(riskyStudentIds(rows), ["student-1"]);
  assert.equal(attendanceStats(rows).risky, 1);
  assert.equal(attendanceTeachers(rows)[0].risky, 1);
  assert.equal(attendanceStats(rows.slice(0, 1)).risky, 0);
});

test("risk counts each student once across teachers and keeps the highest current streak", () => {
  const rows = [
    entry("ABSENT", "2026-09-01"), entry("ABSENT", "2026-09-02"),
    ...["2026-09-01", "2026-09-02", "2026-09-03"].map((date) => entry("ABSENT", date, { teacherId: "teacher-2" })),
  ];
  const risk = studentAttendanceRisks(rows).get("student-1");
  assert.equal(risk?.level, "danger");
  assert.equal(risk?.streak, 3);
  assert.deepEqual(riskyStudentIds(rows), ["student-1"]);
  const summary = attendanceRiskSummary([...studentAttendanceRisks(rows).values()], "2026-09-03");
  assert.equal(summary.dangerCount, 1);
  assert.equal(summary.warningCount, 0);
  assert.equal(summary.studentIds.length, 1);
});

test("current-risk snapshot preserves prior-month students instead of recounting only modal-period rows", () => {
  const absences = (studentId: string, dates: string[]) => dates.map((date) => entry("ABSENT", date, { studentId }));
  const rows = [
    ...absences("current-danger", ["2026-10-23", "2026-10-24", "2026-10-25"]),
    ...absences("previous-danger-1", ["2026-09-27", "2026-09-28", "2026-09-29"]),
    ...absences("previous-danger-2", ["2026-09-20", "2026-09-21", "2026-09-22"]),
    ...["warning-1", "warning-2", "warning-3", "warning-4"].flatMap((id) => absences(id, ["2026-10-24", "2026-10-25"])),
  ];
  const summary = attendanceRiskSummary([...studentAttendanceRisks(rows).values()], "2026-10-25");
  assert.equal(summary.studentIds.length, 7);
  assert.equal(summary.dangerCount, 3);
  assert.equal(summary.warningCount, 4);
  assert.equal(summary.studentIds.length, summary.dangerCount + summary.warningCount);
  assert.ok(summary.studentIds.includes("previous-danger-1"));
  assert.equal(attendanceStats(rows.filter((row) => row.date >= "2026-10-01")).risky, 5);
  assert.deepEqual(attendanceRiskSummary([], "2026-10-25"), { from: "2026-07-25", to: "2026-10-25", studentIds: [], dangerCount: 0, warningCount: 0 });
});

test("current risk uses 93 inclusive Baku calendar dates across month and year boundaries", () => {
  assert.deepEqual(attendanceRiskPeriod("2026-10-25"), { from: "2026-07-25", to: "2026-10-25" });
  assert.deepEqual(attendanceRiskPeriod("2026-01-01"), { from: "2025-10-01", to: "2026-01-01" });
});

test("stopped, frozen, declined and completed students are not counted as at-risk", () => {
  const absences = [entry("ABSENT", "2026-09-03"), entry("ABSENT", "2026-09-01"), entry("ABSENT", "2026-09-02")];
  for (const lifecycleStatus of ["STOPPED", "FROZEN", "DECLINED", "COMPLETED"]) {
    assert.equal(attendanceStats(absences.map((row) => ({ ...row, lifecycleStatus }))).risky, 0);
  }
  assert.equal(attendanceStats(absences.map((row) => ({ ...row, lifecycleStatus: "ACTIVE" }))).risky, 1);
  assert.equal(attendanceStats(absences.map((row) => ({ ...row, lifecycleStatus: "SLOT_WAITING" }))).risky, 1);
});

test("counts incomplete sessions and students once across multiple records", () => {
  const rows = [entry(null), entry(null, undefined, { studentId: "student-2" }), entry("PRESENT", "2026-09-02")];
  const stats = attendanceStats(rows);
  assert.equal(stats.missingSessions, 1);
  assert.equal(stats.missing, 2);
  assert.equal(stats.students, 2);
});

test("comparison uses the previous equal-length period across year and leap boundaries", () => {
  assert.deepEqual(attendancePeriod({ from: "2026-01-01", to: "2026-01-14" }, "2026-09-14"), { from: "2026-01-01", to: "2026-01-14", previousFrom: "2025-12-18", previousTo: "2025-12-31" });
  assert.equal(attendancePeriod({ from: "2024-03-01", to: "2024-03-01" }, "2026-09-14").previousFrom, "2024-02-29");
});

test("invalid dates, reversed, oversized and future periods are rejected", () => {
  for (const [from, to] of [["2026-02-30", "2026-03-01"], ["2026-09-02", "2026-09-01"], ["2026-01-01", "2026-09-01"], ["2026-09-14", "2026-09-15"]]) {
    assert.throws(() => attendancePeriod({ from, to }, "2026-09-14"));
  }
});

test("attendance scope intersects student manager and linked teacher access, failing closed", () => {
  const both = attendanceAnalyticsScope("actor-id", "ASSIGNED", "ASSIGNED");
  assert.match(both.sql, /s.manager_id = \?::uuid/);
  assert.match(both.sql, /t.user_id = \?::uuid/);
  assert.deepEqual(both.values, ["actor-id", "actor-id"]);
  assert.match(attendanceAnalyticsScope("actor-id", "ALL", "ASSIGNED").sql, /t.user_id/);
  assert.match(attendanceAnalyticsScope("actor-id", "ASSIGNED", "ALL").sql, /s.manager_id/);
  assert.doesNotMatch(attendanceAnalyticsScope("actor-id", "ALL", "ALL").sql, /false|manager_id|user_id/);
  assert.match(attendanceAnalyticsScope("actor-id", null, "ALL").sql, /false/);
  assert.match(attendanceAnalyticsScope("actor-id", "ALL", null).sql, /false/);
});
