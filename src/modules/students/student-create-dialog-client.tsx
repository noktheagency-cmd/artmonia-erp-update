"use client";

import { useState } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { Banknote, BookOpen, Check, Plus, Trash2, UserPlus } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { MonthPicker, normalizeMonthValue } from "@/components/ui/month-picker";
import { Input } from "@/components/ui/input";
import {
  ADMISSION_PAYMENT_MIN_MESSAGE,
  isAdmissionAmountBelowMinimum,
} from "@/modules/students/admission-payment-amount";
import { FormSelect } from "@/components/ui/select";
import { EMPTY_SELECT_VALUE } from "@/modules/shared/form-values";
import { currentBakuMonthStart } from "@/modules/shared/creation-date-policy";
import { studentPaymentMethodOptions } from "@/modules/students/payment-method";
import {
  AVANS_PAYMENT_KIND,
  AVANS_DEFAULT_AMOUNT,
  studentPaymentKindOptions,
  storedScheduleTypeForPaymentKind,
  studentPaymentScheduleTypeOptions
} from "@/modules/students/payment-schedule-type";
import { currentBakuDateValue } from "@/modules/students/payment-date-policy";
import { confirmPaymentMonthMismatch } from "@/modules/students/payment-date-policy-client";
import {
  isGiftDiscount,
  studentFirstLessonModeOptions,
} from "@/modules/students/student-create-rules";
import type { StudentListData } from "@/modules/students/queries";
import { unwrapActionResult } from "@/lib/action-result";
import { notifyCaughtError, notifySuccess } from "@/lib/app-notifications";

type CreateOptions = StudentListData["createOptions"];
type StudentFormValues = {
  monthlyFee: string;
  paymentAmount: string;
  paymentDate: string;
  paymentMonth: string;
  paymentMethod: string;
  paymentScheduleType: string;
  paymentNote: string;
};

function buildInitialStudentValues(createOptions: CreateOptions) {
  return {
    fullName: "",
    phone: "",
    email: "",
    source: "Manual",
    educationLevel: "",
    programId: "",
    teacherId: "",
    discountType: "",
    lifecycleStatus: "SLOT_WAITING",
    registeredDate: createOptions.defaultRegisteredDate,
    firstLessonMode: "AUTO",
    firstLessonDate: "",
    monthlyFee: "",
    lessonsPerMonth: "",
    notes: "",
    paymentAmount: "",
    paymentDate: createOptions.defaultPaymentDate,
    paymentMonth: normalizeMonthValue(createOptions.defaultPaymentDate),
    paymentMethod: "CASH",
    paymentScheduleType: "MONTHLY",
    paymentNote: "",
  };
}

