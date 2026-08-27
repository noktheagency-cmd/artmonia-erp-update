import assert from "node:assert/strict";
import test from "node:test";
import { buildTeacherDirectoryScope } from "./teacher-directory-scope";

function normalizedSql(ownTeacherId?: string) {
  return buildTeacherDirectoryScope(ownTeacherId).sql.replace(/\s+/g, " ").trim();
}

test("shared teacher directory includes only active HR-linked teachers", () => {
  const sql = normalizedSql();

  assert.match(sql, /he\.id is null or \(?he\.status = 'ACTIVE'/);
  assert.doesNotMatch(sql, /he\.status = 'PROBATION'/);
});

test("own teacher profile remains addressable outside the shared directory", () => {
  const teacherId = "00000000-0000-4000-8000-000000000001";
  const scope = buildTeacherDirectoryScope(teacherId);

  assert.match(normalizedSql(teacherId), /t\.id = \?::uuid/);
  assert.deepEqual(scope.values, [teacherId]);
});
