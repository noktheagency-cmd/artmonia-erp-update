import assert from "node:assert/strict";
import test from "node:test";
import { getPermissionsForRoles, scopeFor } from "@/server/rbac/permissions";
import { assertAttendanceEditDate } from "./edit-policy";

test("Admin and Super Admin defaults permit historical attendance correction", () => {
  for (const role of ["ADMIN", "SUPER_ADMIN"] as const) {
    const scope = scopeFor(getPermissionsForRoles([role]), "attendance.manage");
    assert.equal(scope, "ALL");
    assert.doesNotThrow(() => assertAttendanceEditDate("2026-10-21", "2026-10-29", scope));
  }
});
test("assigned teachers cannot edit history; nobody can mark a future lesson", () => {
  assert.doesNotThrow(() => assertAttendanceEditDate("2026-10-29", "2026-10-29", "ASSIGNED"));
  assert.throws(() => assertAttendanceEditDate("2026-10-21", "2026-10-29", "ASSIGNED"));
  for (const scope of ["ALL", "ASSIGNED"] as const) {
    assert.throws(() => assertAttendanceEditDate("2026-10-30", "2026-10-29", scope));
  }
});
