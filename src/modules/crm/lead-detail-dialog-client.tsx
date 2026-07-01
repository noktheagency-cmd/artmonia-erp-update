"use client";

import { CalendarClock, Clock3, History, Pencil, Phone, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { FormSelect } from "@/components/ui/select";
import { StatusChip } from "@/components/ui/status-chip";
import type { CrmData } from "@/modules/crm/queries";
import {
  leadPrioritySelectOptions,
  nextActionTypeSelectOptions,
} from "@/modules/crm/follow-up";
import { buildCrmSourceSelectOptions } from "@/modules/crm/source-options";
import { leadStageSelectOptions } from "@/modules/crm/stage";

type LeadRow = CrmData["leads"][number];

export function LeadDetailDialogClient({
  lead,
  programs,
  managers,
  sourceOptions,
  returnTo,
  updateLeadAction,
}: {
  lead: LeadRow;
  programs: CrmData["programs"];
  managers: CrmData["managers"];
  sourceOptions: CrmData["sourceOptions"];
  returnTo: string;
  updateLeadAction: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="lead-open-button" type="button">
          <strong>{lead.name}</strong>
          <span>Profili aç</span>
        </button>
      </DialogTrigger>
      <DialogContent className="lead-detail-dialog">
        <DialogHeader>
          <DialogTitle>{lead.name}</DialogTitle>
          <DialogDescription>
            Müraciət profili, redaktə olunan CRM sahələri və son aktivlik.
          </DialogDescription>
        </DialogHeader>

        <div className="lead-detail-summary">
          <div>
            <Phone />
            <span>{lead.phone}</span>
          </div>
          <div>
            <UserRound />
            <span>{lead.manager}</span>
          </div>
          <div>
            <CalendarClock />
            <span>{lead.nextFollowUpAt}</span>
          </div>
          <div>
            <Clock3 />
            <span>{lead.nextActionTypeLabel}</span>
          </div>
        </div>

        <form action={updateLeadAction} className="crm-form crm-form-dialog">
          <input name="leadId" type="hidden" value={lead.id} />
          <input name="returnTo" type="hidden" value={returnTo} />

          <div className="field-grid">
            <label className="form-field">
              <span>Ad və soyad</span>
              <Input
                name="fullName"
                defaultValue={lead.detail.fullName}
                required
                minLength={2}
                maxLength={120}
              />
            </label>
            <label className="form-field">
              <span>Telefon</span>
              <Input name="phone" defaultValue={lead.detail.phone} maxLength={40} />
            </label>
          </div>

          <div className="field-grid">
            <label className="form-field">
              <span>Mənbə</span>
              <FormSelect
                name="source"
                defaultValue={lead.detail.source}
                emptyLabel="Seçilməyib"
                options={buildCrmSourceSelectOptions(sourceOptions)}
              />
            </label>
            <label className="form-field">
              <span>Proqram</span>
              <FormSelect
                name="programId"
                defaultValue={lead.detail.programId}
                emptyLabel="Seçilməyib"
                options={programs.map((program) => ({
                  value: program.id,
                  label: program.name,
                }))}
              />
            </label>
          </div>

          <div className="field-grid">
            <label className="form-field">
              <span>Məsul şəxs</span>
              <FormSelect
                name="managerId"
                defaultValue={lead.detail.managerId}
                emptyLabel="Avtomatik təyin et"
                options={managers.map((manager) => ({
                  value: manager.id,
                  label: manager.fullName,
                }))}
              />
            </label>
            <label className="form-field">
              <span>Status</span>
              <FormSelect
                name="stage"
                defaultValue={lead.detail.stage}
                options={leadStageSelectOptions}
              />
            </label>
          </div>

          <div className="field-grid">
            <label className="form-field">
              <span>Prioritet</span>
              <FormSelect
                name="priority"
                defaultValue={lead.detail.priority}
                options={leadPrioritySelectOptions}
              />
            </label>
            <label className="form-field">
              <span>Növbəti addım</span>
              <FormSelect
                name="nextActionType"
                defaultValue={lead.detail.nextActionType}
                emptyLabel="Təyin edilməyib"
                options={nextActionTypeSelectOptions}
              />
            </label>
          </div>

          <div className="field-grid">
            <label className="form-field">
              <span>Növbəti addım tarixi</span>
              <DatePicker
                name="nextFollowUpDate"
                defaultValue={lead.detail.nextFollowUpDate}
              />
            </label>
            <label className="form-field">
              <span>Yeniləmə qeydi</span>
              <Input name="note" placeholder="Səbəb və ya növbəti addım" maxLength={240} />
            </label>
          </div>

          <div className="lead-history">
            <div className="lead-history-title">
              <History />
              <span>Müraciət tarixçəsi</span>
              <StatusChip tone={lead.stageTone}>{lead.stageLabel}</StatusChip>
              <StatusChip tone={lead.priorityTone}>{lead.priorityLabel}</StatusChip>
            </div>
            {lead.detail.timeline.length > 0 ? (
              <ol>
                {lead.detail.timeline.map((item) => (
                  <li key={item.id}>
                    <strong>{item.label}</strong>
                    <span>{item.reason}</span>
                    <small>
                      {item.date} - {item.changedBy}
                    </small>
                  </li>
                ))}
              </ol>
            ) : (
              <p>Tarixçə yoxdur</p>
            )}
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Ləğv et
              </Button>
            </DialogClose>
            <Button type="submit">
              <Pencil data-icon="inline-start" />
              Yadda saxla
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
