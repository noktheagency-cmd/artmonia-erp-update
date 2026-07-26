import assert from "node:assert/strict";
import test from "node:test";
import { AppRole } from "@/generated/prisma/client";
import {
  getPermissionsForRoles,
  permissionDefinitions,
  rolePermissionMap,
} from "@/server/rbac/permissions";

test("permission registry codes are unique and dependencies exist", () => {
  const codes = permissionDefinitions.map(({ code }) => code);
  assert.equal(new Set(codes).size, codes.length);
  const codeSet = new Set(codes);
  for (const definition of permissionDefinitions) {
    if ("dependsOn" in definition) assert.equal(codeSet.has(definition.dependsOn), true, definition.code);
  }
});

test("Super Admin always receives the full permission catalog", () => {
  const permissions = getPermissionsForRoles([AppRole.SUPER_ADMIN]);
  assert.equal(permissions.size, permissionDefinitions.length);
  for (const definition of permissionDefinitions) assert.equal(permissions.get(definition.code), "ALL");
});

test("Owner can read and manage role permissions by default", () => {
  const permissions = getPermissionsForRoles([AppRole.OWNER]);
  assert.equal(permissions.has("auth.role.read"), true);
  assert.equal(permissions.has("auth.role.manage"), true);
});

test("multiple roles are merged without removing broader grants", () => {
  const permissions = getPermissionsForRoles([AppRole.SALES, AppRole.FINANCE]);
  for (const code of [...rolePermissionMap[AppRole.SALES], ...rolePermissionMap[AppRole.FINANCE]]) {
    assert.equal(permissions.has(code), true, code);
  }
});
