"use client";

import { useState } from "react";
import { Banknote, Check, Plus, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { FormSelect } from "@/components/ui/select";
import { EMPTY_SELECT_VALUE } from "@/modules/shared/form-values";
import { studentPaymentMethodOptions } from "@/modules/students/payment-method";
import type { StudentListData } from "@/modules/students/queries";

type CreateOptions = StudentListData["createOptions"];
type CreateMode = "lead" | "manual";
const ADD_SOURCE_VALUE = "__add_source__";
type StudentFormValues = {
  paymentAmount: string;
  paymentDate: string;
  paymentMethod: string;
  paymentNote: string;
};

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
  createStudentAction: (formData: FormData) => void | Promise<void>;
}) {
  const [mode, setMode] = useState<CreateMode>("lead");
  const [selectedLeadId, setSelectedLeadId] = useState("");
  const [isAddingSource, setIsAddingSource] = useState(false);
  const [acceptPayment, setAcceptPayment] = useState(false);
  const [values, setValues] = useState(() => ({
    fullName: "",
    phone: "",
    source: "Manual",
    educationLevel: "",
    programId: "",
    teacherId: "",
    managerId: "",
    lifecycleStatus: "GROUP_WAITING",
    registeredDate: createOptions.defaultRegisteredDate,
    firstLessonDate: "",
    monthlyFee: "",
    lessonsPerMonth: "",
    notes: "",
    paymentAmount: "",
    paymentDate: createOptions.defaultPaymentDate,
    paymentMethod: "CASH",
    paymentNote: "",
  }));

  function updateValue(name: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
  }

  function handleModeChange(nextMode: CreateMode) {
    setMode(nextMode);

    if (nextMode === "manual") {
      setSelectedLeadId("");
      setIsAddingSource(false);
      setValues((current) => ({
        ...current,
        fullName: "",
        phone: "",
        source: "Manual",
        educationLevel: "",
        programId: "",
        teacherId: "",
        managerId: "",
        monthlyFee: "",
        lessonsPerMonth: "",
        paymentAmount: "",
        paymentNote: "",
        notes: "",
      }));
    }
  }

  function handleLeadChange(value: string) {
    const leadId = cleanSelectValue(value);
    setSelectedLeadId(leadId);
    const lead = createOptions.leads.find((item) => item.id === leadId);

    if (!lead) {
      return;
    }

    setIsAddingSource(false);
    const program = createOptions.programs.find((item) => item.id === lead.programId);
    setValues((current) => ({
      ...current,
      fullName: lead.name,
      phone: lead.phone,
      source: lead.source,
      programId: lead.programId,
      managerId: lead.managerId,
      monthlyFee: program?.monthlyFee ?? current.monthlyFee,
      lessonsPerMonth: program?.lessonsPerMonth ?? current.lessonsPerMonth,
      notes: lead.note,
      paymentAmount: program?.monthlyFee ?? current.paymentAmount,
    }));
  }

  function handleProgramChange(value: string) {
    const programId = cleanSelectValue(value);
    const program = createOptions.programs.find((item) => item.id === programId);
    setValues((current) => ({
      ...current,
      programId,
      monthlyFee: program?.monthlyFee ?? current.monthlyFee,
      lessonsPerMonth: program?.lessonsPerMonth ?? current.lessonsPerMonth,
      paymentAmount: program?.monthlyFee ?? current.paymentAmount,
    }));
  }

  function handleSourceChange(value: string) {
    if (value === ADD_SOURCE_VALUE) {
      setIsAddingSource(true);
      updateValue("source", "");
      return;
    }

    setIsAddingSource(false);
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

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" disabled={!canCreateStudent}>
          <Plus data-icon="inline-start" />
          Tələbə yarat
        </Button>
      </DialogTrigger>
      <DialogContent aria-describedby={undefined} className="student-create-dialog">
        <DialogHeader className="student-create-header">
          <div className="student-create-title">
            <span className="student-create-header-icon"><UserPlus /></span>
            <DialogTitle>Yeni tələbə</DialogTitle>
          </div>
          <InitialPaymentDialog
            accepted={acceptPayment}
            canRecordPayment={canRecordPayment}
            values={values}
            onChange={updateValue}
            onRemove={removePayment}
            onSave={() => setAcceptPayment(true)}
          />
        </DialogHeader>

        <form action={createStudentAction} className="student-create-form" id="student-create-form">
          <input name="mode" type="hidden" value={mode} />
          <input name="returnTo" type="hidden" value={returnTo} />
          <input name="acceptPayment" type="hidden" value={acceptPayment ? "true" : "false"} />
          <input name="paymentAmount" type="hidden" value={values.paymentAmount} />
          <input name="paymentDate" type="hidden" value={values.paymentDate} />
          <input name="paymentMonth" type="hidden" value={getPaymentMonth(values.paymentDate)} />
          <input name="paymentMethod" type="hidden" value={values.paymentMethod} />
          <input name="paymentNote" type="hidden" value={values.paymentNote} />

          <div className="student-create-toolbar">
            <div className="student-create-switch" role="tablist" aria-label="Yaratma rejimi">
              <button
                type="button"
                role="tab"
                aria-selected={mode === "lead"}
                data-active={mode === "lead"}
                disabled={!canConvertLead}
                onClick={() => handleModeChange("lead")}
              >
                Müraciətdən
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "manual"}
                data-active={mode === "manual"}
                onClick={() => handleModeChange("manual")}
              >
                Sıfırdan
              </button>
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Ləğv et
                </Button>
              </DialogClose>
              <Button type="submit" disabled={!canCreateStudent}>
                <Plus data-icon="inline-start" />
                {acceptPayment
                  ? "Yarat və ödənişi qəbul et"
                  : "Tələbəni yarat"}
              </Button>
            </DialogFooter>
          </div>

          {mode === "lead" ? (
            <label className="form-field">
              <span>Müraciət</span>
              <FormSelect
                name="leadId"
                value={selectedLeadId}
                onValueChange={handleLeadChange}
                emptyLabel={
                  createOptions.leads.length > 0
                    ? "Müraciət seçin"
                    : "Çevriləcək müraciət yoxdur"
                }
                options={createOptions.leads.map((lead) => ({
                  value: lead.id,
                  label: `${lead.name} - ${lead.phone || lead.source}`,
                }))}
                disabled={!canConvertLead || createOptions.leads.length === 0}
                required={mode === "lead"}
              />
            </label>
          ) : null}

          <div className="student-create-section">
            <div className="field-grid">
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
            </div>
            <div className="field-grid">
              <label className="form-field">
                <span>Mənbə</span>
                <FormSelect
                  name="sourceSelector"
                  value={isAddingSource ? ADD_SOURCE_VALUE : values.source}
                  onValueChange={handleSourceChange}
                  options={[
                    ...createOptions.sourceOptions.map((source) => ({
                      value: source,
                      label: source,
                    })),
                    { value: ADD_SOURCE_VALUE, label: "+ Yeni mənbə əlavə et" },
                  ]}
                />
                {isAddingSource ? (
                  <Input
                    name="source"
                    value={values.source}
                    onChange={(event) => updateValue("source", event.target.value)}
                    placeholder="Yeni mənbəni yazın"
                    maxLength={60}
                    required
                  />
                ) : (
                  <input name="source" type="hidden" value={values.source} />
                )}
              </label>
              <label className="form-field">
                <span>Təhsil səviyyəsi</span>
                <Input
                  name="educationLevel"
                  value={values.educationLevel}
                  onChange={(event) => updateValue("educationLevel", event.target.value)}
                  maxLength={80}
                />
              </label>
            </div>
          </div>

          <div className="student-create-section">
            <div className="field-grid">
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
                  required
                />
              </label>
              <label className="form-field">
                <span>Status</span>
                <input name="lifecycleStatus" type="hidden" value="GROUP_WAITING" />
                <div className="student-readonly-status" aria-label="Qrup gözləyir">
                  <span />
                  <strong>Qrup gözləyir</strong>
                </div>
              </label>
            </div>
            <div className="field-grid">
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
                <span>Menecer</span>
                <FormSelect
                  name="managerId"
                  value={values.managerId}
                  onValueChange={(value) => updateValue("managerId", cleanSelectValue(value))}
                  emptyLabel="Avtomatik"
                  searchable
                  searchPlaceholder="Menecer axtar..."
                  options={createOptions.managers.map((manager) => ({
                    value: manager.id,
                    label: manager.fullName,
                  }))}
                />
              </label>
            </div>
            <div className="field-grid">
              <label className="form-field">
                <span>Qeydiyyat tarixi</span>
                <DatePicker
                  name="registeredDate"
                  value={values.registeredDate}
                  onValueChange={(value) => updateValue("registeredDate", value)}
                  allowClear={false}
                  required
                />
              </label>
              <label className="form-field">
                <span>İlk dərs tarixi</span>
                <DatePicker
                  name="firstLessonDate"
                  value={values.firstLessonDate}
                />
              </label>
            </div>
            <div className="field-grid">
              <label className="form-field">
                <span>Aylıq məbləğ</span>
                <Input
                  name="monthlyFee"
                  value={values.monthlyFee}
                  onChange={(event) => updateValue("monthlyFee", event.target.value)}
                  inputMode="decimal"
                  required
                />
              </label>
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
            <label className="form-field">
              <span>Qeyd</span>
              <Input
                name="notes"
                value={values.notes}
                onChange={(event) => updateValue("notes", event.target.value)}
                maxLength={500}
              />
            </label>
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

function getPaymentMonth(paymentDate: string) {
  const isoMatch = paymentDate.match(/^(\d{4})-(\d{2})-\d{2}$/);
  const localMatch = paymentDate.match(/^\d{2}\.(\d{2})\.(\d{4})$/);

  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}`;
  }

  return localMatch ? `${localMatch[2]}-${localMatch[1]}` : "";
}
