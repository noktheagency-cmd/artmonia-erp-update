import assert from "node:assert/strict";
import test from "node:test";
import { getLeadReadScope } from "@/modules/crm/access";
import type { ErpActor } from "@/server/auth/actor";
import type { PermissionScope } from "@/server/rbac/permissions";

function actor(scope?: PermissionScope): ErpActor {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    authUserId: null, currentSessionId: null, profilePhotoUrl: null,
    fullName: "Test", email: "test@example.com", roles: [],
    permissions: new Map(scope ? [["crm.lead.read", scope]] : []),
  };
}

test("lead profile reads require an explicit read permission", () => {
  assert.throws(() => getLeadReadScope(actor()), /Missing permission/);
});

test("assigned lead profile reads are restricted to the current manager", () => {
  const current = actor("ASSIGNED");
  assert.deepEqual(getLeadReadScope(current), { managerId: current.id });
});

test("all-scope lead profile reads are not restricted to a manager", () => {
  assert.deepEqual(getLeadReadScope(actor("ALL")), {});
});
