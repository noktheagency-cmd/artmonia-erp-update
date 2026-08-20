"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { taskNotificationTypes } from "@/modules/notifications/notification-types";
import {
  broadcastNotificationChange,
  isPersonalNotificationSchemaMissing,
} from "@/modules/notifications/notification-service";
import { requireMutationActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";
import { safeServerAction } from "@/server/actions/safe-action";

const notificationIdSchema = z.object({
  notificationId: z.string().uuid(),
  source: z.enum(["PERSONAL", "HR"]).default("PERSONAL"),
});

async function markNotificationReadActionImpl(formData: FormData) {
  const actor = await requireMutationActor();
  const { notificationId, source } = notificationIdSchema.parse(Object.fromEntries(formData));

  if (source === "HR") {
    await getPrisma().hrStaffNotification.updateMany({
      where: {
        id: notificationId,
        employee: { userId: actor.id },
        status: "SENT",
      },
      data: { status: "READ", readAt: new Date() },
    });
  } else {
    await getPrisma().personalNotification.updateMany({
      where: { id: notificationId, recipientUserId: actor.id, readAt: null },
      data: { readAt: new Date() },
    });
  }

  await notificationChanged(actor.id);
}

async function markAllNotificationsReadActionImpl() {
  const actor = await requireMutationActor();
  const now = new Date();
  try {
    await getPrisma().$transaction([
      getPrisma().personalNotification.updateMany({
        where: { recipientUserId: actor.id, readAt: null },
        data: { readAt: now },
      }),
      getPrisma().hrStaffNotification.updateMany({
        where: { employee: { userId: actor.id }, status: "SENT" },
        data: { status: "READ", readAt: now },
      }),
    ]);
  } catch (error) {
    if (!isPersonalNotificationSchemaMissing(error)) throw error;
    await getPrisma().hrStaffNotification.updateMany({
      where: { employee: { userId: actor.id }, status: "SENT" },
      data: { status: "READ", readAt: now },
    });
  }
  await notificationChanged(actor.id);
}

async function markTaskNotificationsReadActionImpl() {
  const actor = await requireMutationActor("task.read");
  await getPrisma().personalNotification.updateMany({
    where: {
      recipientUserId: actor.id,
      readAt: null,
      type: { in: [...taskNotificationTypes] },
    },
    data: { readAt: new Date() },
  });
  await notificationChanged(actor.id);
}

async function notificationChanged(recipientUserId: string) {
  revalidatePath("/profile");
  revalidatePath("/tasks");
  await broadcastNotificationChange(recipientUserId);
}

export const markNotificationReadAction = safeServerAction(
  markNotificationReadActionImpl,
  "Bildiriş oxunmuş kimi işarələnmədi.",
);

export const markAllNotificationsReadAction = safeServerAction(
  markAllNotificationsReadActionImpl,
  "Bildirişlər yenilənmədi.",
);

export const markTaskNotificationsReadAction = safeServerAction(
  markTaskNotificationsReadActionImpl,
  "Task bildirişləri yenilənmədi.",
);
