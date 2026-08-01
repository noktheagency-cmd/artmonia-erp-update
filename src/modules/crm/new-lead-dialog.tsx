import { createLeadClientAction } from "@/modules/crm/actions";
import { NewLeadDialogClient } from "@/modules/crm/new-lead-dialog-client";

export function NewLeadDialog({
  programs,
  campaigns,
  sourceOptions,
  currentManagerName,
}: {
  programs: Array<{ id: string; name: string }>;
  campaigns: Array<{ id: string; name: string }>;
  sourceOptions: string[];
  currentManagerName: string;
}) {
  return (
    <NewLeadDialogClient
      createLeadAction={createLeadClientAction}
      campaigns={campaigns}
      programs={programs}
      sourceOptions={sourceOptions}
      currentManagerName={currentManagerName}
    />
  );
}
