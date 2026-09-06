import test from "node:test";
import assert from "node:assert/strict";
import { taskEditSchema } from "./task-edit";

const input = { taskId: "00000000-0000-4000-8000-000000000001", ownerUserId: "00000000-0000-4000-8000-000000000002", title: "Task adı", description: "Qeyd", dueDate: "2026-09-06", priority: "NORMAL" };
test("task edit validates real dates, nonempty titles and assignees", () => {
  assert.equal(taskEditSchema.safeParse(input).success, true);
  for (const change of [{ dueDate: "2026-02-30" }, { dueDate: "bad" }, { title: "  " }, { ownerUserId: "" }, { priority: "UNKNOWN" }]) {
    assert.equal(taskEditSchema.safeParse({ ...input, ...change }).success, false);
  }
});
test("task editing strips status and completion fields", () => {
  const parsed = taskEditSchema.parse({ ...input, status: "DONE", completionNote: "overwrite", title: "  Task adı  " });
  assert.equal(parsed.title, "Task adı");
  assert.equal("status" in parsed, false);
  assert.equal("completionNote" in parsed, false);
});
