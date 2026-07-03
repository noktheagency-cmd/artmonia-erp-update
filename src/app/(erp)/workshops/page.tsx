import {
  assignWorkshopParticipantAction,
  createWorkshopEventAction,
} from "@/modules/workshops/actions";
import { getWorkshopData } from "@/modules/workshops/queries";
import { WorkshopWorkspace } from "@/modules/workshops/workshop-workspace";

export default async function WorkshopsPage() {
  const data = await getWorkshopData();

  return (
    <WorkshopWorkspace
      data={data}
      createWorkshopEventAction={createWorkshopEventAction}
      assignWorkshopParticipantAction={assignWorkshopParticipantAction}
    />
  );
}
