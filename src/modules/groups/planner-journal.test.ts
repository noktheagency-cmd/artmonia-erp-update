import assert from "node:assert/strict";
import test from "node:test";
import { canEditAttendanceToday, recentScheduledDates } from "./planner-journal";

test("jurnal tarixçəsi son planlı dərs günlərini yeni tarixdən köhnəyə qaytarır", () => {
  assert.deepEqual(recentScheduledDates({
    weekday: "THURSDAY",
    validFrom: "2026-08-01",
    today: "2026-08-27",
    limit: 4,
  }), ["2026-08-27", "2026-08-20", "2026-08-13", "2026-08-06"]);
});

test("yalnız bugünkü slotun davamiyyəti redaktə olunur", () => {
  assert.deepEqual(canEditAttendanceToday({
    today: "2026-08-27",
    weekday: "THURSDAY",
    validFrom: "2026-08-01",
    hasTeacher: true,
  }), { canEdit: true, reason: null });

  assert.equal(canEditAttendanceToday({
    today: "2026-08-27",
    weekday: "FRIDAY",
    validFrom: "2026-08-01",
    hasTeacher: true,
  }).canEdit, false);
});

test("müəllimsiz və ləğv edilmiş dərs redaktə edilmir", () => {
  assert.equal(canEditAttendanceToday({
    today: "2026-08-27",
    weekday: "THURSDAY",
    validFrom: "2026-08-01",
    hasTeacher: false,
  }).canEdit, false);
  assert.equal(canEditAttendanceToday({
    today: "2026-08-27",
    weekday: "THURSDAY",
    validFrom: "2026-08-01",
    hasTeacher: true,
    sessionStatus: "CANCELLED",
  }).canEdit, false);
});
