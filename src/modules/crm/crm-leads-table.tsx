"use client";

import { useState } from "react";
import { ArrowRight, Inbox, Phone, Sparkles, UserRound } from "lucide-react";
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
import { TablePagination, useClientTablePagination } from "@/components/ui/table-pagination";
import { LeadDetailDialog } from "@/modules/crm/lead-detail-dialog";
import { LeadRegistrationDialog } from "@/modules/crm/lead-registration-dialog";
import type { CrmData } from "@/modules/crm/queries";

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
  const pagination = useClientTablePagination(data.leads);
  const rows = preview ? data.leads.slice(0, 5) : pagination.pageRows;

  return (
    <article className="crm-panel crm-table-panel crm-enter" style={{ animationDelay: "320ms" }}>
      <header className="crm-table-heading">
        <div>
          <h2>Müraciət siyahısı</h2>
          <p>
            {data.listTotalCount > data.leads.length
              ? `${data.leads.length} / ${data.listTotalCount} müraciət göstərilir (seçilmiş filtr)`
              : `${data.listTotalCount} müraciət seçilmiş görünüşə uyğundur`}
          </p>
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
              <TableHead className="crm-status-col">Status / prioritet</TableHead>
              <TableHead>Növbəti addım</TableHead>
              <TableHead>Məsul / qeyd</TableHead>
              <TableHead>Əməliyyat</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((lead) => (
              <CrmLeadRow key={lead.id} lead={lead} data={data} />
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
      {!preview ? (
        <TablePagination
          page={pagination.page}
          pageSize={pagination.pageSize}
          total={pagination.total}
          onPageChange={pagination.setPage}
          onPageSizeChange={pagination.setPageSize}
          label="Müraciət siyahısı səhifələri"
        />
      ) : null}
    </article>
  );
}

function CrmLeadRow({
  lead,
  data,
}: {
  lead: CrmData["leads"][number];
  data: CrmData;
}) {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<"contact" | "meeting" | null>(null);

  function openLead(nextPanel: "contact" | "meeting" | null) {
    setPanel(nextPanel);
    setOpen(true);
  }

  return (
    <TableRow>
      <TableCell>
        <div className="crm-lead-person-cell">
          <span className="crm-person-avatar" aria-hidden="true">
            {lead.name.slice(0, 2).toUpperCase()}
          </span>
          <div>
            <button className="crm-lead-open-button" type="button" onClick={() => openLead(null)}>
              <span className="crm-lead-name-row">
                <strong>{lead.name}</strong>
                {lead.isNewToday ? <span className="crm-new-badge">Yeni</span> : null}
              </span>
              <span>Profili aç</span>
            </button>
            <span>
              <Phone aria-hidden="true" />
              {lead.phone}
            </span>
            <LeadDetailDialog
              lead={lead}
              managers={data.managers}
              programs={data.programs}
              sourceOptions={data.sourceOptions}
              returnTo={data.returnTo}
              canConvert={data.access.canConvertLead}
              open={open}
              onOpenChange={setOpen}
              initialPanel={panel}
            />
          </div>
        </div>
      </TableCell>
      <TableCell>
        <div className="crm-table-stack">
          <strong>{lead.program}</strong>
          <span>{lead.source}</span>
        </div>
      </TableCell>
      <TableCell className="crm-status-col">
        <div className="crm-status-cell">
          <StatusChip tone={lead.stageTone}>{lead.stageLabel}</StatusChip>
          <span className={`crm-priority-line is-${lead.priorityTone}`}>
            {lead.priorityLabel}
          </span>
          {lead.trialLessonCount > 0 ? (
            <small className="crm-trial-count-note">{lead.trialLessonCount} sınaq dərsi</small>
          ) : null}
        </div>
      </TableCell>
      <TableCell>
        <div className="crm-table-stack">
          <strong>{lead.nextActionTypeLabel}</strong>
          <span>{lead.nextFollowUpAt}</span>
          {lead.suggestion ? (
            <button
              type="button"
              className={`crm-suggestion is-${lead.suggestion.panel}`}
              onClick={() => openLead(lead.suggestion?.panel ?? null)}
            >
              {lead.suggestion.action}
            </button>
          ) : null}
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
        <LeadRegistrationDialog
          lead={lead}
          programs={data.programs}
          sourceOptions={data.sourceOptions}
          returnTo={data.returnTo}
          canConvert={data.access.canConvertLead}
        />
      </TableCell>
    </TableRow>
  );
}
