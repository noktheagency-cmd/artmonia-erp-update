"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BookOpen,
  CalendarClock,
  CircleUserRound,
  FileText,
  LoaderCircle,
  Phone,
  Plus,
  UserPlus,
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
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { FormSelect } from "@/components/ui/select";
import {
  leadPrioritySelectOptions,
  nextActionTypeSelectOptions,
  type NextActionTypeValue,
} from "@/modules/crm/follow-up";
import { buildCrmSourceSelectOptions } from "@/modules/crm/source-options";
import {
  formatLeadStageLabel,
  leadStageSelectOptions,
  type LeadStageValue,
} from "@/modules/crm/stage";
import { DEFAULT_TRIAL_LESSON_COUNT } from "@/modules/crm/trial-lesson";
import type { CreateLeadFormState } from "@/modules/crm/actions";
import { educationLevelOptions } from "@/modules/students/education-level-options";

type DuplicateMatch = {
  id: string;
  fullName: string;
  phone: string;
  students: Array<{ code: string; status: string }>;
  leads: Array<{ stage: string; createdAt: string }>;
};

type DuplicateResponse = { matches: DuplicateMatch[] };

export function NewLeadDialogClient({
  programs,
  sourceOptions,
  currentManagerName,
  createLeadAction,
}: {
  programs: Array<{ id: string; name: string }>;
  sourceOptions: string[];
  currentManagerName: string;
  createLeadAction: (formData: FormData) => Promise<CreateLeadFormState>;
}) {
  const router = useRouter();
  const duplicateRequestIdRef = useRef(0);
  const [isOpen, setIsOpen] = useState(false);
  const [formVersion, setFormVersion] = useState(0);
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const [stage, setStage] = useState<LeadStageValue>("NEW");
  const [nextActionType, setNextActionType] = useState<NextActionTypeValue>("CALL");
  const [trialLessonCount, setTrialLessonCount] = useState(String(DEFAULT_TRIAL_LESSON_COUNT));
  const [isChecking, startChecking] = useTransition();
  const [isSubmitting, startSubmitting] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);

  function resetDialogState() {
    duplicateRequestIdRef.current += 1;
    setDuplicates([]);
    setSubmitError(null);
    setStage("NEW");
    setNextActionType("CALL");
    setTrialLessonCount(String(DEFAULT_TRIAL_LESSON_COUNT));
    setFormVersion((current) => current + 1);
  }

  function handleStageChange(nextStage: string) {
    const normalizedStage = nextStage as LeadStageValue;
    setStage(normalizedStage);

    if (normalizedStage === "TRIAL_LESSON") {
      setTrialLessonCount((current) => current || String(DEFAULT_TRIAL_LESSON_COUNT));
      setNextActionType("TRIAL_LESSON_REMINDER");
    }
  }

  function handleOpenChange(open: boolean) {
    if (!open && isSubmitting) {
      return;
    }

    setIsOpen(open);
    if (!open) resetDialogState();
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setSubmitError(null);

    startSubmitting(async () => {
      try {
        const result = await createLeadAction(formData);
        if (result.status === "success") {
          setIsOpen(false);
          resetDialogState();
          router.replace("/crm?tab=list&leadCreated=1", { scroll: false });
          router.refresh();
          return;
        }
        setSubmitError(result.message ?? "Müraciət yaradılmadı.");
      } catch {
        setSubmitError("Gözlənilməz xəta baş verdi. Məlumatları yoxlayıb yenidən cəhd edin.");
      }
    });
  }

  function checkPhone(value: string) {
    const requestId = duplicateRequestIdRef.current + 1;
    duplicateRequestIdRef.current = requestId;

    if (value.replace(/\D/g, "").length < 6) {
      setDuplicates([]);
      return;
    }

    setDuplicates([]);
    startChecking(async () => {
      try {
        const response = await fetch(
          `/api/crm/phone-duplicates?phone=${encodeURIComponent(value)}`,
          { cache: "no-store" }
        );
        if (!response.ok) {
          if (requestId === duplicateRequestIdRef.current) {
            setDuplicates([]);
          }
          return;
        }
        const payload = (await response.json()) as DuplicateResponse;
        if (requestId === duplicateRequestIdRef.current) {
          setDuplicates(payload.matches);
        }
      } catch {
        if (requestId === duplicateRequestIdRef.current) {
          setDuplicates([]);
        }
      }
    });
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className="crm-new-lead-trigger" type="button" size="icon" aria-label="Yeni müraciət" title="Yeni müraciət">
          <UserPlus />
        </Button>
      </DialogTrigger>
      <DialogContent className="crm-modern-dialog crm-create-dialog">
        <DialogHeader className="crm-create-header">
          <span className="crm-create-header-icon" aria-hidden="true">
            <UserPlus />
          </span>
          <div>
            <DialogTitle>Yeni müraciət</DialogTitle>
            <DialogDescription>
              Əlaqə məlumatlarını və növbəti izləmə addımını qeyd edin.
            </DialogDescription>
          </div>
        </DialogHeader>

        <form key={formVersion} onSubmit={handleSubmit} className="crm-dialog-form">
          <div className="crm-dialog-scroll">
            <section className="crm-dialog-section crm-section-contact">
              <header className="crm-dialog-section-heading">
                <span aria-hidden="true"><CircleUserRound /></span>
                <div>
                  <h3>Əlaqə məlumatları</h3>
                  <p>Müraciət edən şəxsin əsas məlumatları və müraciət kanalı</p>
                </div>
              </header>
              <FieldGroup className="crm-dialog-fields">
                <Field className="is-full">
                  <FieldLabel htmlFor="new-lead-name">
                    Ad və soyad <span className="crm-required" aria-hidden="true">*</span>
                  </FieldLabel>
                  <InputGroup>
                    <InputGroupAddon aria-hidden="true"><CircleUserRound /></InputGroupAddon>
                    <InputGroupInput
                      id="new-lead-name"
                      name="fullName"
                      placeholder="Məsələn, Aysel Məmmədova"
                      autoComplete="name"
                      autoFocus
                      required
                      minLength={2}
                      maxLength={120}
                    />
                  </InputGroup>
                </Field>
                <Field className="crm-create-inline-field">
                  <FieldLabel htmlFor="new-lead-phone">Telefon</FieldLabel>
                  <InputGroup>
                    <InputGroupAddon aria-hidden="true"><Phone /></InputGroupAddon>
                    <InputGroupInput
                      id="new-lead-phone"
                      name="phone"
                      required
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="+994501234567"
                      onBlur={(event) => checkPhone(event.currentTarget.value)}
                    />
                  </InputGroup>
                </Field>
                <Field className="crm-create-inline-field">
                  <FieldLabel>Mənbə</FieldLabel>
                  <FormSelect
                    aria-label="Mənbə"
                    name="source"
                    defaultValue="Instagram"
                    options={buildCrmSourceSelectOptions(sourceOptions)}
                    searchable
                    searchPlaceholder="Mənbə axtar..."
                    catalogKey="CRM_SOURCE"
                    createLabel="Yeni mənbə əlavə et"
                  />
                </Field>
                <p className="crm-create-phone-hint" aria-live="polite">
                  {isChecking ? "Telefon nömrəsi yoxlanılır..." : "Dublikat qeyd avtomatik yoxlanılır"}
                </p>
                <Field>
                  <FieldLabel>Təhsil səviyyəsi</FieldLabel>
                  <FormSelect
                    aria-label="Təhsil səviyyəsi"
                    name="educationLevel"
                    defaultValue=""
                    emptyLabel="Təhsil səviyyəsi seçilməyib"
                    searchable
                    catalogKey="STUDENT_EDUCATION_LEVEL"
                    createLabel="Yeni təhsil səviyyəsi əlavə et"
                    options={educationLevelOptions}
                  />
                </Field>
              </FieldGroup>

              {duplicates.length > 0 ? (
                <div className="crm-duplicate-alert" role="alert">
                  <AlertTriangle aria-hidden="true" />
                  <div>
                    <strong>Bu telefonla oxşar qeyd tapıldı</strong>
                    {duplicates.map((match) => {
                      const studentCodes = match.students.map((student) => student.code).join(", ");
                      const leadStages = match.leads.map((lead) => formatLeadStageLabel(lead.stage)).join(", ");
                      return (
                        <p key={match.id}>
                          {match.fullName} · {match.phone}
                          {studentCodes ? ` · Tələbə: ${studentCodes}` : ""}
                          {leadStages ? ` · Mərhələ: ${leadStages}` : ""}
                        </p>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </section>

            <section className="crm-dialog-section crm-section-interest">
              <header className="crm-dialog-section-heading">
                <span aria-hidden="true"><BookOpen /></span>
                <div>
                  <h3>Maraq və məsuliyyət</h3>
                  <p>Proqram seçimi, kampaniya, cavabdeh əməkdaş və prioritet</p>
                </div>
              </header>
              <FieldGroup className="crm-dialog-fields">
                <Field>
                  <FieldLabel>Proqram</FieldLabel>
                  <FormSelect
                    aria-label="Proqram"
                    name="programId"
                    required
                    defaultValue=""
                    emptyLabel="Seçilməyib"
                    searchable
                    searchPlaceholder="Proqram axtar..."
                    options={programs.map((program) => ({ value: program.id, label: program.name }))}
                  />
                </Field>
                <Field>
                  <FieldLabel>Məsul şəxs (avtomatik)</FieldLabel>
                  <InputGroup>
                    <InputGroupAddon aria-hidden="true"><CircleUserRound /></InputGroupAddon>
                    <InputGroupInput
                      value={currentManagerName}
                      aria-label="Avtomatik təyin olunan məsul şəxs"
                      readOnly
                    />
                  </InputGroup>
                </Field>
                <Field>
                  <FieldLabel>Status</FieldLabel>
                  <FormSelect
                    aria-label="Status"
                    name="stage"
                    value={stage}
                    onValueChange={handleStageChange}
                    options={leadStageSelectOptions.filter((option) => option.value !== "REGISTERED")}
                  />
                </Field>
                {stage === "TRIAL_LESSON" ? (
                  <Field>
                    <FieldLabel htmlFor="new-lead-trial-count">Sınaq dərsi sayı</FieldLabel>
                    <InputGroup>
                      <InputGroupAddon aria-hidden="true"><BookOpen /></InputGroupAddon>
                      <InputGroupInput
                        id="new-lead-trial-count"
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
                    </InputGroup>
                    <FieldDescription>İlk seçimdə avtomatik 1 dərs qeyd olunur.</FieldDescription>
                  </Field>
                ) : null}
                <Field>
                  <FieldLabel>Prioritet</FieldLabel>
                  <FormSelect aria-label="Prioritet" name="priority" defaultValue="NORMAL" options={leadPrioritySelectOptions} />
                </Field>
              </FieldGroup>
            </section>

            <section className="crm-dialog-section crm-section-next-step">
              <header className="crm-dialog-section-heading">
                <span aria-hidden="true"><CalendarClock /></span>
                <div>
                  <h3>Növbəti addım</h3>
                  <p>İzləmə üsulunu, planlanan tarixi və vacib qeydləri əlavə edin</p>
                </div>
              </header>
              <FieldGroup className="crm-dialog-fields">
                <Field>
                  <FieldLabel>Növbəti addım</FieldLabel>
                  <FormSelect
                    aria-label="Növbəti addım"
                    name="nextActionType"
                    value={nextActionType}
                    onValueChange={(value) => setNextActionType(value as NextActionTypeValue)}
                    options={nextActionTypeSelectOptions}
                  />
                </Field>
                <Field>
                  <FieldLabel>Növbəti addım tarixi</FieldLabel>
                  <DatePicker
                    aria-label="Növbəti addım tarixi"
                    name="nextFollowUpDate"
                    required
                    compact
                    popoverPlacement="floating"
                  />
                </Field>
                <Field className="is-full">
                  <FieldLabel htmlFor="new-lead-note">Qeyd</FieldLabel>
                  <div className="crm-textarea-wrap">
                    <FileText aria-hidden="true" />
                    <textarea id="new-lead-note" name="note" maxLength={180} placeholder="Qeyd daxil edin..." />
                  </div>
                </Field>
              </FieldGroup>
            </section>

            {submitError ? (
              <div className="crm-duplicate-alert is-error" role="alert">
                <AlertTriangle aria-hidden="true" />
                <div><strong>Müraciət yaradılmadı</strong><p>{submitError}</p></div>
              </div>
            ) : null}
          </div>

          <DialogFooter className="crm-dialog-actions">
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isSubmitting}>Ləğv et</Button>
            </DialogClose>
            <Button className="crm-create-submit" type="submit" disabled={isSubmitting}>
              {isSubmitting ? <LoaderCircle className="crm-spin" data-icon="inline-start" /> : <Plus data-icon="inline-start" />}
              {isSubmitting ? "Yaradılır..." : "Müraciəti əlavə et"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
