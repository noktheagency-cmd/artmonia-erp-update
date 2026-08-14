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
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { FormSelect } from "@/components/ui/select";
import { EMPTY_SELECT_VALUE } from "@/modules/shared/form-values";
import { educationLevelOptions } from "@/modules/students/education-level-options";
import { studentPaymentMethodOptions } from "@/modules/students/payment-method";
import { studentPaymentScheduleTypeOptions } from "@/modules/students/payment-schedule-type";
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
  paymentMethod: string;
  paymentScheduleType: string;
  paymentNote: string;
};

function buildInitialStudentValues(createOptions: CreateOptions) {
  return {
    fullName: "",
    phone: "",
    source: "Manual",
    educationLevel: "",
    programId: "",
    teacherId: "",
    campaignId: "",
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
        source: "Manual",
        educationLevel: "",
        programId: "",
        teacherId: "",
        campaignId: "",
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
      campaignId: lead.campaignId,
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
    setAcceptPayment(false);
    setValues((current) => ({
      ...current,
      paymentAmount: "",
      paymentNote: "",
    }));
  }

  async function createStudent(formData: FormData) {
    try {
      const result = unwrapActionResult(await createStudentAction(formData)) as {
        redirectTo: string;
      };
      setOpen(false);
      resetCreateForm();
      notifySuccess("Tələbə yaradıldı", "Yeni tələbə siyahıya əlavə olundu.");
      router.replace(result.redirectTo as Route, { scroll: false });
      router.refresh();
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
          <input name="paymentMethod" type="hidden" value={values.paymentMethod} />
          <input name="paymentScheduleType" type="hidden" value={values.paymentScheduleType} />
          <input name="paymentNote" type="hidden" value={values.paymentNote} />

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
                  value={values.phone}
                  onChange={(event) => updateValue("phone", event.target.value)}
                  required
                  maxLength={40}
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
                  options={educationLevelOptions}
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
                <span>Kampaniya</span>
                <FormSelect
                  name="campaignId"
                  value={values.campaignId}
                  onValueChange={(value) => updateValue("campaignId", cleanSelectValue(value))}
                  emptyLabel="Kampaniya seçilməyib"
                  options={createOptions.campaigns.map((campaign) => ({ value: campaign.id, label: campaign.name }))}
                  searchable
                  searchPlaceholder="Kampaniya axtar..."
                />
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
                  value={values.registeredDate}
                  onValueChange={(value) => updateValue("registeredDate", value)}
                  allowClear={false}
                  popoverPlacement="floating"
                  required
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
                disabled={!canCreateStudent || (Boolean(selectedLeadId) && !canConvertLead)}
              >
                <Plus data-icon="inline-start" />
                {acceptPayment
                  ? "Yarat və ödənişi qəbul et"
                  : "Tələbəni yarat"}
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

  function savePayment() {
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
            <label className="form-field">
              <span>Məbləğ</span>
              <Input
                name="paymentAmount"
                value={values.paymentAmount}
                onChange={(event) => onChange("paymentAmount", event.target.value)}
                inputMode="decimal"
                required
              />
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
              onValueChange={(value) => onChange("paymentScheduleType", value)}
              options={studentPaymentScheduleTypeOptions}
            />
          </label>
          <label className="form-field">
            <span>Ödəniş tarixi</span>
            <DatePicker
              name="paymentDate"
              value={values.paymentDate}
              onValueChange={(value) => onChange("paymentDate", value)}
              allowClear={false}
              popoverPlacement="floating"
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
