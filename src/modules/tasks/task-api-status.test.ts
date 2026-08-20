import assert from "node:assert/strict";
import test from "node:test";
import { taskApiErrorStatus } from "@/modules/tasks/task-api-status";

test("task API icazəsiz rol üçün 403 qaytarır", () => {
  assert.equal(taskApiErrorStatus("FORBIDDEN"), 403);
  assert.equal(taskApiErrorStatus("UNAUTHORIZED"), 401);
});
