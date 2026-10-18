"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { deleteLeadAction, updateLeadAction } from "@/modules/crm/actions";
import { getLeadDetailAction } from "@/modules/crm/lead-detail-action";
import { LeadDetailDialogClient } from "@/modules/crm/lead-detail-dialog-client";
import type { CrmData } from "@/modules/crm/queries";

export function OverviewLeadDialog({ leadId, data, onClose }: {
  leadId: string;
  data: CrmData;
  onClose: () => void;
}) {
  const [lead, setLead] = useState<CrmData["leads"][number] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await getLeadDetailAction(leadId);
        if (cancelled) return;
        if (result.ok) setLead(result.data);
        else setError(result.message);
      } catch {
        if (!cancelled) setError("Müraciət profili yüklənmədi. Yenidən cəhd edin.");
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [leadId, attempt]);

  if (lead) return (
    <LeadDetailDialogClient
      lead={lead}
      programs={data.programs}
      managers={data.managers}
      sourceOptions={data.sourceOptions}
      returnTo={data.returnTo}
      canConvert={data.access.canConvertLead}
      updateLeadAction={updateLeadAction}
      deleteLeadAction={deleteLeadAction}
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
    />
  );

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Müraciət profili</DialogTitle>
          <DialogDescription role={error ? "alert" : "status"}>
            {error ?? "Profil yüklənir…"}
          </DialogDescription>
        </DialogHeader>
        {error ? <Button onClick={() => { setError(null); setAttempt((value) => value + 1); }}>Yenidən cəhd et</Button> : null}
      </DialogContent>
    </Dialog>
  );
}
