import { createLeadClientAction } from "@/modules/crm/actions";
import { NewLeadDialogClient } from "@/modules/crm/new-lead-dialog-client";

export function NewLeadDialog({
  programs,
  managers,
  campaigns,
  sourceOptions,
}: {
  programs: Array<{ id: string; name: string }>;
  managers: Array<{ id: string; fullName: string }>;
  campaigns: Array<{ id: string; name: string }>;
  sourceOptions: string[];
}) {
  return (
    <NewLeadDialogClient
      createLeadAction={createLeadClientAction}
      managers={managers}
      campaigns={campaigns}
      programs={programs}
      sourceOptions={sourceOptions}
    />
  );
}
