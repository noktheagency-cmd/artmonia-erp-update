"use client";

import { useEffect, useRef, useState } from "react";
import { LeadAppointments } from "./lead-appointments";
import { LeadContactPanel } from "./lead-contact-panel";
import { LeadRegistrationDialog } from "./lead-registration-dialog";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  Check,
  CircleUserRound,
  Clock3,
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
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { FormSelect } from "@/components/ui/select";
import { StatusChip } from "@/components/ui/status-chip";
import type { CrmData } from "@/modules/crm/queries";
import {
  leadPrioritySelectOptions,
  nextActionTypeSelectOptions,
  type NextActionTypeValue,
} from "@/modules/crm/follow-up";
import { buildCrmSourceSelectOptions } from "@/modules/crm/source-options";
import { isContactStageCompleted, isMeetingStageCompleted, leadStageLabels, leadStageSelectOptions, leadStageTones, type LeadStageValue } from "@/modules/crm/stage";
import { DEFAULT_TRIAL_LESSON_COUNT } from "@/modules/crm/trial-lesson";
import { CRM_UPDATE_NOTE_MAX_LENGTH } from "@/modules/crm/note-limits";
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
  canConvert = true,
  updateLeadAction,
  deleteLeadAction,
  open: controlledOpen,
  onOpenChange,
  initialPanel = null,
}: {
  lead: LeadRow;
  programs: CrmData["programs"];
  managers: CrmData["managers"];
  sourceOptions: CrmData["sourceOptions"];
  returnTo: string;
  canConvert?: boolean;
  updateLeadAction: (formData: FormData) => unknown | Promise<unknown>;
  deleteLeadAction: (formData: FormData) => unknown | Promise<unknown>;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  initialPanel?: "contact" | "meeting" | null;
}) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  function setOpen(nextOpen: boolean) {
    setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  }
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [actionPanel, setActionPanel] = useState<"contact" | "meeting" | null>(null);
  const [note, setNote] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [stage, setStage] = useState<LeadStageValue>(lead.detail.stage);
  const [nextActionType, setNextActionType] = useState<NextActionTypeValue | "">(
    lead.detail.nextActionType,
  );
  const [trialLessonCount, setTrialLessonCount] = useState(
    String(lead.detail.trialLessonCount || DEFAULT_TRIAL_LESSON_COUNT),
  );
  const suggestion = lead.suggestion;
  const contactDone =
    suggestion?.panel !== "contact" &&
    (isContactStageCompleted(stage) || isContactStageCompleted(lead.stage));
  const meetingDone =
    suggestion?.panel !== "meeting" &&
    (isMeetingStageCompleted(stage) || isMeetingStageCompleted(lead.stage) || lead.meetingAttended);
  const readyToRegister = contactDone && meetingDone && stage !== "REGISTERED" && lead.stage !== "REGISTERED" && lead.canConvert;

  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setActionPanel(initialPanel);
      setNote("");
      setStage(lead.detail.stage);
      setNextActionType(lead.detail.nextActionType);
      setTrialLessonCount(String(lead.detail.trialLessonCount || DEFAULT_TRIAL_LESSON_COUNT));
    }
    if (!open) setActionPanel(null);
    wasOpen.current = open;
  }, [open, initialPanel, lead]);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setActionPanel(null);
      return;
    }

    setNote("");
    setStage(lead.detail.stage);
    setNextActionType(lead.detail.nextActionType);
    setTrialLessonCount(String(lead.detail.trialLessonCount || DEFAULT_TRIAL_LESSON_COUNT));
  }

  function handleStageChange(nextStage: string) {
    const normalizedStage = nextStage as LeadStageValue;
    setStage(normalizedStage);

    if (normalizedStage === "TRIAL_LESSON") {
      setTrialLessonCount((current) => current || String(DEFAULT_TRIAL_LESSON_COUNT));
      setNextActionType("TRIAL_LESSON_REMINDER");
    }
  }

  async function updateLead(formData: FormData) {
    if (!note.trim() || saving) return;
    setSaving(true);
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
    } finally {
      setSaving(false);
    }
  }

  async function deleteLead(formData: FormData) {
    if (!deleteReason.trim() || deleting) return;
    setDeleting(true);
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
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {controlledOpen === undefined ? <DialogTrigger asChild>
        <button className="crm-lead-open-button" type="button">
          <strong>{lead.name}</strong>
          <span>Profili aç</span>
        </button>
      </DialogTrigger> : null}
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
              <StatusChip tone={leadStageTones[stage]}>{leadStageLabels[stage]}</StatusChip>
              <StatusChip tone={lead.priorityTone}>{lead.priorityLabel}</StatusChip>
            </div>
          </div>
        </DialogHeader>

        <div className="crm-detail-body">
          <div className="crm-detail-summary" aria-label="Qısa məlumat">
            <div>
              <Phone aria-hidden="true" />
              <span>Telefon</span>
              <strong>{lead.phone}</strong>
            </div>
            <div>
              <UserRound aria-hidden="true" />
              <span>Məsul</span>
              <strong>{lead.manager}</strong>
            </div>
            <div>
              <CalendarClock aria-hidden="true" />
              <span>İzləmə tarixi</span>
              <strong>{lead.nextFollowUpAt}</strong>
            </div>
            <div>
              <Clock3 aria-hidden="true" />
              <span>Növbəti addım</span>
              <strong>{lead.nextActionTypeLabel}</strong>
            </div>
          </div>

          <section className="crm-dialog-section crm-manager-actions" aria-label="Menecer əsas əməliyyatları">
            <div className="crm-ops-bar">
              <div className="crm-ops-choices" role="group" aria-label="Əlaqə və görüş">
                <button
                  type="button"
                  className={[contactDone ? "is-done" : "", suggestion?.panel === "contact" && !contactDone ? "is-suggested" : ""].filter(Boolean).join(" ") || undefined}
                  aria-pressed={actionPanel === "contact"}
                  onClick={() => setActionPanel((value) => (value === "contact" ? null : "contact"))}
                >
                  {contactDone ? <Check aria-hidden="true" /> : null}
                  Əlaqə
                </button>
                <button
                  type="button"
                  className={[meetingDone ? "is-done" : "", suggestion?.panel === "meeting" && !meetingDone ? "is-suggested" : ""].filter(Boolean).join(" ") || undefined}
                  aria-pressed={actionPanel === "meeting"}
                  onClick={() => setActionPanel((value) => (value === "meeting" ? null : "meeting"))}
                >
                  {meetingDone ? <Check aria-hidden="true" /> : null}
                  Görüş
                </button>
              </div>
              <div className={readyToRegister ? "crm-ops-register is-ready" : "crm-ops-register"}>
                <LeadRegistrationDialog
                  lead={lead}
                  programs={programs}
                  sourceOptions={sourceOptions}
                  returnTo={returnTo}
                  canConvert={canConvert}
                />
              </div>
            </div>
            {readyToRegister ? (
              <p className="crm-ops-ready">Əlaqə və görüş tamamdır. Qeydiyyata alın.</p>
            ) : suggestion ? (
              <button
                type="button"
                className={`crm-ops-suggestion is-${suggestion.panel}`}
                onClick={() => setActionPanel(suggestion.panel)}
              >
                <strong>{suggestion.title}</strong>
                <span>{suggestion.action}</span>
              </button>
            ) : null}
            {open ? (
              <div className="crm-ops-scroll" hidden={actionPanel === null}>
                <div hidden={actionPanel !== "contact"}>
                  <LeadContactPanel
                    leadId={lead.id}
                    embedded
                    markedComplete={contactDone}
                    onReached={() => {
                      setStage((current) =>
                        current === "QUALIFIED" ||
                        current === "TRIAL_LESSON" ||
                        current === "TRIAL_CONSULTATION" ||
                        current === "REGISTERED" ||
                        current === "LOST"
                          ? current
                          : "CONTACTED",
                      );
                    }}
                  />
                </div>
                <div hidden={actionPanel !== "meeting"}>
                  <LeadAppointments leadId={lead.id} embedded markedComplete={meetingDone} />
                </div>
              </div>
            ) : null}
          </section>

          <form id={`lead-update-${lead.id}`} action={updateLead} className="crm-detail-update-form">
            <input name="leadId" type="hidden" value={lead.id} />
            <input name="returnTo" type="hidden" value={returnTo} />

            <section className="crm-dialog-section crm-profile-card">
              <header>
                <span className="crm-profile-card-icon" aria-hidden="true"><CircleUserRound /></span>
                <div>
                  <h3>Profil və maraq</h3>
                  <p>Ad, telefon və maraq məlumatı</p>
                </div>
              </header>
              <FieldGroup className="crm-dialog-fields">
                <Field>
                  <FieldLabel htmlFor={`lead-name-${lead.id}`}>Ad və soyad</FieldLabel>
                  <Input
                    id={`lead-name-${lead.id}`}
                    name="fullName"
                    defaultValue={lead.detail.fullName}
                    required
                    minLength={2}
                    maxLength={120}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`lead-phone-${lead.id}`}>Telefon</FieldLabel>
                  <Input
                    id={`lead-phone-${lead.id}`}
                    name="phone"
                    defaultValue={lead.detail.phone}
                    type="tel"
                  />
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
                  <FormSelect
                    aria-label="Status"
                    name="stage"
                    value={stage}
                    onValueChange={handleStageChange}
                    options={leadStageSelectOptions.map((option) => ({ ...option, disabled: option.value === "REGISTERED" && lead.stage !== "REGISTERED" }))}
                  />
                </Field>
                {stage === "TRIAL_LESSON" ? (
                  <Field>
                    <FieldLabel htmlFor={`lead-trial-count-${lead.id}`}>Sınaq dərsi sayı</FieldLabel>
                    <Input
                      id={`lead-trial-count-${lead.id}`}
                      name="trialLessonCount"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={100}
                      step={1}
                      value={trialLessonCount}
                      onChange={(event) => setTrialLessonCount(event.currentTarget.value)}
                      required
                    />
                    <FieldDescription>Seçim zamanı 1 dərs avtomatik qeyd olunur.</FieldDescription>
                  </Field>
                ) : null}
              </FieldGroup>
            </section>

            <section className="crm-dialog-section crm-profile-card crm-followup-card">
              <header>
                <span className="crm-profile-card-icon" aria-hidden="true"><CalendarClock /></span>
                <div>
                  <h3>İzləmə planı</h3>
                  <p>Prioritet, növbəti addım və qeyd</p>
                </div>
              </header>
              <FieldGroup className="crm-dialog-fields crm-followup-fields">
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
                    value={nextActionType}
                    onValueChange={(value) => setNextActionType(value as NextActionTypeValue | "")}
                    emptyLabel="Təyin edilməyib"
                    options={nextActionTypeSelectOptions}
                  />
                </Field>
                <Field>
                  <FieldLabel>Növbəti addım tarixi</FieldLabel>
                  <DatePicker
                    name="nextFollowUpDate"
                    defaultValue={lead.detail.nextFollowUpDate}
                    compact
                  />
                </Field>
                <Field className="is-full">
                  <FieldLabel htmlFor={`lead-note-${lead.id}`}>Yeniləmə qeydi *</FieldLabel>
                  <Input
                    id={`lead-note-${lead.id}`}
                    name="note"
                    value={note}
                    onChange={(event) => setNote(event.currentTarget.value)}
                    required
                    placeholder="Səbəb və ya növbəti addım"
                    maxLength={CRM_UPDATE_NOTE_MAX_LENGTH}
                    aria-describedby={`lead-note-limit-${lead.id}`}
                  />
                  <FieldDescription id={`lead-note-limit-${lead.id}`}>
                    {note.length.toLocaleString("az-AZ")} / {CRM_UPDATE_NOTE_MAX_LENGTH.toLocaleString("az-AZ")} simvol
                  </FieldDescription>
                </Field>
              </FieldGroup>
            </section>

            <section className="crm-dialog-section crm-profile-card crm-history-card">
              <header>
                <span className="crm-profile-card-icon" aria-hidden="true"><History /></span>
                <div>
                  <h3>Müraciət tarixçəsi</h3>
                  <p>Status dəyişiklikləri</p>
                </div>
              </header>
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
          </form>
        </div>

        <DialogFooter className="crm-dialog-actions">
          <Button
            className="crm-detail-delete-trigger"
            type="button"
            variant="ghost"
            onClick={() => { setDeleteReason(""); setDeleteOpen(true); }}
          >
            <Trash2 data-icon="inline-start" />
            Müraciəti sil
          </Button>
          <DialogClose asChild><Button type="button" variant="outline">Ləğv et</Button></DialogClose>
          <Button
            type="submit"
            form={`lead-update-${lead.id}`}
            disabled={!note.trim() || saving}
          >
            <Pencil data-icon="inline-start" />
            Yadda saxla
          </Button>
        </DialogFooter>

        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogContent className="crm-modern-dialog crm-delete-dialog">
            <DialogHeader>
              <DialogTitle>Müraciəti silmək istəyirsiniz?</DialogTitle>
              <DialogDescription>
                <strong>{lead.name}</strong> üçün olan müraciət profili, tarixçə və açıq izləmə tapşırıqları silinəcək. Bu əməliyyatı geri qaytarmaq mümkün deyil.
              </DialogDescription>
            </DialogHeader>
            <form action={deleteLead}>
              <Field>
                <FieldLabel htmlFor={`lead-delete-reason-${lead.id}`}>Silinmə açıqlaması *</FieldLabel>
                <Input
                  id={`lead-delete-reason-${lead.id}`}
                  name="reason"
                  value={deleteReason}
                  onChange={(event) => setDeleteReason(event.currentTarget.value)}
                  placeholder="Müraciətin silinmə səbəbini yazın"
                  required
                  maxLength={500}
                />
              </Field>
              <input name="leadId" type="hidden" value={lead.id} />
              <input name="returnTo" type="hidden" value={returnTo} />
              <DialogFooter className="crm-dialog-actions">
                <DialogClose asChild><Button type="button" variant="outline">Ləğv et</Button></DialogClose>
                <Button type="submit" variant="destructive" disabled={!deleteReason.trim() || deleting}><Trash2 data-icon="inline-start" />Bəli, sil</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
