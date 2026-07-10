import { notFound } from "next/navigation";
import {
  assignWorkshopParticipantAction,
  cancelWorkshopParticipantAction,
  createWorkshopExpenseAction,
  deleteOrCancelWorkshopEventAction,
  recordWorkshopPaymentAction,
  updateWorkshopEventAction,
  updateWorkshopParticipantAction,
  voidWorkshopExpenseAction,
  voidWorkshopPaymentAction,
} from "@/modules/workshops/actions";
import { WorkshopDetailWorkspace } from "@/modules/workshops/workshop-detail-workspace";
import {
  getWorkshopDetailData,
  type WorkshopDetailFilters,
} from "@/modules/workshops/queries";

export const dynamic = "force-dynamic";

export default async function WorkshopDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<WorkshopDetailFilters & { add?: string }>;
}) {
  const [{ id }, filters] = await Promise.all([params, searchParams]);
  const data = await getWorkshopDetailData(id, filters);
  if (!data) notFound();

  return (
    <WorkshopDetailWorkspace
      data={data}
      autoOpen={filters.add === "1"}
      actions={{
        updateEvent: updateWorkshopEventAction,
        deleteOrCancelEvent: deleteOrCancelWorkshopEventAction,
        createParticipant: assignWorkshopParticipantAction,
        updateParticipant: updateWorkshopParticipantAction,
        cancelParticipant: cancelWorkshopParticipantAction,
        recordPayment: recordWorkshopPaymentAction,
        voidPayment: voidWorkshopPaymentAction,
        createExpense: createWorkshopExpenseAction,
        voidExpense: voidWorkshopExpenseAction,
      }}
    />
  );
}
