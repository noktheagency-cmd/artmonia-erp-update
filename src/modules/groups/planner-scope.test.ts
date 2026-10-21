import assert from "node:assert/strict";
import test from "node:test";
import { buildPlannerSlotScope, resolvePlannerAccessScope } from "./planner-scope";

test("ALL scope bütün slotları oxuya bilir", () => {
  assert.deepEqual(buildPlannerSlotScope("ALL", undefined), {});
});

test("ASSIGNED scope yalnız hesabın müəllim profilinə bağlı slotları qaytarır", () => {
  assert.deepEqual(buildPlannerSlotScope("ASSIGNED", "teacher-1"), {
    teacherId: "teacher-1",
  });
});

test("profilsiz ASSIGNED hesab filtrsiz sorğuya düşmür", () => {
  assert.deepEqual(buildPlannerSlotScope("ASSIGNED", undefined), {
    teacherId: "00000000-0000-0000-0000-000000000000",
  });
});

test("group.manage olan hesab bütün müəllim slotlarını oxuyur", () => {
  assert.equal(
    resolvePlannerAccessScope({ readScope: "ASSIGNED", canManage: true }),
    "ALL",
  );
});

test("group.read ALL scope bütün slotları oxuyur", () => {
  assert.equal(
    resolvePlannerAccessScope({ readScope: "ALL", canManage: false }),
    "ALL",
  );
});

test("yalnız ASSIGNED oxuyan müəllim öz slotları ilə məhdudlaşır", () => {
  assert.equal(
    resolvePlannerAccessScope({ readScope: "ASSIGNED", canManage: false }),
    "ASSIGNED",
  );
});
