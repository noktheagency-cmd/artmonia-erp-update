import assert from "node:assert/strict";
import test from "node:test";
import {
  isActionResult,
  unwrapActionResult,
  type ActionResult,
} from "@/lib/action-result";

test("unwrapActionResult returns successful action data", () => {
  const result: ActionResult<{ id: string }> = {
    ok: true,
    data: { id: "employee-1" },
  };
  assert.deepEqual(unwrapActionResult(result), { id: "employee-1" });
});

test("unwrapActionResult converts a safe failure to a client error", () => {
  const result: ActionResult = {
    ok: false,
    code: "DUPLICATE",
    message: "Bu məlumat artıq sistemdə mövcuddur.",
  };
  assert.throws(() => unwrapActionResult(result), /artıq sistemdə mövcuddur/);
});

test("unwrapActionResult leaves legacy successful values unchanged", () => {
  assert.equal(unwrapActionResult("ok"), "ok");
  assert.equal(isActionResult({ ok: true, data: null }), true);
  assert.equal(isActionResult({ status: "ok" }), false);
});
