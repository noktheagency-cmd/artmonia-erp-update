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
  canDelete = false,
  open,
  onOpenChange,
  initialPanel = null,
}: {
  lead: CrmData["leads"][number];
  programs: CrmData["programs"];
  managers: CrmData["managers"];
  sourceOptions: CrmData["sourceOptions"];
  returnTo: string;
  canConvert?: boolean;
  canDelete?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  initialPanel?: "contact" | "meeting" | null;
}) {
  return (
    <LeadDetailDialogClient
      lead={lead}
      managers={managers}
      programs={programs}
      sourceOptions={sourceOptions}
      returnTo={returnTo}
      canConvert={canConvert}
      canDelete={canDelete}
      updateLeadAction={updateLeadAction}
      deleteLeadAction={deleteLeadAction}
      open={open}
      onOpenChange={onOpenChange}
      initialPanel={initialPanel}
    />
  );
}
