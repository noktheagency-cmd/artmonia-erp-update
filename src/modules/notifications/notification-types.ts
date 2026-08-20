import type { PersonalNotificationType } from "@/generated/prisma/client";

export const taskNotificationTypes = [
  "TASK_ASSIGNED",
  "TASK_DUE_SOON",
  "TASK_OVERDUE",
] as const satisfies readonly PersonalNotificationType[];

export const notificationTypeLabels: Record<PersonalNotificationType, string> = {
  TASK_ASSIGNED: "Yeni task",
  TASK_DUE_SOON: "Deadline yaxınlaşır",
  TASK_OVERDUE: "Gecikmiş task",
  DOCUMENT: "Sənəd",
  SYSTEM: "Sistem",
};

export const taskStatusLabels = {
  OPEN: "Gözləyir",
  IN_PROGRESS: "İcradadır",
  DONE: "Tamamlandı",
  CANCELLED: "Ləğv edildi",
} as const;
