import { Prisma } from "@/generated/prisma/client";
import {
  generateTaskDeadlineNotifications,
  getUnreadNotificationCounts,
  isPersonalNotificationSchemaMissing,
} from "@/modules/notifications/notification-service";
import { notificationTypeLabels } from "@/modules/notifications/notification-types";
import { requireErpActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";

export type PersonalNotificationRow = {
  id: string;
  source: "PERSONAL" | "HR";
  type: keyof typeof notificationTypeLabels | "HR";
  typeLabel: string;
  title: string;
  message: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
  taskTitle: string | null;
  deadline: string | null;
  status: string | null;
  isOverdue: boolean;
};

export type NotificationCenterData = {
  notifications: PersonalNotificationRow[];
  unreadCount: number;
  employeeId: string | null;
};

export async function getNotificationCenterData(): Promise<NotificationCenterData> {
  const actor = await requireErpActor();
  await generateTaskDeadlineNotifications({ recipientUserId: actor.id, force: true });

  const [notifications, employee, counts] = await Promise.all([
    getPrisma().personalNotification.findMany({
        where: { recipientUserId: actor.id },
        orderBy: [{ readAt: "asc" }, { createdAt: "desc" }],
        take: 100,
        select: {
          id: true,
          type: true,
          title: true,
          message: true,
          href: true,
          metadata: true,
          readAt: true,
          createdAt: true,
        },
      })
      .catch((error: unknown) => {
        if (isPersonalNotificationSchemaMissing(error)) return [];
        throw error;
      }),
    getPrisma().hrEmployee.findUnique({
      where: { userId: actor.id },
      select: {
        id: true,
        notifications: {
          orderBy: { createdAt: "desc" },
          take: 100,
          select: {
            id: true,
            category: true,
            title: true,
            message: true,
            status: true,
            readAt: true,
            createdAt: true,
          },
        },
      },
    }),
    getUnreadNotificationCounts(actor.id),
  ]);

  const personalRows = notifications.map((notification) => {
    const metadata = readMetadata(notification.metadata);
    return {
      id: notification.id,
      source: "PERSONAL" as const,
      type: notification.type,
      typeLabel: notificationTypeLabels[notification.type],
      title: notification.title,
      message: notification.message,
      href: notification.href,
      readAt: notification.readAt?.toISOString() ?? null,
      createdAt: notification.createdAt.toISOString(),
      taskTitle: metadata.taskTitle,
      deadline: metadata.deadline,
      status: metadata.status,
      isOverdue: notification.type === "TASK_OVERDUE",
    } satisfies PersonalNotificationRow;
  });
  const hrRows = (employee?.notifications ?? []).map((notification) => ({
    id: notification.id,
    source: "HR" as const,
    type: "HR" as const,
    typeLabel: hrCategoryLabel(notification.category),
    title: notification.title,
    message: notification.message,
    href: employee ? `/hr/${employee.id}` : null,
    readAt: notification.status === "SENT" ? null : notification.readAt?.toISOString() ?? notification.createdAt.toISOString(),
    createdAt: notification.createdAt.toISOString(),
    taskTitle: null,
    deadline: null,
    status: null,
    isOverdue: false,
  } satisfies PersonalNotificationRow));
  const rows = [...personalRows, ...hrRows].toSorted((first, second) => {
    if (Boolean(first.readAt) !== Boolean(second.readAt)) return first.readAt ? 1 : -1;
    return Date.parse(second.createdAt) - Date.parse(first.createdAt);
  }).slice(0, 100);

  return {
    notifications: rows,
    unreadCount: counts.all,
    employeeId: employee?.id ?? null,
  };
}

function hrCategoryLabel(category: string) {
  return ({
    RULE_VIOLATION: "HR · Qayda pozuntusu",
    PERFORMANCE_WARNING: "HR · Performans xəbərdarlığı",
    INFORMATION: "HR · Məlumat",
    APPRECIATION: "HR · Təşəkkür",
    MANUAL: "HR bildirişi",
  } as Record<string, string>)[category] ?? "HR bildirişi";
}

export async function getNotificationShellCounts(recipientUserId: string) {
  // Layout is on every ERP navigation — only count unread badges here.
  // Deadline generation runs via /api/notifications/refresh + cron, not SSR.
  return getUnreadNotificationCounts(recipientUserId);
}

function readMetadata(value: Prisma.JsonValue | null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { taskTitle: null, deadline: null, status: null };
  }

  return {
    taskTitle: typeof value.taskTitle === "string" ? value.taskTitle : null,
    deadline: typeof value.deadline === "string" ? value.deadline : null,
    status: typeof value.status === "string" ? value.status : null,
  };
}
