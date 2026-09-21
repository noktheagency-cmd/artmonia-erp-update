import { getPlannerWorkspaceData } from "@/modules/groups/planner-queries";
import { PlannerWorkspace } from "@/modules/groups/planner-workspace";
import {
  createClassSlotAction,
  deleteClassSlotAction,
  replaceStudentScheduleAction,
  saveSlotAttendanceAction,
  updateClassSlotAction,
} from "@/modules/groups/planner-actions";

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
  const plannerData = await getPlannerWorkspaceData({ slotId: params.slot });

  return (
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
  );
}
