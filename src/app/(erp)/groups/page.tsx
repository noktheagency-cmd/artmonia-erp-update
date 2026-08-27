import { getPlannerWorkspaceData } from "@/modules/groups/planner-queries";
import { PlannerWorkspace } from "@/modules/groups/planner-workspace";
import {
  createClassSlotAction,
  deleteClassSlotAction,
  replaceStudentScheduleAction,
  saveSlotAttendanceAction,
  updateClassSlotAction,
} from "@/modules/groups/planner-actions";
import { AcademyAnnouncementPanel } from "@/modules/academy/announcement-panel";
import { getAcademyAnnouncementsData } from "@/modules/academy/announcement-queries";
import {
  saveAcademyAnnouncementAction,
  toggleAcademyAnnouncementAction,
} from "@/modules/academy/announcement-actions";

export default async function GroupsPage({
  searchParams,
}: {
  searchParams: Promise<{
    slot?: string;
    attendance?: string;
    details?: string;
  }>;
}) {
  const params = await searchParams;
  const [plannerData, announcementData] = await Promise.all([
    getPlannerWorkspaceData({ slotId: params.slot }),
    getAcademyAnnouncementsData(),
  ]);

  return (
    <>
      <PlannerWorkspace
        key={`${plannerData.selectedSlotId}-${plannerData.journal.date}-${params.attendance ?? "0"}`}
        data={plannerData}
        initialAttendanceOpen={params.attendance === "1"}
        initialDetailsOpen={params.details === "1"}
        actions={{
          createSlot: createClassSlotAction,
          updateSlot: updateClassSlotAction,
          deleteSlot: deleteClassSlotAction,
          replaceSchedule: replaceStudentScheduleAction,
          saveAttendance: saveSlotAttendanceAction,
        }}
      />
      <AcademyAnnouncementPanel
        data={announcementData}
        saveAction={saveAcademyAnnouncementAction}
        toggleAction={toggleAcademyAnnouncementAction}
      />
    </>
  );
}
