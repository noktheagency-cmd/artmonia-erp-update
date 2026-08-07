import assert from "node:assert/strict";
import test from "node:test";
import { AppRole } from "@/generated/prisma/client";
import { isProtectedTeamRole } from "@/lib/protected-roles";

test("leadership roles are protected from team role assignment", () => {
  assert.equal(isProtectedTeamRole(AppRole.SUPER_ADMIN), true);
  assert.equal(isProtectedTeamRole(AppRole.ADMIN), true);
  assert.equal(isProtectedTeamRole(AppRole.SALES), false);
  assert.equal(isProtectedTeamRole(null), false);
});
