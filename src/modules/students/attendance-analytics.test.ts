import assert from "node:assert/strict";
import test from "node:test";
import { attendancePeriod, attendanceStats, attendanceTeachers, consecutiveAbsences, type AttendanceEntry } from "./attendance-analytics";
import { attendanceAnalyticsScope } from "./attendance-analytics-scope";

function entry(status: AttendanceEntry["status"], date = "2026-09-01", extra: Partial<AttendanceEntry> = {}): AttendanceEntry {
  return { sessionId: date, date, time: "10:00", teacherId: "teacher-1", teacher: "Müəllim A", groupId: "group-1", group: "Qrup A", studentId: "student-1", student: "Tələbə A", enrollmentId: "enrollment-1", status, ...extra };
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
  for (const status of ["PRESENT", "EXCUSED", null] as const) {
    assert.equal(consecutiveAbsences([...rows, entry(status, "2026-09-04")]), 0);
  }
  assert.equal(attendanceStats(rows.map((row, index) => ({ ...row, teacherId: `teacher-${index}` }))).risky, 0);
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
