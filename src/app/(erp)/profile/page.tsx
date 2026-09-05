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
import { canPublishMobilePush } from "@/modules/mobile-push/access";
import { getPushPanelData } from "@/modules/mobile-push/service";
import { MobilePushPanel } from "@/modules/mobile-push/panel";
import "@/modules/mobile-push/push.css";

export const dynamic = "force-dynamic";

export default async function OwnProfilePage() {
  const [data, actor] = await Promise.all([
    getNotificationCenterData(),
    requireErpActor(),
  ]);
  const pushData = canPublishMobilePush(actor) ? await getPushPanelData() : null;
  return (
    <div className="profile-page-stack">
      <ProfilePhotoEditor
        fullName={actor.fullName}
        initialPhotoUrl={actor.profilePhotoUrl ?? ""}
        action={updateOwnProfilePhotoAction}
      />
      {pushData ? <MobilePushPanel data={pushData} /> : null}
      <NotificationCenter
        data={data}
        markReadAction={markNotificationReadAction}
        markAllReadAction={markAllNotificationsReadAction}
      />
    </div>
  );
}
