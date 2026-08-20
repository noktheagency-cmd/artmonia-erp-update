export type TaskDeadlineStage = "due-soon" | "overdue";

export function getTaskDeadlineStage(dueAt: Date, now: Date): TaskDeadlineStage {
  return dueAt.getTime() <= now.getTime() ? "overdue" : "due-soon";
}

export function buildTaskDeadlineDedupeKey({
  taskId,
  dueAt,
  stage,
}: {
  taskId: string;
  dueAt: Date;
  stage: TaskDeadlineStage;
}) {
  return `task:${taskId}:deadline:${dueAt.toISOString()}:${stage}`;
}

export function isDeadlineNotificationStatus(status: string) {
  return status === "OPEN" || status === "IN_PROGRESS";
}
