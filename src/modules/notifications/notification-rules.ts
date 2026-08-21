export type TaskDeadlineStage = "two-days" | "one-day" | "overdue";

export function getTaskDeadlineStage(dueAt: Date, now: Date): TaskDeadlineStage | null {
  if (dueAt.getTime() <= now.getTime()) return "overdue";
  const daysUntil = bakuCalendarDay(dueAt) - bakuCalendarDay(now);
  if (daysUntil === 2) return "two-days";
  if (daysUntil === 1) return "one-day";
  return null;
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

function bakuCalendarDay(value: Date) {
  const shifted = new Date(value.getTime() + 4 * 60 * 60 * 1_000);
  return Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) / 86_400_000;
}

export function isDeadlineNotificationStatus(status: string) {
  return status === "OPEN" || status === "IN_PROGRESS";
}
