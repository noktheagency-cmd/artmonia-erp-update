"use client";

import { useState, useTransition } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  CheckCircle2,
  CircleUserRound,
  GraduationCap,
  ShieldCheck,
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
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { FormSelect } from "@/components/ui/select";
import { convertLeadToStudentAction } from "@/modules/crm/actions";
import type { CrmData } from "@/modules/crm/queries";
import { buildCrmSourceSelectOptions } from "@/modules/crm/source-options";
import { educationLevelOptions } from "@/modules/students/education-level-options";
import { unwrapActionResult } from "@/lib/action-result";
import { notifyCaughtError, notifySuccess } from "@/lib/app-notifications";

type LeadRow = CrmData["leads"][number];

export function LeadRegistrationDialog({
  lead,
  programs,
  sourceOptions,
  returnTo,
  canConvert,
}: {
  lead: LeadRow;
  programs: CrmData["programs"];
  sourceOptions: CrmData["sourceOptions"];
  returnTo: string;
  canConvert: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const enabled = lead.canConvert && canConvert;

  function handleOpenChange(nextOpen: boolean) {
    if (isPending) return;
    setOpen(nextOpen);
  }

  function registerLead(formData: FormData) {
    startTransition(async () => {
      try {
        const result = unwrapActionResult(await convertLeadToStudentAction(formData)) as {
          redirectTo: string;
        };
        setOpen(false);
        notifySuccess("Tələbə yaradıldı", "Redaktə edilmiş məlumatlar təsdiqləndi və tələbə qeydiyyata alındı.");
        router.replace(result.redirectTo as Route, { scroll: false });
        router.refresh();
      } catch (error) {
        notifyCaughtError(error, "Müraciət tələbəyə çevrilmədi.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant={lead.canConvert ? "default" : "ghost"}
          size="sm"
          disabled={!enabled}
          aria-disabled={!enabled}
          title={lead.canConvert ? "Məlumatları yoxla və tələbə kimi qeydiyyata al" : lead.conversionLabel}
        >
          {lead.canConvert ? <CheckCircle2 data-icon="inline-start" /> : null}
          {lead.conversionLabel}
        </Button>
      </DialogTrigger>

      <DialogContent className="crm-modern-dialog crm-register-dialog">
        <DialogHeader className="crm-register-header">
          <span className="crm-register-header-icon" aria-hidden="true"><ShieldCheck /></span>
          <div>
            <DialogTitle>Qeydiyyatı yoxla və təsdiqlə</DialogTitle>
            <DialogDescription>
              Məlumatları redaktə edin. Tələbə yalnız son təsdiqdən sonra yaradılacaq.
            </DialogDescription>
          </div>
        </DialogHeader>

        <form action={registerLead} className="crm-dialog-form">
          <input type="hidden" name="leadId" value={lead.id} />
          <input type="hidden" name="returnTo" value={returnTo} />

          <div className="crm-dialog-scroll">
            <div className="crm-register-preview" role="status">
              <span aria-hidden="true">{lead.name.slice(0, 2).toUpperCase()}</span>
              <div>
                <strong>{lead.name}</strong>
                <small>{lead.program} · {lead.manager}</small>
              </div>
              <em>Slot gözləyir</em>
            </div>

            <section className="crm-dialog-section">
              <header><CircleUserRound aria-hidden="true" /><h3>Şəxsi məlumatlar</h3></header>
              <FieldGroup className="crm-dialog-fields">
                <Field>
                  <FieldLabel htmlFor={`register-name-${lead.id}`}>Ad və soyad</FieldLabel>
                  <Input
                    id={`register-name-${lead.id}`}
                    name="fullName"
                    defaultValue={lead.detail.fullName}
                    minLength={2}
                    maxLength={120}
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`register-phone-${lead.id}`}>Telefon</FieldLabel>
                  <Input
                    id={`register-phone-${lead.id}`}
                    name="phone"
                    defaultValue={lead.detail.phone}
                    maxLength={40}
                    inputMode="tel"
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel>Mənbə</FieldLabel>
                  <FormSelect
                    aria-label="Qeydiyyat mənbəyi"
                    name="source"
                    defaultValue={lead.detail.source}
                    emptyLabel="Mənbə seçilməyib"
                    options={buildCrmSourceSelectOptions(sourceOptions)}
                    searchable
                    searchPlaceholder="Mənbə axtar..."
                  />
                </Field>
                <Field>
                  <FieldLabel>Təhsil səviyyəsi</FieldLabel>
                  <FormSelect
                    aria-label="Qeydiyyat təhsil səviyyəsi"
                    name="educationLevel"
                    defaultValue={lead.detail.educationLevel}
                    emptyLabel="Təhsil səviyyəsi seçilməyib"
                    options={educationLevelOptions}
                    searchable
                  />
                </Field>
              </FieldGroup>
            </section>

            <section className="crm-dialog-section">
              <header><BookOpen aria-hidden="true" /><h3>Tədris məlumatları</h3></header>
              <FieldGroup className="crm-dialog-fields">
                <Field className="is-full">
                  <FieldLabel>Proqram</FieldLabel>
                  <FormSelect
                    aria-label="Qeydiyyat proqramı"
                    name="programId"
                    defaultValue={lead.detail.programId}
                    emptyLabel="Proqram seçin"
                    options={programs.map((program) => ({ value: program.id, label: program.name }))}
                    searchable
                    searchPlaceholder="Proqram axtar..."
                    required
                  />
                  <FieldDescription>
                    Aylıq məbləğ və dərs sayı seçilən proqramın cari tarifindən götürüləcək.
                  </FieldDescription>
                </Field>
              </FieldGroup>
            </section>

            <div className="crm-register-note">
              <GraduationCap aria-hidden="true" />
              <p><strong>Təsdiqdən sonra:</strong> müraciət “Qeydiyyata alınıb”, tələbə isə “Slot gözləyir” statusuna keçəcək.</p>
            </div>
          </div>

          <DialogFooter className="crm-dialog-actions">
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isPending}>Ləğv et</Button>
            </DialogClose>
            <Button type="submit" disabled={isPending}>
              <CheckCircle2 data-icon="inline-start" />
              {isPending ? "Qeydiyyata alınır..." : "Təsdiqlə və qeydiyyata al"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