export function StudentCreateDialogClient({
  createOptions,
  canCreateStudent,
  canConvertLead,
  canRecordPayment,
  returnTo,
  createStudentAction,
}: {
  createOptions: CreateOptions;
  canCreateStudent: boolean;
  canConvertLead: boolean;
  canRecordPayment: boolean;
  returnTo: string;
  createStudentAction: (formData: FormData) => unknown | Promise<unknown>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState("");
  const [acceptPayment, setAcceptPayment] = useState(false);
  const [values, setValues] = useState(() => buildInitialStudentValues(createOptions));
  const isGift = isGiftDiscount(values.discountType);

  function resetCreateForm() {
    setSelectedLeadId("");
    setAcceptPayment(false);
    setValues(buildInitialStudentValues(createOptions));
  }

  function updateValue(name: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
  }

  function handleLeadChange(value: string) {
    const leadId = cleanSelectValue(value);
    setSelectedLeadId(leadId);
    const lead = createOptions.leads.find((item) => item.id === leadId);

    if (!lead) {
      setValues((current) => ({
        ...current,
        fullName: "",
        phone: "",
        email: "",
        source: "Manual",
        educationLevel: "",
        programId: "",
        teacherId: "",
        monthlyFee: "",
        lessonsPerMonth: "",
        paymentAmount: "",
        paymentNote: "",
        notes: "",
      }));
      return;
    }

    const program = createOptions.programs.find((item) => item.id === lead.programId);
    setValues((current) => ({
      ...current,
      fullName: lead.name,
      phone: lead.phone,
      source: lead.source,
      educationLevel: lead.educationLevel,
      programId: lead.programId,
      monthlyFee: isGiftDiscount(current.discountType) ? "0" : program?.monthlyFee ?? "",
      lessonsPerMonth: program?.lessonsPerMonth ?? "",
      notes: lead.note,
      paymentAmount: isGiftDiscount(current.discountType) ? "" : program?.monthlyFee ?? "",
    }));
  }

  function handleProgramChange(value: string) {
    const programId = cleanSelectValue(value);
    const program = createOptions.programs.find((item) => item.id === programId);
    setValues((current) => ({
      ...current,
      programId,
      monthlyFee: isGiftDiscount(current.discountType) ? "0" : program?.monthlyFee ?? "",
      lessonsPerMonth: program?.lessonsPerMonth ?? "",
      paymentAmount: isGiftDiscount(current.discountType) ? "" : program?.monthlyFee ?? "",
    }));
  }

  function handleDiscountTypeChange(value: string) {
    const discountType = cleanSelectValue(value);
    const giftSelected = isGiftDiscount(discountType);
    const program = createOptions.programs.find((item) => item.id === values.programId);
    if (giftSelected) setAcceptPayment(false);
    setValues((current) => ({
      ...current,
      discountType,
      monthlyFee: giftSelected
        ? "0"
        : current.monthlyFee === "0"
          ? program?.monthlyFee ?? ""
          : current.monthlyFee,
      paymentAmount: giftSelected ? "" : current.paymentAmount,
      paymentNote: giftSelected ? "" : current.paymentNote,
    }));
  }

  function handleSourceChange(value: string) {
    updateValue("source", cleanSelectValue(value));
  }

  function removePayment() {
    // Payment stays required for paid admissions; clearing only resets the draft amounts.
    setAcceptPayment(false);
    setValues((current) => ({
      ...current,
      paymentAmount: current.monthlyFee || "",
      paymentNote: "",
    }));
  }

  async function createStudent(formData: FormData) {
    if (!isGift && !acceptPayment) {
      notifyCaughtError(
        new Error("Əvvəl «Ödəniş qəbul et» ilə ilkin ödənişi əlavə edin."),
        "Ödəniş məcburidir.",
      );
      return;
    }
    if (
      acceptPayment
      && !confirmPaymentMonthMismatch(formData, {
        paidDateField: "paymentDate",
        paymentMonthField: "paymentMonth",
      })
    ) return;
    try {
      const result = unwrapActionResult(await createStudentAction(formData)) as {
        redirectTo: string;
      };
      setOpen(false);
      resetCreateForm();
      notifySuccess(
        "Tələbə yaradıldı",
        "Yeni tələbə siyahıya əlavə olundu.",
      );
      router.replace(
        result.redirectTo as Parameters<typeof router.replace>[0],
        { scroll: false }
      );
    } catch (error) {
      notifyCaughtError(error, "Tələbə yaradılmadı.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="icon" className="students-create-action" disabled={!canCreateStudent} aria-label="Tələbə yarat" title="Tələbə yarat">
          <Plus />
        </Button>
      </DialogTrigger>
      <DialogContent className="student-create-dialog">
        <DialogHeader className="student-create-header">
          <div className="student-create-title">
            <span className="student-create-header-icon"><UserPlus /></span>
            <div>
              <DialogTitle>Yeni tələbə</DialogTitle>
              <DialogDescription>Müraciəti tələbəyə çevirin və tədris məlumatlarını tamamlayın.</DialogDescription>
            </div>
          </div>
          {!isGift ? (
            <InitialPaymentDialog
              accepted={acceptPayment}
              canRecordPayment={canRecordPayment}
              values={values}
              onChange={updateValue}
              onRemove={removePayment}
              onSave={() => setAcceptPayment(true)}
            />
          ) : null}
        </DialogHeader>

        <form action={createStudent} className="student-create-form" id="student-create-form">
          <input name="returnTo" type="hidden" value={returnTo} />
          <input name="acceptPayment" type="hidden" value={acceptPayment ? "true" : "false"} />
          <input name="discountType" type="hidden" value={values.discountType} />
          <input name="paymentAmount" type="hidden" value={values.paymentAmount} />
          <input name="paymentDate" type="hidden" value={values.paymentDate} />
          <input name="paymentMonth" type="hidden" value={values.paymentMonth} />
          <input name="paymentMethod" type="hidden" value={values.paymentMethod} />
          {/* <input name="paymentScheduleType" type="hidden" value={values.paymentScheduleType} /> */}
          <input name="paymentKind" type="hidden" value={values.paymentScheduleType} />
          <input name="paymentScheduleType" type="hidden" value={storedScheduleTypeForPaymentKind(values.paymentScheduleType)} />
          <input name="paymentNote" type="hidden" value={values.paymentNote} />
          {isGift ? (
            <p className="student-create-gift-note">Hədiyyə güzəşti — ilkin ödəniş və satış jurnalı tətbiq olunmur.</p>
          ) : acceptPayment ? (
            values.paymentScheduleType === AVANS_PAYMENT_KIND ? (
              <>
                <input name="contractConfirmed" type="hidden" value="on" />
                <p className="student-create-payment-required">
                  Avans qəbul olunur: müqavilə təsdiqi tələb olunmur. Qalan məbləğ ilk dərsdən sonra cari borc kimi açılacaq.
                </p>
              </>
            ) : (
              <label className="contract-confirm-field">
                <Checkbox name="contractConfirmed" required />
                <span className="contract-confirm-copy">
                  <strong>Müqavilə imzalanıb</strong>
                  <small>İlkin qəbul ödənişi ən azı 20 AZN olmalıdır və satış sayılır.</small>
                </span>
              </label>
            )
          ) : (
            <p className="student-create-payment-required">Qeydiyyat üçün yuxarıdan «Ödəniş qəbul et» ilə ilkin ödənişi əlavə edin — bu satış jurnalına düşür.</p>
          )}

          <label className="form-field student-create-lead-field">
            <span>Müraciət</span>
            <FormSelect
              name="leadId"
              value={selectedLeadId}
              onValueChange={handleLeadChange}
              emptyLabel={
                createOptions.leads.length > 0
                  ? "Müraciət seçin (istəyə bağlı)"
                  : "Müraciət yoxdur — məlumatları əl ilə daxil edin"
              }
              options={createOptions.leads.map((lead) => ({
                value: lead.id,
                label: `${lead.name} - ${lead.phone || lead.source}`,
                searchText: `${lead.name} ${lead.phone} ${lead.source}`,
              }))}
              disabled={!canConvertLead || createOptions.leads.length === 0}
              searchable
              searchPlaceholder="Müraciət axtar..."
            />
          </label>

          <div className="student-create-section">
            <div className="student-create-section-heading">
              <UserPlus />
              <div>
                <strong>Şəxsi məlumatlar</strong>
                <span>Tələbənin əsas əlaqə məlumatları</span>
              </div>
            </div>
            <div className="student-create-grid student-create-grid-personal">
              <label className="form-field">
                <span>Ad və soyad</span>
                <Input
                  name="fullName"
                  value={values.fullName}
                  onChange={(event) => updateValue("fullName", event.target.value)}
                  required
                  minLength={2}
                  maxLength={120}
                />
              </label>
              <label className="form-field">
                <span>Telefon</span>
                <Input
                  name="phone"
                  type="tel"
                  value={values.phone}
                  onChange={(event) => updateValue("phone", event.target.value)}
                  required
                />
              </label>
              <label className="form-field">
                <span>Mənbə</span>
                <FormSelect
                  name="source"
                  value={values.source}
                  onValueChange={handleSourceChange}
                  options={createOptions.sourceOptions.map((source) => ({
                    value: source,
                    label: source,
                  }))}
                  searchable
                  searchPlaceholder="Mənbə axtar..."
                  catalogKey="CRM_SOURCE"
                  createLabel="Yeni mənbə əlavə et"
                />
              </label>
              <label className="form-field">
                <span>Təhsil səviyyəsi</span>
                <FormSelect
                  aria-label="Təhsil səviyyəsi"
                  name="educationLevel"
                  value={values.educationLevel}
                  onValueChange={(value) => updateValue("educationLevel", cleanSelectValue(value))}
                  emptyLabel="Təhsil səviyyəsi seçilməyib"
                  searchable
                  catalogKey="STUDENT_EDUCATION_LEVEL"
                  createLabel="Yeni təhsil səviyyəsi əlavə et"
                  options={createOptions.educationLevels}
                />
              </label>
            </div>
          </div>

          <div className="student-create-section">
            <div className="student-create-section-heading">
              <BookOpen />
              <div>
                <strong>Tədris məlumatları</strong>
                <span>Proqram, məsul şəxslər və ödəniş planı</span>
              </div>
            </div>
            <div className="student-create-grid">
              <label className="form-field">
                <span>Proqram</span>
                <FormSelect
                  name="programId"
                  value={values.programId}
                  onValueChange={handleProgramChange}
                  emptyLabel="Proqram seçin"
                  options={createOptions.programs.map((program) => ({
                    value: program.id,
                    label: program.name,
                  }))}
                  searchable
                  searchPlaceholder="Proqram axtar..."
                  required
                />
              </label>
              <label className="form-field">
                <span>Status</span>
                <input name="lifecycleStatus" type="hidden" value="SLOT_WAITING" />
                <div className="student-readonly-status" aria-label="Slot gözləyir">
                  <span />
                  <strong>Slot gözləyir</strong>
                </div>
              </label>
              <label className="form-field">
                <span>Müəllim</span>
                <FormSelect
                  name="teacherId"
                  value={values.teacherId}
                  onValueChange={(value) => updateValue("teacherId", cleanSelectValue(value))}
                  emptyLabel="Müəllim seçilməyib"
                  searchable
                  searchPlaceholder="Müəllim axtar..."
                  options={createOptions.teachers.map((teacher) => ({
                    value: teacher.id,
                    label: teacher.fullName,
                  }))}
                />
              </label>
              <label className="form-field">
                <span>Menecer (avtomatik)</span>
                <Input
                  value={createOptions.currentManagerName}
                  aria-label="Avtomatik təyin olunan menecer"
                  readOnly
                />
              </label>
              <label className="form-field">
                <span>Qeydiyyat tarixi</span>
                <DatePicker
                  name="registeredDate"
                  minValue={currentBakuMonthStart()}
                  value={values.registeredDate}
                  onValueChange={(value) => updateValue("registeredDate", value)}
                  allowClear={false}
                  popoverPlacement="floating"
                  required
                />
              </label>
              <label className="form-field">
                <span>E-poçt</span>
                <Input
                  name="email"
                  type="email"
                  value={values.email}
                  onChange={(event) => updateValue("email", event.target.value)}
                  maxLength={320}
                  placeholder="telebe@example.com"
                />
              </label>
              <label className="form-field">
                <span>İlk dərs tarixi</span>
                <FormSelect
                  name="firstLessonMode"
                  value={values.firstLessonMode}
                  onValueChange={(value) => updateValue("firstLessonMode", value)}
                  options={studentFirstLessonModeOptions}
                />
              </label>
              {values.firstLessonMode === "MANUAL" ? (
                <label className="form-field">
                  <span>Manual ilk dərs tarixi</span>
                  <DatePicker
                    name="firstLessonDate"
                    minValue={currentBakuMonthStart()}
                    value={values.firstLessonDate}
                    onValueChange={(value) => updateValue("firstLessonDate", value)}
                    allowClear={false}
                    popoverPlacement="floating"
                    required
                  />
                </label>
              ) : (
                <label className="form-field">
                  <span>Avtomatik tarix</span>
                  <div className="student-readonly-status" aria-label="Slot veriləndə avtomatik təyin ediləcək">
                    <span />
                    <strong>İlk slot tarixindən</strong>
                  </div>
                </label>
              )}
              <label className="form-field">
                <span>Güzəşt növü</span>
                <FormSelect
                  aria-label="Güzəşt növü"
                  name="discountTypeSelect"
                  value={values.discountType}
                  onValueChange={handleDiscountTypeChange}
                  emptyLabel="Güzəşt yoxdur"
                  options={createOptions.discountTypes}
                  searchable
                  searchPlaceholder="Güzəşt növü axtar..."
                  catalogKey="STUDENT_DISCOUNT_TYPE"
                  createLabel="Yeni güzəşt növü əlavə et"
                />
              </label>
              {isGift ? (
                <input name="monthlyFee" type="hidden" value="0" />
              ) : (
                <label className="form-field">
                  <span>{values.discountType ? "Güzəştli aylıq məbləğ" : "Aylıq məbləğ"}</span>
                  <Input
                    name="monthlyFee"
                    value={values.monthlyFee}
                    onChange={(event) => updateValue("monthlyFee", event.target.value)}
                    inputMode="decimal"
                    required
                  />
                </label>
              )}
              <label className="form-field">
                <span>Aylıq dərs sayı</span>
                <Input
                  name="lessonsPerMonth"
                  value={values.lessonsPerMonth}
                  onChange={(event) => updateValue("lessonsPerMonth", event.target.value)}
                  inputMode="numeric"
                />
              </label>
            </div>
            <label className="form-field student-create-notes">
              <span>Qeyd</span>
              <Input
                name="notes"
                value={values.notes}
                onChange={(event) => updateValue("notes", event.target.value)}
                maxLength={500}
              />
            </label>
          </div>

          <div className="student-create-toolbar">
            <p>Məcburi sahələri doldurduqdan sonra tələbəni yaradın.</p>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Ləğv et
                </Button>
              </DialogClose>
              <Button
                type="submit"
                disabled={
                  !canCreateStudent
                  || (Boolean(selectedLeadId) && !canConvertLead)
                  || (!isGift && !acceptPayment)
                  || (!isGift && !canRecordPayment)
                }
              >
                <Plus data-icon="inline-start" />
                {isGift ? "Tələbəni yarat" : "Yarat və ödənişi qəbul et"}
              </Button>
            </DialogFooter>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function InitialPaymentDialog({
  accepted,
  canRecordPayment,
  values,
  onChange,
  onRemove,
  onSave,
}: {
  accepted: boolean;
  canRecordPayment: boolean;
  values: StudentFormValues;
  onChange: (name: keyof StudentFormValues, value: string) => void;
  onRemove: () => void;
  onSave: () => void;
}) {
  const [open, setOpen] = useState(false);

  const [amountError, setAmountError] = useState("");
  const amountMessage =
    amountError ||
    (isAdmissionAmountBelowMinimum(values.paymentAmount, "ADMISSION")
      ? ADMISSION_PAYMENT_MIN_MESSAGE
      : "");

  function savePayment() {
    if (isAdmissionAmountBelowMinimum(values.paymentAmount, "ADMISSION")) {
      setAmountError(ADMISSION_PAYMENT_MIN_MESSAGE);
      return;
    }
    onSave();
    setOpen(false);
  }

  function removePayment() {
    onRemove();
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          className="student-payment-action"
          data-accepted={accepted}
          disabled={!canRecordPayment}
          type="button"
          variant={accepted ? "secondary" : "outline"}
        >
          {accepted ? <Check data-icon="inline-start" /> : <Banknote data-icon="inline-start" />}
          {accepted ? "Ödəniş əlavə edildi" : "Ödəniş qəbul et"}
        </Button>
      </DialogTrigger>
      <DialogContent aria-describedby={undefined} className="student-initial-payment-dialog">
        <DialogHeader className="student-initial-payment-header">
          <span className="student-initial-payment-icon"><Banknote /></span>
          <div>
            <DialogTitle>İlkin ödəniş</DialogTitle>
            <p>Ödəniş məlumatlarını daxil edin.</p>
          </div>
        </DialogHeader>

        <form
          className="student-initial-payment-form"
          id="student-initial-payment-form"
          onSubmit={(event) => {
            event.preventDefault();
            savePayment();
          }}
        >
          <div className="field-grid">
            <label className={`form-field${amountMessage ? " has-error" : ""}`}>
              <span>Məbləğ</span>
              <Input
                name="paymentAmount"
                value={values.paymentAmount}
                onChange={(event) => {
                  const value = event.target.value;
                  onChange("paymentAmount", value);
                  setAmountError(
                    isAdmissionAmountBelowMinimum(value, "ADMISSION")
                      ? ADMISSION_PAYMENT_MIN_MESSAGE
                      : "",
                  );
                }}
                inputMode="decimal"
                aria-invalid={Boolean(amountMessage)}
                aria-describedby={amountMessage ? "create-payment-amount-error" : undefined}
                required
              />
              {amountMessage ? (
                <small id="create-payment-amount-error" className="form-field-error" role="alert">
                  {amountMessage}
                </small>
              ) : null}
            </label>
            <label className="form-field">
              <span>Metod</span>
              <FormSelect
                name="paymentMethod"
                value={values.paymentMethod}
                onValueChange={(value) => onChange("paymentMethod", value)}
                options={studentPaymentMethodOptions}
              />
            </label>
          </div>
          <label className="form-field">
            <span>Ödəniş növü</span>
            <FormSelect
              name="paymentScheduleType"
              value={values.paymentScheduleType}
              onValueChange={(value) => {
                onChange("paymentScheduleType", value);
                onChange("paymentAmount", value === AVANS_PAYMENT_KIND ? AVANS_DEFAULT_AMOUNT : values.monthlyFee);
              }}
              options={studentPaymentKindOptions}
            />
          </label>
          <label className="form-field">
            <span>Ödəniş tarixi</span>
            <DatePicker
              name="paymentDate"
              minValue={currentBakuMonthStart()}
              value={values.paymentDate}
              onValueChange={(value) => onChange("paymentDate", value)}
              maxValue={currentBakuDateValue()}
              allowClear={false}
              popoverPlacement="floating"
              required={open}
            />
          </label>
          <label className="form-field">
            <span>Aid olduğu ay</span>
            <MonthPicker
              name="paymentMonth"
              min={currentBakuMonthStart().slice(0, 7)}
              value={values.paymentMonth}
              onValueChange={(value) => onChange("paymentMonth", value)}
              allowClear={false}
              required={open}
            />
          </label>
          <label className="form-field">
            <span>Ödəniş qeydi</span>
            <Input
              name="paymentNote"
              value={values.paymentNote}
              onChange={(event) => onChange("paymentNote", event.target.value)}
              maxLength={240}
            />
          </label>
        </form>

        <DialogFooter className="student-initial-payment-footer">
          <Button onClick={() => setOpen(false)} type="button" variant="ghost">
            Ləğv et
          </Button>
          {accepted ? (
            <Button className="student-payment-remove" onClick={removePayment} type="button" variant="ghost">
              <Trash2 data-icon="inline-start" />
              Ödənişi sil
            </Button>
          ) : null}
          <Button form="student-initial-payment-form" type="submit">
            <Check data-icon="inline-start" />
            {accepted ? "Ödənişi yenilə" : "Ödənişi əlavə et"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function cleanSelectValue(value: string) {
  return value === EMPTY_SELECT_VALUE ? "" : value;
}
