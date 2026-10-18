import { deleteLeadAction, updateLeadAction } from "@/modules/crm/actions";
import { LeadDetailDialogClient } from "@/modules/crm/lead-detail-dialog-client";
import type { CrmData } from "@/modules/crm/queries";

export function LeadDetailDialog({
  lead,
  programs,
  managers,
  sourceOptions,
  returnTo,
  canConvert = true,
}: {
  lead: CrmData["leads"][number];
  programs: CrmData["programs"];
  managers: CrmData["managers"];
  sourceOptions: CrmData["sourceOptions"];
  returnTo: string;
  canConvert?: boolean;
}) {
  return (
    <LeadDetailDialogClient
      lead={lead}
      managers={managers}
      programs={programs}
      sourceOptions={sourceOptions}
      returnTo={returnTo}
      canConvert={canConvert}
      updateLeadAction={updateLeadAction}
      deleteLeadAction={deleteLeadAction}
    />
  );
}
