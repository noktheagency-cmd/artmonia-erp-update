"use client";

import { useState } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  CircleUserRound,
  Clock3,
  FileText,
  History,
  Pencil,
  Phone,
  Trash2,
  UserRound,
} from "lucide-react";
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { FormSelect } from "@/components/ui/select";
import { StatusChip } from "@/components/ui/status-chip";
import type { CrmData } from "@/modules/crm/queries";
import {
  leadPrioritySelectOptions,
  nextActionTypeSelectOptions,
} from "@/modules/crm/follow-up";
import { buildCrmSourceSelectOptions } from "@/modules/crm/source-options";
import { leadStageSelectOptions } from "@/modules/crm/stage";
import { educationLevelOptions } from "@/modules/students/education-level-options";
import { unwrapActionResult } from "@/lib/action-result";
import { notifyCaughtError, notifySuccess } from "@/lib/app-notifications";

type LeadRow = CrmData["leads"][number];

export function LeadDetailDialogClient({
  lead,
  programs,
  managers,
  sourceOptions,
  returnTo,
  updateLeadAction,
  deleteLeadAction,
}: {
  lead: LeadRow;
  programs: CrmData["programs"];
  managers: CrmData["managers"];
  sourceOptions: CrmData["sourceOptions"];
  returnTo: string;
  updateLeadAction: (formData: FormData) => unknown | Promise<unknown>;
  deleteLeadAction: (formData: FormData) => unknown | Promise<unknown>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function updateLead(formData: FormData) {
    try {
      const result = unwrapActionResult(await updateLeadAction(formData)) as {
        redirectTo: string;
      };
      setOpen(false);
      notifySuccess("Müraciət yeniləndi", "Dəyişikliklər yadda saxlanıldı.");
      router.replace(result.redirectTo as Route, { scroll: false });
      router.refresh();
    } catch (error) {
      notifyCaughtError(error, "Müraciət yenilənmədi.");
    }
  }

  async function deleteLead(formData: FormData) {
    try {
      const result = unwrapActionResult(await deleteLeadAction(formData)) as {
        redirectTo: string;
      };
      setDeleteOpen(false);
      setOpen(false);
      notifySuccess("Müraciət silindi", "Müraciət siyahıdan çıxarıldı.");
      router.replace(result.redirectTo as Route, { scroll: false });
      router.refresh();
    } catch (error) {
      notifyCaughtError(error, "Müraciət silinmədi.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="crm-lead-open-button" type="button">
          <strong>{lead.name}</strong>
          <span>Profili aç</span>
        </button>
      </DialogTrigger>
      <DialogContent className="crm-modern-dialog crm-detail-dialog">
        <DialogHeader>
          <div className="crm-detail-title-row">
            <span className="crm-detail-avatar" aria-hidden="true">
              {lead.name.slice(0, 2).toUpperCase()}
            </span>
            <div>
              <DialogTitle>{lead.name}</DialogTitle>
              <DialogDescription>Müraciət profili, izləmə planı və CRM tarixçəsi.</DialogDescription>
            </div>
            <div className="crm-detail-statuses">
              <StatusChip tone={lead.stageTone}>{lead.stageLabel}</StatusChip>
              <StatusChip tone={lead.priorityTone}>{lead.priorityLabel}</StatusChip>
            </div>
          </div>
        </DialogHeader>

        <div className="crm-detail-summary">
          <div><Phone aria-hidden="true" /><span>Telefon</span><strong>{lead.phone}</strong></div>
          <div><UserRound aria-hidden="true" /><span>Məsul</span><strong>{lead.manager}</strong></div>
          <div><CalendarClock aria-hidden="true" /><span>İzləmə tarixi</span><strong>{lead.nextFollowUpAt}</strong></div>
          <div><Clock3 aria-hidden="true" /><span>Növbəti addım</span><strong>{lead.nextActionTypeLabel}</strong></div>
        </div>

        <form action={updateLead} className="crm-dialog-form">
          <input name="leadId" type="hidden" value={lead.id} />
          <input name="returnTo" type="hidden" value={returnTo} />

          <div className="crm-dialog-scroll crm-detail-scroll">
            <section className="crm-dialog-section">
              <header><CircleUserRound aria-hidden="true" /><h3>Profil və maraq</h3></header>
              <FieldGroup className="crm-dialog-fields">
                <Field>
                  <FieldLabel htmlFor={`lead-name-${lead.id}`}>Ad və soyad</FieldLabel>
                  <InputGroup>
                    <InputGroupAddon aria-hidden="true"><CircleUserRound /></InputGroupAddon>
                    <InputGroupInput
                      id={`lead-name-${lead.id}`}
                      name="fullName"
                      defaultValue={lead.detail.fullName}
                      required
                      minLength={2}
                      maxLength={120}
                    />
                  </InputGroup>
                </Field>
                <Field>
                  <FieldLabel htmlFor={`lead-phone-${lead.id}`}>Telefon</FieldLabel>
                  <InputGroup>
                    <InputGroupAddon aria-hidden="true"><Phone /></InputGroupAddon>
                    <InputGroupInput
                      id={`lead-phone-${lead.id}`}
                      name="phone"
                      defaultValue={lead.detail.phone}
                      maxLength={40}
                    />
                  </InputGroup>
                </Field>
                <Field>
                  <FieldLabel>Mənbə</FieldLabel>
                  <FormSelect
                    aria-label="Mənbə"
                    name="source"
                    defaultValue={lead.detail.source}
                    emptyLabel="Seçilməyib"
                    options={buildCrmSourceSelectOptions(sourceOptions)}
                    searchable
                    searchPlaceholder="Mənbə axtar..."
                    catalogKey="CRM_SOURCE"
                    createLabel="Yeni mənbə əlavə et"
                  />
                </Field>
                <Field>
                  <FieldLabel>Proqram</FieldLabel>
                  <FormSelect
                    aria-label="Proqram"
                    name="programId"
                    defaultValue={lead.detail.programId}
                    emptyLabel="Seçilməyib"
                    options={programs.map((program) => ({ value: program.id, label: program.name }))}
                  />
                </Field>
                <Field>
                  <FieldLabel>Təhsil səviyyəsi</FieldLabel>
                  <FormSelect
                    aria-label="Təhsil səviyyəsi"
                    name="educationLevel"
                    defaultValue={lead.detail.educationLevel}
                    emptyLabel="Təhsil səviyyəsi seçilməyib"
                    searchable
                    catalogKey="STUDENT_EDUCATION_LEVEL"
                    createLabel="Yeni təhsil səviyyəsi əlavə et"
                    options={educationLevelOptions}
                  />
                </Field>
                <Field>
                  <FieldLabel>Məsul şəxs</FieldLabel>
                  <FormSelect
                    aria-label="Məsul şəxs"
                    name="managerId"
                    defaultValue={lead.detail.managerId}
                    emptyLabel="Avtomatik təyin et"
                    options={managers.map((manager) => ({ value: manager.id, label: manager.fullName }))}
                  />
                </Field>
                <Field>
                  <FieldLabel>Status</FieldLabel>
                  <FormSelect aria-label="Status" name="stage" defaultValue={lead.detail.stage} options={leadStageSelectOptions} />
                </Field>
              </FieldGroup>
            </section>

            <section className="crm-dialog-section">
              <header><CalendarClock aria-hidden="true" /><h3>İzləmə planı</h3></header>
              <FieldGroup className="crm-dialog-fields">
                <Field>
                  <FieldLabel>Prioritet</FieldLabel>
                  <FormSelect
                    aria-label="Prioritet"
                    name="priority"
                    defaultValue={lead.detail.priority}
                    options={leadPrioritySelectOptions}
                  />
                </Field>
                <Field>
                  <FieldLabel>Növbəti addım</FieldLabel>
                  <FormSelect
                    aria-label="Növbəti addım"
                    name="nextActionType"
                    defaultValue={lead.detail.nextActionType}
                    emptyLabel="Təyin edilməyib"
                    options={nextActionTypeSelectOptions}
                  />
                </Field>
                <Field>
                  <FieldLabel>Növbəti addım tarixi</FieldLabel>
                  <DatePicker name="nextFollowUpDate" defaultValue={lead.detail.nextFollowUpDate} />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`lead-note-${lead.id}`}>Yeniləmə qeydi</FieldLabel>
                  <InputGroup>
                    <InputGroupAddon aria-hidden="true"><FileText /></InputGroupAddon>
                    <InputGroupInput
                      id={`lead-note-${lead.id}`}
                      name="note"
                      placeholder="Səbəb və ya növbəti addım"
                      maxLength={240}
                    />
                  </InputGroup>
                </Field>
              </FieldGroup>
            </section>

            <section className="crm-dialog-section crm-history-section">
              <header><History aria-hidden="true" /><h3>Müraciət tarixçəsi</h3></header>
              {lead.detail.timeline.length > 0 ? (
                <ol className="crm-history-list">
                  {lead.detail.timeline.map((item) => (
                    <li key={item.id}>
                      <span aria-hidden="true" />
                      <div><strong>{item.label}</strong><p>{item.reason}</p></div>
                      <small>{item.date} · {item.changedBy}</small>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="crm-history-empty"><History aria-hidden="true" />Tarixçə yoxdur</div>
              )}
            </section>
          </div>

          <DialogFooter className="crm-dialog-actions">
            <Button
              className="crm-detail-delete-trigger"
              type="button"
              variant="ghost"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 data-icon="inline-start" />
              Müraciəti sil
            </Button>
            <DialogClose asChild><Button type="button" variant="outline">Ləğv et</Button></DialogClose>
            <Button type="submit"><Pencil data-icon="inline-start" />Yadda saxla</Button>
          </DialogFooter>
        </form>

        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogContent className="crm-modern-dialog crm-delete-dialog">
            <DialogHeader>
              <DialogTitle>Müraciəti silmək istəyirsiniz?</DialogTitle>
              <DialogDescription>
                <strong>{lead.name}</strong> üçün olan müraciət profili, tarixçə və açıq izləmə tapşırıqları silinəcək. Bu əməliyyatı geri qaytarmaq mümkün deyil.
              </DialogDescription>
            </DialogHeader>
            <form action={deleteLead}>
              <input name="leadId" type="hidden" value={lead.id} />
              <input name="returnTo" type="hidden" value={returnTo} />
              <DialogFooter className="crm-dialog-actions">
                <DialogClose asChild><Button type="button" variant="outline">Ləğv et</Button></DialogClose>
                <Button type="submit" variant="destructive"><Trash2 data-icon="inline-start" />Bəli, sil</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
