"use client";

import { useState } from "react";
import { Banknote, Plus, UserPlus } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { FormSelect } from "@/components/ui/select";
import { EMPTY_SELECT_VALUE } from "@/modules/shared/form-values";
import { studentPaymentMethodOptions } from "@/modules/students/payment-method";
import type { StudentListData } from "@/modules/students/queries";

type CreateOptions = StudentListData["createOptions"];
type CreateMode = "lead" | "manual";

const createStatusOptions = [
  { value: "GROUP_WAITING", label: "Qrup gözləyir" },
  { value: "ACTIVE", label: "Aktiv" },
];

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
    startDate: createOptions.defaultStartDate,
    firstLessonDate: "",
    monthlyFee: "",
    lessonsPerMonth: "",
    dueDate: createOptions.defaultDueDate,
    notes: "",
    paymentAmount: "",
    paymentDate: createOptions.defaultPaymentDate,
    paymentMonth: createOptions.defaultPaymentMonth,
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

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="dark-action" type="button" disabled={!canCreateStudent}>
          <Plus size={16} />
          Tələbə yarat
        </button>
      </DialogTrigger>
      <DialogContent className="student-create-dialog">
        <DialogHeader>
          <DialogTitle>Tələbə yarat</DialogTitle>
          <DialogDescription>
            Müraciətdən və ya sıfırdan tələbə, enrollment, faktura və ilkin ödəniş.
          </DialogDescription>
        </DialogHeader>

        <div className="student-create-switch" role="tablist" aria-label="Yaratma rejimi">
          <button
            type="button"
            data-active={mode === "lead"}
            disabled={!canConvertLead}
            onClick={() => handleModeChange("lead")}
          >
            Müraciətdən
          </button>
          <button
            type="button"
            data-active={mode === "manual"}
            onClick={() => handleModeChange("manual")}
          >
            Sıfırdan
          </button>
        </div>

        <form action={createStudentAction} className="student-create-form">
          <input name="mode" type="hidden" value={mode} />
          <input name="returnTo" type="hidden" value={returnTo} />

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
            <div className="student-detail-section-title">
              <UserPlus />
              <span>Profil</span>
            </div>
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
                <Input
                  name="source"
                  value={values.source}
                  onChange={(event) => updateValue("source", event.target.value)}
                  maxLength={60}
                />
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
            <div className="student-detail-section-title">
              <UserPlus />
              <span>Enrollment</span>
            </div>
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
                <FormSelect
                  name="lifecycleStatus"
                  value={values.lifecycleStatus}
                  onValueChange={(value) => updateValue("lifecycleStatus", value)}
                  options={createStatusOptions}
                />
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
                <Input
                  name="registeredDate"
                  value={values.registeredDate}
                  onChange={(event) => updateValue("registeredDate", event.target.value)}
                  inputMode="numeric"
                  required
                />
              </label>
              <label className="form-field">
                <span>Başlama tarixi</span>
                <Input
                  name="startDate"
                  value={values.startDate}
                  onChange={(event) => updateValue("startDate", event.target.value)}
                  inputMode="numeric"
                  required
                />
              </label>
            </div>
            <div className="field-grid">
              <label className="form-field">
                <span>İlk dərs tarixi</span>
                <Input
                  name="firstLessonDate"
                  value={values.firstLessonDate}
                  onChange={(event) => updateValue("firstLessonDate", event.target.value)}
                  inputMode="numeric"
                />
              </label>
              <label className="form-field">
                <span>Ödəniş son tarixi</span>
                <Input
                  name="dueDate"
                  value={values.dueDate}
                  onChange={(event) => updateValue("dueDate", event.target.value)}
                  inputMode="numeric"
                  required
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

          <label className="student-payment-toggle">
            <input
              name="acceptPayment"
              type="checkbox"
              checked={acceptPayment}
              disabled={!canRecordPayment}
              onChange={(event) => setAcceptPayment(event.target.checked)}
            />
            <span>Ödəniş qəbul et</span>
          </label>

          {acceptPayment ? (
            <div className="student-create-section">
              <div className="student-detail-section-title">
                <Banknote />
                <span>İlkin ödəniş</span>
              </div>
              <div className="field-grid">
                <label className="form-field">
                  <span>Məbləğ</span>
                  <Input
                    name="paymentAmount"
                    value={values.paymentAmount}
                    onChange={(event) => updateValue("paymentAmount", event.target.value)}
                    inputMode="decimal"
                    required
                  />
                </label>
                <label className="form-field">
                  <span>Metod</span>
                  <FormSelect
                    name="paymentMethod"
                    value={values.paymentMethod}
                    onValueChange={(value) => updateValue("paymentMethod", value)}
                    options={studentPaymentMethodOptions}
                  />
                </label>
              </div>
              <div className="field-grid">
                <label className="form-field">
                  <span>Ödəniş tarixi</span>
                  <Input
                    name="paymentDate"
                    value={values.paymentDate}
                    onChange={(event) => updateValue("paymentDate", event.target.value)}
                    inputMode="numeric"
                    required
                  />
                </label>
                <label className="form-field">
                  <span>Ödəniş ayı</span>
                  <Input
                    name="paymentMonth"
                    value={values.paymentMonth}
                    onChange={(event) => updateValue("paymentMonth", event.target.value)}
                    inputMode="numeric"
                    required
                  />
                </label>
              </div>
              <label className="form-field">
                <span>Ödəniş qeydi</span>
                <Input
                  name="paymentNote"
                  value={values.paymentNote}
                  onChange={(event) => updateValue("paymentNote", event.target.value)}
                  maxLength={240}
                />
              </label>
            </div>
          ) : null}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Ləğv et
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!canCreateStudent}>
              <Plus data-icon="inline-start" />
              {acceptPayment
                ? "Tələbəni yarat və ödənişi qəbul et"
                : "Tələbəni yarat"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function cleanSelectValue(value: string) {
  return value === EMPTY_SELECT_VALUE ? "" : value;
}
