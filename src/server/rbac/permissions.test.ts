import assert from "node:assert/strict";
import test from "node:test";
import { AppRole } from "@/generated/prisma/client";
import {
  buildEffectivePermissions,
  getPermissionsForRoles,
  isSuperAdminOnlyPermission,
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
  assert.equal(permissions.has("playbook.guideline.read"), false);
});

test("Sales representatives can register students and accept their payments by default", () => {
  const permissions = getPermissionsForRoles([AppRole.SALES]);
  const paymentCreateDefinition = permissionDefinitions.find(
    ({ code }) => code === "billing.payment.create",
  );

  assert.equal(permissions.get("crm.lead.convert"), "ALL");
  assert.equal(permissions.get("student.create"), "ALL");
  assert.equal(permissions.get("billing.payment.create"), "ALL");
  assert.equal(permissions.has("billing.payment.read"), false);
  assert.equal(permissions.has("billing.entry.create"), false);
  assert.equal(paymentCreateDefinition?.module, "students");
  assert.equal(
    paymentCreateDefinition && "dependsOn" in paymentCreateDefinition
      ? paymentCreateDefinition.dependsOn
      : null,
    null,
  );
});

test("Guideline access defaults to Super Admin only", () => {
  const definition = permissionDefinitions.find(({ code }) => code === "playbook.guideline.read");

  assert.equal(definition && "dependsOn" in definition ? definition.dependsOn : null, "playbook.read");
  assert.equal(definition && "superAdminManaged" in definition ? definition.superAdminManaged : false, true);
  assert.equal(getPermissionsForRoles([AppRole.SUPER_ADMIN]).has("playbook.guideline.read"), true);
  for (const role of Object.values(AppRole).filter((role) => role !== AppRole.SUPER_ADMIN)) {
    assert.equal(getPermissionsForRoles([role]).has("playbook.guideline.read"), false, role);
  }
});

test("Audit and security access defaults to Super Admin only", () => {
  assert.equal(isSuperAdminOnlyPermission("audit.read"), true);
  assert.equal(getPermissionsForRoles([AppRole.SUPER_ADMIN]).has("audit.read"), true);
  for (const role of Object.values(AppRole).filter((role) => role !== AppRole.SUPER_ADMIN)) {
    assert.equal(getPermissionsForRoles([role]).has("audit.read"), false, role);
  }
});

test("multiple roles are merged without removing broader grants", () => {
  const permissions = getPermissionsForRoles([AppRole.SALES, AppRole.FINANCE]);
  for (const code of [...rolePermissionMap[AppRole.SALES], ...rolePermissionMap[AppRole.FINANCE]]) {
    assert.equal(permissions.has(code), true, code);
  }
});

test("database grants authorize custom roles without an AppRole code", () => {
  const permissions = buildEffectivePermissions([
    { code: "student.read", scope: "ALL" },
    { code: "student.create", scope: "ALL" },
  ]);

  assert.equal(permissions.get("student.read"), "ALL");
  assert.equal(permissions.get("student.create"), "ALL");
});

test("broader database grants win when several roles grant the same permission", () => {
  const permissions = buildEffectivePermissions([
    { code: "student.read", scope: "ALL" },
    { code: "student.read", scope: "ASSIGNED" },
  ]);

  assert.equal(permissions.get("student.read"), "ALL");
});
