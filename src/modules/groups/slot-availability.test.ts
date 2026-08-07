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

test("availability only considers active slots in active groups and overlapping times", () => {
  const validFrom = new Date("2026-08-08T00:00:00.000Z");

  assert.deepEqual(buildTeacherAvailabilityWhere(request, validFrom, null), {
    teacherId: request.teacherId,
    weekday: GroupWeekday.MONDAY,
    isActive: true,
    group: { isActive: true },
    startTime: { lt: "10:30" },
    endTime: { gt: "09:00" },
    OR: [{ validTo: null }, { validTo: { gte: validFrom } }],
  });
});

test("finite slot versions ignore candidates that begin after the requested period", () => {
  const validFrom = new Date("2026-08-08T00:00:00.000Z");
  const validTo = new Date("2026-08-31T00:00:00.000Z");

  assert.deepEqual(
    buildTeacherAvailabilityWhere(request, validFrom, validTo, "00000000-0000-4000-8000-000000000002"),
    {
      id: { not: "00000000-0000-4000-8000-000000000002" },
      teacherId: request.teacherId,
      weekday: GroupWeekday.MONDAY,
      isActive: true,
      group: { isActive: true },
      startTime: { lt: "10:30" },
      endTime: { gt: "09:00" },
      validFrom: { lte: validTo },
      OR: [{ validTo: null }, { validTo: { gte: validFrom } }],
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
