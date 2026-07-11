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
} from "@/modules/crm/follow-up";
import { buildCrmSourceSelectOptions } from "@/modules/crm/source-options";
import { formatLeadStageLabel, leadStageSelectOptions } from "@/modules/crm/stage";
import type { CreateLeadFormState } from "@/modules/crm/actions";

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
  managers,
  campaigns,
  sourceOptions,
  createLeadAction,
}: {
  programs: Array<{ id: string; name: string }>;
  managers: Array<{ id: string; fullName: string }>;
  campaigns: Array<{ id: string; name: string }>;
  sourceOptions: string[];
  createLeadAction: (formData: FormData) => Promise<CreateLeadFormState>;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const [isChecking, startChecking] = useTransition();
  const [isSubmitting, startSubmitting] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);

  function resetDialogState() {
    setDuplicates([]);
    setSubmitError(null);
  }

  function handleOpenChange(open: boolean) {
    setIsOpen(open);
    if (!open) resetDialogState();
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setSubmitError(null);

    startSubmitting(async () => {
      const result = await createLeadAction(formData);
      if (result.status === "success") {
        setIsOpen(false);
        resetDialogState();
        form.reset();
        router.replace("/crm?tab=list&leadCreated=1", { scroll: false });
        router.refresh();
        return;
      }
      setSubmitError(result.message ?? "Müraciət yaradılmadı.");
    });
  }

  function checkPhone(value: string) {
    if (value.replace(/\D/g, "").length < 6) {
      setDuplicates([]);
      return;
    }

    startChecking(async () => {
      try {
        const response = await fetch(
          `/api/crm/phone-duplicates?phone=${encodeURIComponent(value)}`,
          { cache: "no-store" }
        );
        if (!response.ok) {
          setDuplicates([]);
          return;
        }
        const payload = (await response.json()) as DuplicateResponse;
        setDuplicates(payload.matches);
      } catch {
        setDuplicates([]);
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
        <DialogHeader className="crm-create-accessible-header">
          <DialogTitle>Yeni müraciət</DialogTitle>
          <DialogDescription>
            Müraciət məlumatlarını, maraq göstərilən proqramı, məsul şəxsi və ilk izləmə tarixini daxil edin.
          </DialogDescription>
        </DialogHeader>

        <form ref={formRef} onSubmit={handleSubmit} className="crm-dialog-form">
          <div className="crm-dialog-scroll">
            <section className="crm-dialog-section">
              <header>
                <CircleUserRound aria-hidden="true" />
                <h3>Əlaqə məlumatları</h3>
              </header>
              <FieldGroup className="crm-dialog-fields">
                <Field className="is-full">
                  <FieldLabel htmlFor="new-lead-name">Ad və soyad</FieldLabel>
                  <InputGroup>
                    <InputGroupAddon aria-hidden="true"><CircleUserRound /></InputGroupAddon>
                    <InputGroupInput id="new-lead-name" name="fullName" required minLength={2} maxLength={120} />
                  </InputGroup>
                </Field>
                <Field>
                  <FieldLabel htmlFor="new-lead-phone">Telefon</FieldLabel>
                  <InputGroup>
                    <InputGroupAddon aria-hidden="true"><Phone /></InputGroupAddon>
                    <InputGroupInput
                      id="new-lead-phone"
                      name="phone"
                      maxLength={40}
                      onBlur={(event) => checkPhone(event.currentTarget.value)}
                    />
                  </InputGroup>
                  <FieldDescription>
                    {isChecking ? "Telefon nömrəsi yoxlanılır..." : "Dublikat qeyd avtomatik yoxlanılır"}
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel>Mənbə</FieldLabel>
                  <FormSelect
                    aria-label="Mənbə"
                    name="source"
                    defaultValue="Instagram"
                    options={buildCrmSourceSelectOptions(sourceOptions)}
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

            <section className="crm-dialog-section">
              <header>
                <BookOpen aria-hidden="true" />
                <h3>Maraq və məsuliyyət</h3>
              </header>
              <FieldGroup className="crm-dialog-fields">
                <Field>
                  <FieldLabel>Proqram</FieldLabel>
                  <FormSelect
                    aria-label="Proqram"
                    name="programId"
                    defaultValue=""
                    emptyLabel="Seçilməyib"
                    options={programs.map((program) => ({ value: program.id, label: program.name }))}
                  />
                </Field>
                <Field>
                  <FieldLabel>Kampaniya</FieldLabel>
                  <FormSelect aria-label="Kampaniya" name="campaignId" defaultValue="" emptyLabel="Kampaniya seçilməyib" options={campaigns.map((campaign) => ({ value: campaign.id, label: campaign.name }))} />
                </Field>
                <Field>
                  <FieldLabel>Məsul şəxs</FieldLabel>
                  <FormSelect
                    aria-label="Məsul şəxs"
                    name="managerId"
                    defaultValue=""
                    emptyLabel="Avtomatik təyin et"
                    options={managers.map((manager) => ({ value: manager.id, label: manager.fullName }))}
                  />
                </Field>
                <Field>
                  <FieldLabel>Status</FieldLabel>
                  <FormSelect aria-label="Status" name="stage" defaultValue="NEW" options={leadStageSelectOptions} />
                </Field>
                <Field>
                  <FieldLabel>Prioritet</FieldLabel>
                  <FormSelect aria-label="Prioritet" name="priority" defaultValue="NORMAL" options={leadPrioritySelectOptions} />
                </Field>
              </FieldGroup>
            </section>

            <section className="crm-dialog-section">
              <header>
                <CalendarClock aria-hidden="true" />
                <h3>Növbəti addım</h3>
              </header>
              <FieldGroup className="crm-dialog-fields">
                <Field>
                  <FieldLabel>Növbəti addım</FieldLabel>
                  <FormSelect aria-label="Növbəti addım" name="nextActionType" defaultValue="CALL" options={nextActionTypeSelectOptions} />
                </Field>
                <Field>
                  <FieldLabel>Növbəti addım tarixi</FieldLabel>
                  <DatePicker name="nextFollowUpDate" compact popoverPlacement="floating" />
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
              <Button type="button" variant="outline">Ləğv et</Button>
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
