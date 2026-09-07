import assert from "node:assert/strict";
import test from "node:test";
import {
  canEditBillingDeadline,
  deadlineForMonth,
  deadlineRuleSchema,
} from "./billing-deadline-policy";
test("only the two resolved accounts may edit payment deadlines", () => {
  assert.equal(
    canEditBillingDeadline("f74ddcf3-fed2-4d36-86e5-5e75ab94f225"),
    true,
  );
  assert.equal(
    canEditBillingDeadline("d0fb9ad2-ec06-4bc6-8dc9-5c037775486a"),
    true,
  );
  assert.equal(
    canEditBillingDeadline("0ad3d342-24bc-4c69-9c3e-3cb2755c19e4"),
    false,
  );
  assert.equal(canEditBillingDeadline("SUPER_ADMIN"), false);
});
test("the requested day survives short months and leap years", () => {
  assert.equal(deadlineForMonth("2026-02", 31), "2026-02-28");
  assert.equal(deadlineForMonth("2028-02", 31), "2028-02-29");
  assert.equal(deadlineForMonth("2026-03", 31), "2026-03-31");
});
test("deadline inputs require a valid month, day and reason", () => {
  const input = {
    studentId: "f74ddcf3-fed2-4d36-86e5-5e75ab94f225",
    requestId: "d0fb9ad2-ec06-4bc6-8dc9-5c037775486a",
    mode: "FROM_MONTH",
    month: "2026-09",
    day: 15,
    reason: "Razılaşdırılıb",
  };
  assert.equal(deadlineRuleSchema.safeParse(input).success, true);
  for (const patch of [
    { month: "2026-13" },
    { day: 0 },
    { day: 32 },
    { reason: "" },
  ])
    assert.equal(
      deadlineRuleSchema.safeParse({ ...input, ...patch }).success,
      false,
    );
});
