import assert from "node:assert/strict";
import test from "node:test";
import {
  mobileAttendanceSummaryQuerySchema,
  mobileLessonsQuerySchema,
  mobileProfilePatchSchema,
} from "./mobile-portal-contract";

test("mobile lesson filters receive stable defaults", () => {
  assert.deepEqual(mobileLessonsQuerySchema.parse({}), {
    status: "all",
    limit: 20,
  });
  assert.deepEqual(mobileLessonsQuerySchema.parse({ status: "excused", limit: "50" }), {
    status: "excused",
    limit: 50,
  });
});

test("mobile lesson filters reject unknown fields and oversized pages", () => {
  assert.equal(mobileLessonsQuerySchema.safeParse({ limit: "51" }).success, false);
  assert.equal(mobileLessonsQuerySchema.safeParse({ studentId: crypto.randomUUID() }).success, false);
});

test("profile patch only accepts student-owned fields", () => {
  assert.equal(mobileProfilePatchSchema.safeParse({ phone: "+994501234567" }).success, true);
  assert.equal(mobileProfilePatchSchema.safeParse({ avatarObjectPath: null }).success, true);
  assert.equal(mobileProfilePatchSchema.safeParse({}).success, false);
  assert.equal(mobileProfilePatchSchema.safeParse({ displayName: "Changed" }).success, false);
  assert.equal(mobileProfilePatchSchema.safeParse({ email: "other@example.com" }).success, false);
});

test("attendance summary filters accept calendar dates only", () => {
  assert.equal(mobileAttendanceSummaryQuerySchema.safeParse({ from: "2026-08-01" }).success, true);
  assert.equal(mobileAttendanceSummaryQuerySchema.safeParse({ from: "2026-08-01T00:00:00Z" }).success, false);
});
