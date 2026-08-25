import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCurrentTaskAssigneeWhere,
  buildTaskWorkspaceWhere,
} from "./task-scope";

test("keeps CRM follow-ups and student reminders outside the standalone task workspace", () => {
  assert.deepEqual(buildTaskWorkspaceWhere(), {
    type: {
      notIn: [
        "lead_follow_up",
        "student_payment_reminder",
        "student_general_reminder",
      ],
    },
    OR: [
      { entityType: null },
      { entityType: { notIn: ["lead"] } },
    ],
  });
});

test("adds the assigned-user scope without weakening module boundaries", () => {
  assert.deepEqual(buildTaskWorkspaceWhere("11111111-1111-4111-8111-111111111111"), {
    ownerUserId: "11111111-1111-4111-8111-111111111111",
    type: {
      notIn: [
        "lead_follow_up",
        "student_payment_reminder",
        "student_general_reminder",
      ],
    },
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
