"use client";

import { ArrowRight, CheckCircle2, Inbox, Phone, Sparkles, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/status-chip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { convertLeadToStudentAction } from "@/modules/crm/actions";
import { LeadDetailDialog } from "@/modules/crm/lead-detail-dialog";
import type { CrmData } from "@/modules/crm/queries";
import { unwrapActionResult } from "@/lib/action-result";
import { notifyCaughtError } from "@/lib/app-notifications";

export function CrmLeadsTable({
  data,
  preview = false,
  onShowAll,
  onClearFilters,
}: {
  data: CrmData;
  preview?: boolean;
  onShowAll?: () => void;
  onClearFilters: () => void;
}) {
  const rows = preview ? data.leads.slice(0, 5) : data.leads;

  async function convertLead(formData: FormData) {
    try {
      unwrapActionResult(await convertLeadToStudentAction(formData));
    } catch (error) {
      notifyCaughtError(error, "Müraciət tələbəyə çevrilmədi.");
    }
  }

  return (
    <article className="crm-panel crm-table-panel crm-enter" style={{ animationDelay: "320ms" }}>
      <header className="crm-table-heading">
        <div>
          <h2>Müraciət siyahısı</h2>
          <p>{data.leads.length} müraciət seçilmiş görünüşə uyğundur</p>
        </div>
        {preview && data.leads.length > 0 ? (
          <Button type="button" variant="outline" size="sm" onClick={onShowAll}>
            Tam siyahı
            <ArrowRight data-icon="inline-end" />
          </Button>
        ) : null}
      </header>

      {rows.length > 0 ? (
        <Table className="crm-leads-table" aria-label="Müraciət siyahısı">
          <TableHeader>
            <TableRow>
              <TableHead>Müraciət</TableHead>
              <TableHead>Maraq</TableHead>
              <TableHead>Status / prioritet</TableHead>
              <TableHead>Növbəti addım</TableHead>
              <TableHead>Məsul / qeyd</TableHead>
              <TableHead>Əməliyyat</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((lead) => (
              <TableRow key={lead.id}>
                <TableCell>
                  <div className="crm-lead-person-cell">
                    <span className="crm-person-avatar" aria-hidden="true">
                      {lead.name.slice(0, 2).toUpperCase()}
                    </span>
                    <div>
                      <LeadDetailDialog
                        lead={lead}
                        managers={data.managers}
                        programs={data.programs}
                        sourceOptions={data.sourceOptions}
                        returnTo={data.returnTo}
                      />
                      <span>
                        <Phone aria-hidden="true" />
                        {lead.phone}
                      </span>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="crm-table-stack">
                    <strong>{lead.program}</strong>
                    <span>{lead.source}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="crm-status-pair">
                    <StatusChip tone={lead.stageTone}>{lead.stageLabel}</StatusChip>
                    <StatusChip tone={lead.priorityTone}>{lead.priorityLabel}</StatusChip>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="crm-table-stack">
                    <strong>{lead.nextActionTypeLabel}</strong>
                    <span>{lead.nextFollowUpAt}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="crm-table-stack">
                    <strong className="crm-owner-line">
                      <UserRound aria-hidden="true" />
                      {lead.manager}
                    </strong>
                    <span className="crm-note-line">{lead.latestNote || "Qeyd yoxdur"}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <form action={convertLead} className="crm-convert-form">
                    <input type="hidden" name="leadId" value={lead.id} />
                    <input type="hidden" name="returnTo" value={data.returnTo} />
                    <Button
                      type="submit"
                      variant={lead.canConvert ? "default" : "ghost"}
                      size="sm"
                      disabled={!lead.canConvert || !data.access.canConvertLead}
                      aria-disabled={!lead.canConvert || !data.access.canConvertLead}
                      title={lead.canConvert ? "Tələbə kimi qeydiyyata al" : lead.conversionLabel}
                    >
                      {lead.canConvert ? <CheckCircle2 data-icon="inline-start" /> : null}
                      {lead.conversionLabel}
                    </Button>
                  </form>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <div className="crm-empty-state">
          <span className="crm-empty-icon" aria-hidden="true">
            <Inbox />
          </span>
          <h3>Müraciət tapılmadı</h3>
          <p>Seçilmiş filtrlərə uyğun qeyd yoxdur. Filtrləri dəyişdirib yenidən yoxlayın.</p>
          <Button type="button" variant="outline" onClick={onClearFilters}>
            <Sparkles data-icon="inline-start" />
            Filtrləri təmizlə
          </Button>
        </div>
      )}
    </article>
  );
}
