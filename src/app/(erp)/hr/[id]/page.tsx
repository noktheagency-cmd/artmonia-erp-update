import { notFound } from "next/navigation";
import { StaffProfile } from "@/modules/hr/staff-profile";
import { getHrStaffProfileData } from "@/modules/hr/staff-profile-data";
import {
  createHrStaffNotificationAction,
  updateHrStaffNotificationStatusAction,
} from "@/modules/hr/staff-notification-actions";
import {
  createHrEmployeeNoteAction,
  finalizeHrEmployeeDocumentAction,
  updateHrEmployeeNoteAction,
} from "@/modules/hr/staff-knowledge-actions";
import { updateStaffAction } from "@/modules/hr/staff-actions";

export const dynamic = "force-dynamic";

export default async function HrStaffProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getHrStaffProfileData(id);
  if (!data) notFound();
  return (
    <StaffProfile
      data={data}
      createNotificationAction={createHrStaffNotificationAction}
      updateNotificationStatusAction={updateHrStaffNotificationStatusAction}
      updateStaffAction={updateStaffAction}
      createNoteAction={createHrEmployeeNoteAction}
      updateNoteAction={updateHrEmployeeNoteAction}
      finalizeDocumentAction={finalizeHrEmployeeDocumentAction}
    />
  );
}
