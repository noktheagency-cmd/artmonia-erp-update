import assert from "node:assert/strict";
import test from "node:test";
import { assertCanAccessLead, assertCanEditLead, getLeadReadScope, resolveLeadManagerId } from "@/modules/crm/access";
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

const otherLead = { id: "lead-1", managerId: "other-manager", stage: "NEW" as const };

test("assigned editors can edit another manager's visible follow-up and status", () => {
  const editor = actor("ALL");
  editor.permissions.set("crm.lead.update", "ASSIGNED");
  assert.doesNotThrow(() => assertCanEditLead(editor, otherLead));
  assert.equal(resolveLeadManagerId(editor, editor.id, otherLead.managerId), otherLead.managerId);
  assert.throws(() => assertCanAccessLead(editor, otherLead, "crm.lead.update"), /giriş icazəniz yoxdur/);
  editor.permissions.set("crm.lead.convert", "ASSIGNED");
  assert.throws(() => assertCanAccessLead(editor, otherLead, "crm.lead.convert"), /giriş icazəniz yoxdur/);
});

test("follow-up edits require update permission and access to the record", () => {
  assert.throws(() => assertCanEditLead(actor("ALL"), otherLead), /Missing permission/);
  const editor = actor("ASSIGNED");
  editor.permissions.set("crm.lead.update", "ASSIGNED");
  assert.throws(() => assertCanEditLead(editor, otherLead), /giriş icazəniz yoxdur/);
  assert.doesNotThrow(() => assertCanEditLead(editor, { ...otherLead, managerId: editor.id }));
  assert.throws(() => assertCanEditLead(editor, null), /tapılmadı/);
  editor.permissions.delete("crm.lead.read");
  assert.throws(() => assertCanEditLead(editor, otherLead), /Missing permission/);
});

test("edits preserve assignment unless an authorized editor explicitly reassigns", () => {
  const editor = actor("ALL");
  editor.permissions.set("crm.lead.update", "ALL");
  assert.equal(resolveLeadManagerId(editor, undefined, otherLead.managerId), otherLead.managerId);
  assert.equal(resolveLeadManagerId(editor, undefined, null), null);
  assert.equal(resolveLeadManagerId(editor, "new-manager", otherLead.managerId), "new-manager");
  editor.permissions.set("crm.lead.update", "ASSIGNED");
  assert.equal(resolveLeadManagerId(editor, "new-manager", null), null);
});
