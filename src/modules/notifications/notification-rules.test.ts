import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTaskDeadlineDedupeKey,
  getTaskDeadlineStage,
  isDeadlineNotificationStatus,
} from "@/modules/notifications/notification-rules";

const taskId = "11111111-1111-4111-8111-111111111111";

test("deadline mərhələsi 2 gün, 1 gün və gecikmiş taskı ayırır", () => {
  const now = new Date("2026-08-20T10:00:00.000Z");
  assert.equal(getTaskDeadlineStage(new Date("2026-08-22T10:00:00.000Z"), now), "two-days");
  assert.equal(getTaskDeadlineStage(new Date("2026-08-21T10:00:00.000Z"), now), "one-day");
  assert.equal(getTaskDeadlineStage(new Date("2026-08-24T10:00:00.000Z"), now), null);
  assert.equal(getTaskDeadlineStage(new Date("2026-08-20T10:00:00.000Z"), now), "overdue");
});

test("eyni deadline mərhələsi sabit dedupe açarı, gecikmə isə ayrıca açar yaradır", () => {
  const dueAt = new Date("2026-08-21T10:00:00.000Z");
  const soonKey = buildTaskDeadlineDedupeKey({ taskId, dueAt, stage: "one-day" });
  assert.equal(soonKey, buildTaskDeadlineDedupeKey({ taskId, dueAt, stage: "one-day" }));
  assert.notEqual(soonKey, buildTaskDeadlineDedupeKey({ taskId, dueAt, stage: "overdue" }));
});

test("tamamlanmış və ləğv edilmiş task üçün deadline bildirişi yaradılmır", () => {
  assert.equal(isDeadlineNotificationStatus("OPEN"), true);
  assert.equal(isDeadlineNotificationStatus("IN_PROGRESS"), true);
  assert.equal(isDeadlineNotificationStatus("DONE"), false);
  assert.equal(isDeadlineNotificationStatus("CANCELLED"), false);
});
