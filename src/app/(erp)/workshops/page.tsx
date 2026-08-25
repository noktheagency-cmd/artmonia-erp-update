import "@/modules/workshops/workshops.css";
import {
  createWorkshopEventAction,
  createWorkshopFollowUpAction,
  updateWorkshopFollowUpAction,
} from "@/modules/workshops/actions";
import {
  generateWorkshopOfferAction,
  getWorkshopOfferAudienceAction,
} from "@/modules/workshops/offer-actions";
import { getWorkshopData, type WorkshopFilters } from "@/modules/workshops/queries";
import { WorkshopWorkspace } from "@/modules/workshops/workshop-workspace";

export const dynamic = "force-dynamic";

export default async function WorkshopsPage({
  searchParams,
}: {
  searchParams: Promise<WorkshopFilters>;
}) {
  const data = await getWorkshopData(await searchParams);

  return (
    <WorkshopWorkspace
      data={data}
      createWorkshopEventAction={createWorkshopEventAction}
      createWorkshopFollowUpAction={createWorkshopFollowUpAction}
      updateWorkshopFollowUpAction={updateWorkshopFollowUpAction}
      loadOfferAudienceAction={getWorkshopOfferAudienceAction}
      generateOfferAction={generateWorkshopOfferAction}
    />
  );
}
