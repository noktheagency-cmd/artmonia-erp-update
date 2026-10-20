import { createLeadClientAction } from "@/modules/crm/actions";
import { NewLeadDialogClient } from "@/modules/crm/new-lead-dialog-client";

export function NewLeadDialog({
  programs,
  sourceOptions,
  currentManagerName,
}: {
  programs: Array<{ id: string; name: string }>;
  sourceOptions: string[];
  currentManagerName: string;
}) {
  return (
    <NewLeadDialogClient
      createLeadAction={createLeadClientAction}
      programs={programs}
      sourceOptions={sourceOptions}
      currentManagerName={currentManagerName}
    />
  );
}
