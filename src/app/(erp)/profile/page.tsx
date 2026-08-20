import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/modules/notifications/actions";
import { NotificationCenter } from "@/modules/notifications/notification-center";
import { getNotificationCenterData } from "@/modules/notifications/queries";

export const dynamic = "force-dynamic";

export default async function OwnProfilePage() {
  const data = await getNotificationCenterData();
  return (
    <NotificationCenter
      data={data}
      markReadAction={markNotificationReadAction}
      markAllReadAction={markAllNotificationsReadAction}
    />
  );
}
