import assert from "node:assert/strict";
import test from "node:test";
import { GroupWeekday } from "@/generated/prisma/client";
import {
  buildTeacherAvailabilityWhere,
  isTeacherScheduleOverlapError,
  teacherScheduleOverlapConstraint,
} from "./slot-availability";

const request = {
  teacherId: "00000000-0000-4000-8000-000000000001",
  weekday: GroupWeekday.MONDAY,
  startTime: "09:00",
  endTime: "10:30",
};

test("availability considers every stored slot with overlapping teacher time", () => {
  assert.deepEqual(buildTeacherAvailabilityWhere(request), {
    teacherId: request.teacherId,
    weekday: GroupWeekday.MONDAY,
    startTime: { lt: "10:30" },
    endTime: { gt: "09:00" },
  });
});

test("editing excludes the current slot", () => {
  assert.deepEqual(
    buildTeacherAvailabilityWhere(request, "00000000-0000-4000-8000-000000000002"),
    {
      id: { not: "00000000-0000-4000-8000-000000000002" },
      teacherId: request.teacherId,
      weekday: GroupWeekday.MONDAY,
      startTime: { lt: "10:30" },
      endTime: { gt: "09:00" },
    },
  );
});

test("recognizes direct and nested PostgreSQL exclusion violations", () => {
  assert.equal(isTeacherScheduleOverlapError({ code: "23P01" }), true);
  assert.equal(
    isTeacherScheduleOverlapError({
      code: "P2004",
      meta: { database_error: { constraint: teacherScheduleOverlapConstraint } },
    }),
    true,
  );
  assert.equal(isTeacherScheduleOverlapError({ code: "P2002" }), false);
});
