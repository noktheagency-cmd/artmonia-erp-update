import assert from "node:assert/strict";
import test from "node:test";
import {
  attendanceWindowState,
  bakuLocalDateTimeToUtc,
  buildAttendanceWindow,
  formatBakuIso,
  formatBakuTime,
} from "./attendance-time";

test("Bakı dərs saatını UTC-yə və yenidən +04:00 ISO formatına çevirir", () => {
  const value = bakuLocalDateTimeToUtc("2026-08-23", "12:30");
  assert.equal(value.toISOString(), "2026-08-23T08:30:00.000Z");
  assert.equal(formatBakuIso(value), "2026-08-23T12:30:00+04:00");
  assert.equal(formatBakuTime(value), "12:30");
});

test("davamiyyət pəncərəsini dərsdən 15 dəqiqə əvvəl və 30 dəqiqə sonra qurur", () => {
  const window = buildAttendanceWindow("2026-08-23", "12:30", "14:30", {
    opensMinutesBefore: 15,
    closesMinutesAfter: 30,
  });
  assert.equal(formatBakuIso(window.opensAt), "2026-08-23T12:15:00+04:00");
  assert.equal(formatBakuIso(window.closesAt), "2026-08-23T15:00:00+04:00");
  assert.equal(attendanceWindowState(new Date("2026-08-23T08:14:59Z"), window.opensAt, window.closesAt), "NOT_OPEN");
  assert.equal(attendanceWindowState(new Date("2026-08-23T08:15:00Z"), window.opensAt, window.closesAt), "OPEN");
  assert.equal(attendanceWindowState(new Date("2026-08-23T11:00:01Z"), window.opensAt, window.closesAt), "CLOSED");
});
