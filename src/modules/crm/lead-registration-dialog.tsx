"use client";

import { useEffect, useState, useTransition } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import {
  Banknote,
  BookOpen,
  CheckCircle2,
  CircleUserRound,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { DatePicker } from "@/components/ui/date-picker";
import { MonthPicker, normalizeMonthValue } from "@/components/ui/month-picker";
import { Input } from "@/components/ui/input";
import { FormSelect } from "@/components/ui/select";
import { convertLeadToStudentAction, listRegistrationPackageOptions } from "@/modules/crm/actions";
import {
  ADMISSION_PAYMENT_MIN_MESSAGE,
  isAdmissionAmountBelowMinimum,
} from "@/modules/students/admission-payment-amount";
import { currentBakuDateValue } from "@/modules/students/payment-date-policy";
import { studentPaymentMethodOptions } from "@/modules/students/payment-method";
import {
  AVANS_DEFAULT_AMOUNT,
  AVANS_PAYMENT_KIND,
  storedScheduleTypeForPaymentKind,
  studentPaymentKindOptions,
} from "@/modules/students/payment-schedule-type";
import { isGiftDiscount } from "@/modules/students/student-create-rules";
import { EMPTY_SELECT_VALUE } from "@/modules/shared/form-values";
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
  const [programId, setProgramId] = useState(lead.detail.programId);
  const [discountType, setDiscountType] = useState("");
  const [monthlyFee, setMonthlyFee] = useState("");
  const [lessonsPerMonth, setLessonsPerMonth] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(currentBakuDateValue());
  const [paymentMonth, setPaymentMonth] = useState(normalizeMonthValue(currentBakuDateValue()));
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [paymentKind, setPaymentKind] = useState("MONTHLY");
  const [teachers, setTeachers] = useState<{ id: string; fullName: string }[]>([]);
  const [discountTypes, setDiscountTypes] = useState<{ value: string; label: string }[]>([]);
  const [programTerms, setProgramTerms] = useState<Record<string, { monthlyFee: string; lessonsPerMonth: string }>>({});
  const enabled = lead.canConvert && canConvert;
  const gift = isGiftDiscount(discountType);
  const paymentAmountError = !gift && isAdmissionAmountBelowMinimum(paymentAmount, "ADMISSION")
    ? ADMISSION_PAYMENT_MIN_MESSAGE
    : "";

  function handleOpenChange(nextOpen: boolean) {
    if (isPending) return;
    setOpen(nextOpen);
  }

  useEffect(() => {
    if (!open) return;
    let ignore = false;

    async function load() {
      const result = await listRegistrationPackageOptions();
      if (ignore || !result.ok) return;
      setTeachers(result.data.teachers);
      setDiscountTypes(result.data.discountTypes);
      setProgramTerms(Object.fromEntries(result.data.programs.map((program) => [
        program.id,
        { monthlyFee: program.monthlyFee, lessonsPerMonth: program.lessonsPerMonth },
      ])));
    }

    void load();
    return () => {
      ignore = true;
    };
  }, [open]);

  useEffect(() => {
    const terms = programTerms[programId];
    if (!terms) return;
    setMonthlyFee((current) => current || terms.monthlyFee);
    setLessonsPerMonth((current) => current || terms.lessonsPerMonth);
    setPaymentAmount((current) => current || terms.monthlyFee);
  }, [programId, programTerms]);

  function handleProgramChange(value: string) {
    setProgramId(value);
    const terms = programTerms[value];
    if (!terms) return;
    setMonthlyFee(terms.monthlyFee);
    setLessonsPerMonth(terms.lessonsPerMonth);
    if (!gift) setPaymentAmount(terms.monthlyFee);
  }

  function handleDiscountChange(value: string) {
    const next = value === EMPTY_SELECT_VALUE ? "" : value;
    setDiscountType(next);
    if (isGiftDiscount(next)) {
      setPaymentAmount("");
      setPaymentKind("MONTHLY");
    }
  }

  function handlePaymentKindChange(kind: string) {
    setPaymentKind(kind);
    if (kind === AVANS_PAYMENT_KIND) {
      setPaymentAmount(AVANS_DEFAULT_AMOUNT);
    } else {
      const terms = programTerms[programId];
      if (terms) setPaymentAmount(terms.monthlyFee);
    }
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
            {/* <div className="crm-register-preview" role="status">
              <span aria-hidden="true">{lead.name.slice(0, 2).toUpperCase()}</span>
              <div>
                <strong>{lead.name}</strong>
                <small>{lead.program} · {lead.manager}</small>
              </div>
              <em>Qeydiyyat gözləyir</em>
            </div> */}

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
                    type="tel"
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
              <header><BookOpen aria-hidden="true" /><h3>Cari paket və ödəniş planı</h3></header>
              <FieldGroup className="crm-dialog-fields">
                <Field>
                  <FieldLabel>Proqram</FieldLabel>
                  <FormSelect
                    aria-label="Qeydiyyat proqramı"
                    name="programId"
                    value={programId}
                    onValueChange={handleProgramChange}
                    emptyLabel="Proqram seçin"
                    options={programs.map((program) => ({ value: program.id, label: program.name }))}
                    searchable
                    searchPlaceholder="Proqram axtar..."
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel>Müəllim</FieldLabel>
                  <FormSelect
                    aria-label="Müəllim"
                    name="teacherId"
                    emptyLabel="Müəllim seçilməyib"
                    options={teachers.map((teacher) => ({ value: teacher.id, label: teacher.fullName }))}
                    searchable
                    searchPlaceholder="Müəllim axtar..."
                  />
                </Field>
                <Field>
                  <FieldLabel>Cari paket üzrə ilk dərs</FieldLabel>
                  <DatePicker
                    name="firstLessonDate"
                    aria-label="Cari paket üzrə ilk dərs"
                    required={!gift}
                  />
                </Field>
                <Field>
                  <FieldLabel>Güzəşt növü</FieldLabel>
                  <FormSelect
                    aria-label="Güzəşt növü"
                    name="discountType"
                    value={discountType}
                    onValueChange={handleDiscountChange}
                    emptyLabel="Güzəşt yoxdur"
                    options={discountTypes}
                    searchable
                    searchPlaceholder="Güzəşt növü axtar..."
                    catalogKey="STUDENT_DISCOUNT_TYPE"
                    createLabel="Yeni güzəşt növü əlavə et"
                  />
                </Field>
                {gift ? (
                  <input name="monthlyFee" type="hidden" value="0" />
                ) : (
                  <Field>
                    <FieldLabel>{discountType ? "Güzəştli aylıq məbləğ" : "Aylıq məbləğ"}</FieldLabel>
                    <Input
                      name="monthlyFee"
                      value={monthlyFee}
                      onChange={(event) => setMonthlyFee(event.target.value)}
                      inputMode="decimal"
                      required
                    />
                  </Field>
                )}
                <Field>
                  <FieldLabel>Aylıq dərs sayı</FieldLabel>
                  <Input
                    name="lessonsPerMonth"
                    value={lessonsPerMonth}
                    onChange={(event) => setLessonsPerMonth(event.target.value)}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={120}
                  />
                </Field>
              </FieldGroup>
            </section>

            {gift ? (
              <section className="crm-dialog-section">
                <header><Banknote aria-hidden="true" /><h3>İlkin ödəniş</h3></header>
                <p>Hədiyyə güzəşti — ödəniş və satış jurnalı tətbiq olunmur.</p>
              </section>
            ) : (
              <section className="crm-dialog-section">
                <header><Banknote aria-hidden="true" /><h3>İlkin ödəniş (satış)</h3></header>
                <FieldGroup className="crm-dialog-fields">
                  <input name="scheduleType" type="hidden" value={storedScheduleTypeForPaymentKind(paymentKind)} />
                  {paymentKind === AVANS_PAYMENT_KIND ? (
                    <>
                      <input name="receiptPurpose" type="hidden" value="ADMISSION" />
                      <input name="contractConfirmed" type="hidden" value="on" />
                    </>
                  ) : null}
                  <Field data-invalid={Boolean(paymentAmountError) || undefined}>
                    <FieldLabel htmlFor={`register-pay-amount-${lead.id}`}>Məbləğ</FieldLabel>
                    <Input
                      id={`register-pay-amount-${lead.id}`}
                      name="paymentAmount"
                      value={paymentAmount}
                      onChange={(event) => setPaymentAmount(event.target.value)}
                      inputMode="decimal"
                      required
                      aria-invalid={Boolean(paymentAmountError)}
                    />
                    {paymentAmountError ? (
                      <small className="form-field-error" role="alert">{paymentAmountError}</small>
                    ) : null}
                  </Field>
                  <Field>
                    <FieldLabel>Metod</FieldLabel>
                    <FormSelect
                      aria-label="Ödəniş metodu"
                      name="paymentMethod"
                      value={paymentMethod}
                      onValueChange={setPaymentMethod}
                      options={studentPaymentMethodOptions}
                    />
                  </Field>
                  <Field>
                    <FieldLabel>Ödəniş növü</FieldLabel>
                    <FormSelect
                      aria-label="Ödəniş növü"
                      name="paymentKind"
                      value={paymentKind}
                      onValueChange={handlePaymentKindChange}
                      options={studentPaymentKindOptions}
                    />
                  </Field>
                  <Field>
                    <FieldLabel>Ödəniş tarixi</FieldLabel>
                    <DatePicker
                      name="paymentDate"
                      value={paymentDate}
                      onValueChange={setPaymentDate}
                      maxValue={currentBakuDateValue()}
                      allowClear={false}
                      required
                    />
                  </Field>
                  <Field>
                    <FieldLabel>Aid olduğu ay</FieldLabel>
                    <MonthPicker
                      name="paymentMonth"
                      value={paymentMonth}
                      onValueChange={setPaymentMonth}
                      allowClear={false}
                      required
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`register-pay-note-${lead.id}`}>Ödəniş qeydi</FieldLabel>
                    <Input
                      id={`register-pay-note-${lead.id}`}
                      name="paymentNote"
                      maxLength={240}
                    />
                  </Field>
                </FieldGroup>
                {paymentKind !== AVANS_PAYMENT_KIND ? (
                  <label className="contract-confirm-field">
                    <Checkbox name="contractConfirmed" required />
                    <span className="contract-confirm-copy">
                      <strong>Müqavilə imzalanıb</strong>
                      <small>Bu ödəniş CRM satışına yazılır.</small>
                    </span>
                  </label>
                ) : null}
              </section>
            )}

            {lead.needsMeetingAttendanceConfirm ? (
              <section className="crm-dialog-section">
                <header><CheckCircle2 aria-hidden="true" /><h3>Görüş iştirakı</h3></header>
                <label className="crm-register-attend">
                  <input
                    type="checkbox"
                    name="confirmMeetingAttended"
                    value="true"
                    required
                  />
                  <span>Görüşdə iştirak etdi — qeydiyyat bu təsdiqdən sonra davam edir.</span>
                </label>
              </section>
            ) : null}
          </div>

          <DialogFooter className="crm-dialog-actions">
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isPending}>Ləğv et</Button>
            </DialogClose>
            <Button type="submit" disabled={isPending || (!gift && Boolean(paymentAmountError))}>
              <CheckCircle2 data-icon="inline-start" />
              {isPending
                ? "Qeydiyyata alınır..."
                : gift
                  ? "Təsdiqlə və qeydiyyata al"
                  : "Ödənişlə qeydiyyata al"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
