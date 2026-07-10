import {
  addGroupMemberAction,
  archiveGroupAction,
  changeGroupMemberTeacherAction,
  createGroupAction,
  endGroupMembershipAction,
  saveAttendanceAction,
  updateGroupAction,
} from "@/modules/groups/actions";
import { GroupWorkspace } from "@/modules/groups/group-workspace";
import { getGroupWorkspaceData } from "@/modules/groups/queries";

export default async function GroupsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; group?: string; date?: string }>;
}) {
  const params = await searchParams;
  const data = await getGroupWorkspaceData({ groupId: params.group, date: params.date });
  const activeTab = params.tab === "journal" ? "journal" : "groups";

  return (
    <GroupWorkspace
      key={`${activeTab}-${data.selectedGroupId}-${data.journal.date}`}
      data={data}
      activeTab={activeTab}
      actions={{
        createGroup: createGroupAction,
        updateGroup: updateGroupAction,
        archiveGroup: archiveGroupAction,
        addMember: addGroupMemberAction,
        changeTeacher: changeGroupMemberTeacherAction,
        endMembership: endGroupMembershipAction,
        saveAttendance: saveAttendanceAction,
      }}
    />
  );
}
