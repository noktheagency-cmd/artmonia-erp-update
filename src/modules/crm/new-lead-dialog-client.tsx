"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Plus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
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
import {
  leadPrioritySelectOptions,
  nextActionTypeSelectOptions,
} from "@/modules/crm/follow-up";
import { buildCrmSourceSelectOptions } from "@/modules/crm/source-options";
import { formatLeadStageLabel, leadStageSelectOptions } from "@/modules/crm/stage";

type DuplicateMatch = {
  id: string;
  fullName: string;
  phone: string;
  students: Array<{ code: string; status: string }>;
  leads: Array<{ stage: string; createdAt: string }>;
};

type DuplicateResponse = {
  matches: DuplicateMatch[];
};

export function NewLeadDialogClient({
  programs,
  managers,
  sourceOptions,
  createLeadAction,
}: {
  programs: Array<{ id: string; name: string }>;
  managers: Array<{ id: string; fullName: string }>;
  sourceOptions: string[];
  createLeadAction: (formData: FormData) => void | Promise<void>;
}) {
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const [isChecking, startChecking] = useTransition();

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
    <Dialog>
      <DialogTrigger asChild>
        <Button className="crm-primary-button crm-new-lead-trigger" type="button">
          <span className="crm-new-lead-icon" aria-hidden="true">
            <UserPlus size={16} />
          </span>
          Yeni müraciət
        </Button>
      </DialogTrigger>
      <DialogContent className="lead-dialog-content">
        <DialogHeader>
          <DialogTitle>Yeni müraciət</DialogTitle>
          <DialogDescription>
            Müraciət məlumatlarını, maraq göstərilən proqramı, məsul şəxsi və ilk izləmə tarixini daxil edin.
          </DialogDescription>
        </DialogHeader>

        <form action={createLeadAction} className="crm-form crm-form-dialog">
          <label className="form-field">
            <span>Ad və soyad</span>
            <Input name="fullName" required minLength={2} maxLength={120} />
          </label>

          <div className="field-grid">
            <label className="form-field">
              <span>Telefon</span>
              <Input
                name="phone"
                maxLength={40}
                onBlur={(event) => checkPhone(event.currentTarget.value)}
              />
            </label>
            <label className="form-field">
              <span>Mənbə</span>
              <FormSelect
                name="source"
                defaultValue="Instagram"
                options={buildCrmSourceSelectOptions(sourceOptions)}
              />
            </label>
          </div>

          {isChecking ? (
            <div className="duplicate-alert duplicate-muted">Telefon yoxlanılır...</div>
          ) : null}

          {duplicates.length > 0 ? (
            <div className="duplicate-alert" role="alert">
              <AlertTriangle data-icon="inline-start" />
              <div>
                <strong>Bu telefonla oxşar qeyd tapıldı</strong>
                {duplicates.map((match) => {
                  const studentCodes = match.students
                    .map((student) => student.code)
                    .join(", ");
                  const leadStages = match.leads
                    .map((lead) => formatLeadStageLabel(lead.stage))
                    .join(", ");

                  return (
                    <p key={match.id}>
                      {match.fullName} - {match.phone}
                      {studentCodes ? ` - Tələbə: ${studentCodes}` : ""}
                      {leadStages ? ` - Müraciət mərhələsi: ${leadStages}` : ""}
                    </p>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="field-grid">
            <label className="form-field">
              <span>Proqram</span>
              <FormSelect
                name="programId"
                defaultValue=""
                emptyLabel="Seçilməyib"
                options={programs.map((program) => ({
                  value: program.id,
                  label: program.name,
                }))}
              />
            </label>
            <label className="form-field">
              <span>Məsul şəxs</span>
              <FormSelect
                name="managerId"
                defaultValue=""
                emptyLabel="Avtomatik təyin et"
                options={managers.map((manager) => ({
                  value: manager.id,
                  label: manager.fullName,
                }))}
              />
            </label>
          </div>

          <div className="field-grid">
            <label className="form-field">
              <span>Status</span>
              <FormSelect
                name="stage"
                defaultValue="NEW"
                options={leadStageSelectOptions}
              />
            </label>
            <label className="form-field">
              <span>Prioritet</span>
              <FormSelect
                name="priority"
                defaultValue="NORMAL"
                options={leadPrioritySelectOptions}
              />
            </label>
          </div>

          <div className="field-grid">
            <label className="form-field">
              <span>Növbəti addım</span>
              <FormSelect
                name="nextActionType"
                defaultValue="CALL"
                options={nextActionTypeSelectOptions}
              />
            </label>
            <label className="form-field">
              <span>Növbəti addım tarixi</span>
              <DatePicker
                name="nextFollowUpDate"
              />
            </label>
          </div>

          <label className="form-field">
            <span>Qeyd</span>
            <Input name="note" maxLength={180} />
          </label>

          <DialogFooter>
            <Button type="submit">
              <Plus data-icon="inline-start" />
              Müraciəti əlavə et
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
