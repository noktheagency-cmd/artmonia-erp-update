import {
  generateTaskDeadlineNotifications,
  getUnreadNotificationCounts,
} from "@/modules/notifications/notification-service";
import { requireErpActor } from "@/server/auth/actor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const actor = await requireErpActor();
    await generateTaskDeadlineNotifications({ recipientUserId: actor.id });
    const counts = await getUnreadNotificationCounts(actor.id);
    return Response.json(counts, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const unauthorized = error instanceof Error && error.message === "Unauthorized";
    return Response.json(
      { error: unauthorized ? "Unauthorized" : "Bildirişlər yenilənmədi." },
      { status: unauthorized ? 401 : 500 },
    );
  }
}
