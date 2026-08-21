import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/modules/notifications/actions";
import { NotificationCenter } from "@/modules/notifications/notification-center";
import { getNotificationCenterData } from "@/modules/notifications/queries";
import { updateOwnProfilePhotoAction } from "@/modules/profile/actions";
import { ProfilePhotoEditor } from "@/modules/profile/profile-photo-editor";
import { requireErpActor } from "@/server/auth/actor";
import "@/modules/profile/profile.css";

export const dynamic = "force-dynamic";

export default async function OwnProfilePage() {
  const [data, actor] = await Promise.all([
    getNotificationCenterData(),
    requireErpActor(),
  ]);
  return (
    <div className="profile-page-stack">
      <ProfilePhotoEditor
        fullName={actor.fullName}
        initialPhotoUrl={actor.profilePhotoUrl ?? ""}
        action={updateOwnProfilePhotoAction}
      />
      <NotificationCenter
        data={data}
        markReadAction={markNotificationReadAction}
        markAllReadAction={markAllNotificationsReadAction}
      />
    </div>
  );
}
