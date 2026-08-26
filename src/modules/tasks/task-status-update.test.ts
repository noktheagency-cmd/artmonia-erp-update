import assert from "node:assert/strict";
import test from "node:test";
import { taskStatusUpdateSchema } from "@/modules/tasks/task-status-update";

const taskId = "4f4955c2-2620-4fe3-b75e-c029e329f387";

test("completed task requires a non-empty completion note", () => {
  assert.equal(taskStatusUpdateSchema.safeParse({ taskId, status: "DONE" }).success, false);
  assert.equal(
    taskStatusUpdateSchema.safeParse({ taskId, status: "DONE", completionNote: "   " }).success,
    false,
  );
});

test("completed task accepts and trims its completion note", () => {
  const result = taskStatusUpdateSchema.parse({
    taskId,
    status: "DONE",
    completionNote: "  Hesabat rəhbərə təqdim edildi.  ",
  });

  assert.equal(result.completionNote, "Hesabat rəhbərə təqdim edildi.");
});

test("non-completed statuses do not require a completion note", () => {
  const result = taskStatusUpdateSchema.parse({ taskId, status: "IN_PROGRESS" });
  assert.equal(result.completionNote, undefined);
});
