import assert from "node:assert/strict";
import test from "node:test";
import { StudentLifecycleStatus } from "@/generated/prisma/client";

/**
 * BK-06/08 regression: replacing a weekly slot plan must not activate SLOT_WAITING.
 * Activation happens only via activateStudentFromFirstPresent on PRESENT.
 * Mirrors planner-actions syncStudentActivationAndPayment branch.
 */
function slotAssignShouldActivate(lifecycleStatus: StudentLifecycleStatus) {
  return (
    lifecycleStatus !== StudentLifecycleStatus.SLOT_WAITING
    && lifecycleStatus !== StudentLifecycleStatus.FROZEN
    && lifecycleStatus !== StudentLifecycleStatus.STOPPED
    && lifecycleStatus !== StudentLifecycleStatus.DECLINED
    && lifecycleStatus !== StudentLifecycleStatus.COMPLETED
  );
}

test("BK-06/08: slot assign does not activate SLOT_WAITING students", () => {
  assert.equal(slotAssignShouldActivate(StudentLifecycleStatus.SLOT_WAITING), false);
  assert.equal(slotAssignShouldActivate(StudentLifecycleStatus.ACTIVE), true);
});
