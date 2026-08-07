import assert from "node:assert/strict";
import test from "node:test";
import {
  getBakuDateInput,
  getReminderDayRange,
  getStudentReminderKind,
  parseStudentReminderDate,
} from "./student-reminders";

test("parses ISO and Azerbaijani reminder dates at a timezone-safe UTC hour", () => {
  assert.equal(parseStudentReminderDate("2026-08-05").toISOString(), "2026-08-05T12:00:00.000Z");
  assert.equal(parseStudentReminderDate("05.08.2026").toISOString(), "2026-08-05T12:00:00.000Z");
});

test("rejects calendar dates that do not exist", () => {
  assert.throws(() => parseStudentReminderDate("2026-02-30"), /tarixi düzgün deyil/);
});

test("resolves the current business date in the Baku timezone", () => {
  assert.equal(getBakuDateInput(new Date("2026-08-04T20:30:00.000Z")), "2026-08-05");
});

test("builds an exclusive UTC range around the selected reminder day", () => {
  const range = getReminderDayRange("2026-08-05");
  assert.equal(range.start.toISOString(), "2026-08-05T00:00:00.000Z");
  assert.equal(range.end.toISOString(), "2026-08-06T00:00:00.000Z");
});

test("maps only supported student reminder task types", () => {
  assert.equal(getStudentReminderKind("student_payment_reminder"), "PAYMENT");
  assert.equal(getStudentReminderKind("manual"), null);
});
