import { createLeadClientAction } from "@/modules/crm/actions";
import { NewLeadDialogClient } from "@/modules/crm/new-lead-dialog-client";

export function NewLeadDialog({
  programs,
  managers,
  sourceOptions,
}: {
  programs: Array<{ id: string; name: string }>;
  managers: Array<{ id: string; fullName: string }>;
  sourceOptions: string[];
}) {
  return (
    <NewLeadDialogClient
      createLeadAction={createLeadClientAction}
      managers={managers}
      programs={programs}
      sourceOptions={sourceOptions}
    />
  );
}
