import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCurrentTaskAssigneeWhere,
  buildTaskWorkspaceWhere,
} from "./task-scope";

test("keeps CRM follow-up records outside the standalone task workspace", () => {
  assert.deepEqual(buildTaskWorkspaceWhere(), {
    type: { notIn: ["lead_follow_up"] },
    OR: [
      { entityType: null },
      { entityType: { notIn: ["lead"] } },
    ],
  });
});

test("adds the assigned-user scope without weakening the CRM boundary", () => {
  assert.deepEqual(buildTaskWorkspaceWhere("11111111-1111-4111-8111-111111111111"), {
    ownerUserId: "11111111-1111-4111-8111-111111111111",
    type: { notIn: ["lead_follow_up"] },
    OR: [
      { entityType: null },
      { entityType: { notIn: ["lead"] } },
    ],
  });
});

test("task assignees must have a current HR profile and active ERP account", () => {
  assert.deepEqual(buildCurrentTaskAssigneeWhere(), {
    isActive: true,
    hrEmployeeProfile: {
      is: {
        status: { in: ["ACTIVE", "PROBATION"] },
        archivedAt: null,
      },
    },
  });
});
