"use client";

import { useRef, useState } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import {
  Banknote,
  BookOpen,
  ChevronDown,
  Edit,
  GraduationCap,
  Plus,
  RefreshCcw,
  Trash2,
  Undo2,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { currentBakuMonthValue, MonthPicker, normalizeMonthValue } from "@/components/ui/month-picker";
import { Input } from "@/components/ui/input";
import { FormSelect } from "@/components/ui/select";
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
import { studentPaymentMethodOptions } from "@/modules/students/payment-method";
import {
  AVANS_DEFAULT_AMOUNT,
  AVANS_PAYMENT_KIND,
  storedScheduleTypeForPaymentKind,
  studentPaymentKindOptions,
} from "@/modules/students/payment-schedule-type";
import {
  ADMISSION_PAYMENT_MIN_MESSAGE,
  isAdmissionAmountBelowMinimum,
} from "@/modules/students/admission-payment-amount";
import { buildCrmSourceSelectOptions } from "@/modules/crm/source-options";
import { notifyCaughtError, notifySuccess } from "@/lib/app-notifications";
import { unwrapActionResult } from "@/lib/action-result";
import { StudentReminderDialog } from "@/modules/students/student-reminders-client";
import { currentBakuDateValue } from "@/modules/students/payment-date-policy";
import { confirmPaymentMonthMismatch } from "@/modules/students/payment-date-policy-client";

const studentStatusOptions = [
  { value: "SLOT_WAITING", label: "Slot gözləyir" },
  { value: "ACTIVE", label: "Aktiv" },
  // BK-10: single freeze — seat kept, monthly billing continues.
  { value: "FROZEN", label: "Dondurulub (yer saxlanır, haqq davam edir)" },
  { value: "STOPPED", label: "Dayandırılıb" },
  { value: "DECLINED", label: "İmtina edib" },
  { value: "COMPLETED", label: "Tamamlayıb" },
];

interface StudentDetail {
  id: string;
  name: string;
  phone: string;
  code: string;
  lifecycleStatusValue: string;
  freezeReserved: boolean;
  advanceRefund: { saleId: string; amount: string; remaining: string } | null;
  detail: {
    hasEditableEnrollment: boolean;
    email: string;
    source: string;
    educationLevel: string;
    managerId: string;
    manager: string;
    campaignId: string;
    programId: string;
    teacherId: string;
    discountType: string;
    lessonsPerMonth: string;
    firstLessonDate: string;
    overallFirstLessonDate: string;
    billingAnchorDate: string;
    registeredDate: string;
    notes: string;
    paymentDefaultAmount: string;
    paymentDefaultDate: string;
    paymentDefaultMonth: string;
    earliestUpgradeMonth: string | null;
    monthlyFee: string;
    reminderDefaultDate: string;
  };
}

interface StudentEditOptions {
  programs: Array<{
    id: string;
    name: string;
    monthlyFee: string;
    lessonsPerMonth: string;
  }>;
  teachers: Array<{ id: string; fullName: string }>;
  managers: Array<{ id: string; fullName: string }>;
  campaigns: Array<{ id: string; name: string }>;
  educationLevels: Array<{ value: string; label: string }>;
  discountTypes: Array<{ value: string; label: string }>;
  sourceOptions: string[];
}

interface Permissions {
  canCreateStudent: boolean;
  canUpdateStudent: boolean;
  canAssignStudentManager: boolean;
  canConvertLead: boolean;
  canRecordPayment: boolean;
  canChangeStatus: boolean;
  canDeleteStudent: boolean;
  canManageReminders: boolean;
}

export function StudentDetailActions({
  student,
  editOptions,
  permissions,
  recordPaymentAction,
  updateStudentProfileAction,
  createStudentEnrollmentAction,
  updateStudentStatusAction,
  deleteStudentAction,
  createStudentReminderAction,
  refundAdvanceAction,
}: {
  student: StudentDetail;
  editOptions: StudentEditOptions;
  permissions: Permissions;
  recordPaymentAction: (formData: FormData) => unknown | Promise<unknown>;
  updateStudentProfileAction: (formData: FormData) => unknown | Promise<unknown>;
  createStudentEnrollmentAction: (formData: FormData) => unknown | Promise<unknown>;
  updateStudentStatusAction: (formData: FormData) => unknown | Promise<unknown>;
  deleteStudentAction: (formData: FormData) => unknown | Promise<unknown>;
  createStudentReminderAction: (formData: FormData) => unknown | Promise<unknown>;
  refundAdvanceAction: (formData: FormData) => unknown | Promise<unknown>;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [editLifecycleStatus, setEditLifecycleStatus] = useState(student.lifecycleStatusValue);
  const lifecycleStatusOpen = useRef(false);
  const [editProgramId, setEditProgramId] = useState(student.detail.programId);
  const [editMonthlyFee, setEditMonthlyFee] = useState(student.detail.monthlyFee);
  const editingEnrollment = student.detail.hasEditableEnrollment;
  const [profileBusy, setProfileBusy] = useState(false);
  const [packageBusy, setPackageBusy] = useState(false);
  const [packageOpen, setPackageOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundBusy, setRefundBusy] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusValue, setStatusValue] = useState(student.lifecycleStatusValue);
  const statusSelectOpen = useRef(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState(student.detail.paymentDefaultAmount);
  const [paymentKind, setPaymentKind] = useState("MONTHLY");
  const [paymentAmountError, setPaymentAmountError] = useState("");
  const [paymentRequestId, setPaymentRequestId] = useState(() => crypto.randomUUID());
  const [paymentDate, setPaymentDate] = useState(student.detail.paymentDefaultDate);
  const [paymentMonth, setPaymentMonth] = useState(
    () => normalizeMonthValue(student.detail.paymentDefaultMonth) || currentBakuMonthValue(),
  );
  const sourceOptions = editOptions.sourceOptions.includes(student.detail.source)
    ? editOptions.sourceOptions
    : [student.detail.source, ...editOptions.sourceOptions].filter(Boolean);
  const currentEducationLevel = student.detail.educationLevel;
  const selectableEducationLevels = editOptions.educationLevels.some(
    (option) => option.value === currentEducationLevel,
  )
    ? editOptions.educationLevels
    : [
        ...(currentEducationLevel
          ? [{ value: currentEducationLevel, label: currentEducationLevel }]
          : []),
        ...editOptions.educationLevels,
      ];

  async function updateStatus(formData: FormData) {
    if (statusBusy) return;
    setStatusBusy(true);
    try {
      const result = unwrapActionResult(await updateStudentStatusAction(formData)) as {
        redirectTo: string;
      };
      setStatusOpen(false);
      notifySuccess("Status yeniləndi", "Tələbənin statusu uğurla dəyişdirildi.");
      router.replace(result.redirectTo as Route, { scroll: false });
      router.refresh();
    } catch (error) {
      notifyCaughtError(error, "Tələbə statusu yenilənmədi.");
    } finally {
      setStatusBusy(false);
    }
  }

  async function deleteStudent(formData: FormData) {
    try {
      const result = unwrapActionResult(await deleteStudentAction(formData)) as {
        redirectTo: string;
      };
      setDeleteOpen(false);
      notifySuccess("Tələbə silindi", "Tələbə və bağlı məlumatlar sistemdən silindi.");
      router.replace(result.redirectTo as Route);
      router.refresh();
    } catch (error) {
      notifyCaughtError(error, "Tələbə silinmədi.");
    }
  }

  async function addPackage(formData: FormData) {
    if (packageBusy) return;
    setPackageBusy(true);
    try {
      unwrapActionResult(await createStudentEnrollmentAction(formData));
      setPackageOpen(false);
      notifySuccess("Paket əlavə edildi", "Yeni proqram ayrıca yaradıldı. Əvvəlki paket tarixçəsi saxlanıldı; dərs planı üçün müəllim və slot təyin edin — aktivləşmə ilk faktiki iştirakla olur.");
      router.refresh();
    } catch (error) {
      notifyCaughtError(error, "Paket əlavə edilmədi.");
    } finally {
      setPackageBusy(false);
    }
  }

  return (
    <div className="student-actions-row">
      <StudentReminderDialog
        studentId={student.id}
        studentName={student.name}
        defaultDate={student.detail.reminderDefaultDate}
        canManage={permissions.canManageReminders}
        action={createStudentReminderAction}
      />

      <Dialog open={packageOpen} onOpenChange={setPackageOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" type="button" disabled={!permissions.canUpdateStudent}>
            <Plus data-icon="inline-start" />
            Paket əlavə et
          </Button>
        </DialogTrigger>
        <DialogContent className="student-payment-dialog">
          <DialogHeader>
            <DialogTitle>Yeni tədris paketi</DialogTitle>
            <DialogDescription>
              Əvvəlki paket və ödəniş tarixçəsi dəyişmir. Yeni paket ayrıca yaradılır. Tamamlamış tələbə “Slot gözləyir” mərhələsinə keçir; aktivləşmə ilk faktiki aylıq dərs iştirakı ilə baş verir. Qorunan billing tarixi dəyişmir.
            </DialogDescription>
          </DialogHeader>
          <form action={addPackage} className="student-payment-form">
            <input name="studentId" type="hidden" value={student.id} />
            <label className="form-field">
              <span>Proqram</span>
              <FormSelect
                name="programId"
                emptyLabel="Proqram seçin"
                options={editOptions.programs.map((program) => ({ value: program.id, label: program.name }))}
                searchable
                required
              />
            </label>
            <div className="field-grid">
              <label className="form-field">
                <span>Müəllim</span>
                <FormSelect
                  name="teacherId"
                  emptyLabel="Müəllim seçilməyib"
                  options={editOptions.teachers.map((teacher) => ({ value: teacher.id, label: teacher.fullName }))}
                  searchable
                />
              </label>
              <label className="form-field">
                <span>İlk dərs tarixi</span>
                <DatePicker
                  name="firstLessonDate"
                  defaultValue={student.detail.paymentDefaultDate}
                  allowClear={false}
                  required
                />
              </label>
            </div>
            <div className="field-grid">
              <label className="form-field">
                <span>Aylıq məbləğ</span>
                <Input name="monthlyFee" inputMode="decimal" placeholder="0.00" required />
              </label>
              <label className="form-field">
                <span>Aylıq dərs sayı</span>
                <Input name="lessonsPerMonth" inputMode="numeric" placeholder="Məsələn: 8" />
              </label>
            </div>
            <label className="form-field">
              <span>Güzəşt növü</span>
              <FormSelect
                name="discountType"
                emptyLabel="Güzəşt yoxdur"
                options={editOptions.discountTypes}
                searchable
              />
            </label>
            <DialogFooter>
              <DialogClose asChild><Button type="button" variant="ghost">Ləğv et</Button></DialogClose>
              <Button type="submit" disabled={packageBusy}><Plus data-icon="inline-start" />{packageBusy ? "Yaradılır…" : "Paketi yarat"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={statusOpen} onOpenChange={(value) => { if (statusBusy) return; setStatusOpen(value); if (value) setStatusValue(student.lifecycleStatusValue); }}>
        <DialogTrigger asChild>
          <Button className="student-action-status" variant="outline" type="button" disabled={!permissions.canChangeStatus}>
            <RefreshCcw data-icon="inline-start" />
            Status dəyiş
          </Button>
        </DialogTrigger>
        <DialogContent className="student-payment-dialog">
          <DialogHeader>
            <DialogTitle>Status dəyiş</DialogTitle>
            <DialogDescription>
              Dondurma yerini saxlayır və aylıq haqq hesablanmağa davam edir. Ödəniş günü dəyişmir; ödənişi ayrıca “Ödəniş qəbul et”dən yazın.
              Keçmiş fasilə üçün profildəki “Dondurulma dövrləri” bölməsinə baxın.
            </DialogDescription>
          </DialogHeader>

          <form action={updateStatus} className="student-payment-form">
            <input name="studentId" type="hidden" value={student.id} />
            <input name="returnTo" type="hidden" value={`/students/${student.id}`} />

            <div className="field-grid">
              <label className="form-field">
                <span>Status</span>
                <input name="lifecycleStatus" type="hidden" value={statusValue} />
                <FormSelect
                  name="lifecycleStatusPicker"
                  value={statusValue}
                  onOpenChange={(open) => {
                    statusSelectOpen.current = open;
                  }}
                  onValueChange={(value) => {
                    if (statusSelectOpen.current) setStatusValue(value);
                  }}
                  options={studentStatusOptions}
                />
              </label>
              <label className="form-field">
                <span>Aktivləşmə / status tarixi</span>
                <DatePicker
                  name="firstLessonDate"
                  defaultValue={currentBakuDateValue()}
                />
              </label>
            </div>

            <label className="form-field">
              <span>Qeyd</span>
              <Input
                name="note"
                maxLength={240}
                required={statusValue === "FROZEN" || student.freezeReserved}
                placeholder="Məsələn: slot başladı, imtina etdi"
              />
            </label>

            {statusValue === "FROZEN" ? (
              <p className="payment-policy-note">
                Yer saxlanır, dərs keçirilməsə də aylıq haqq qalır. Bu seçim ödənişi avtomatik qəbul etmir.
              </p>
            ) : null}

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Ləğv et
                </Button>
              </DialogClose>
              <Button type="submit" disabled={statusBusy}>
                <RefreshCcw data-icon="inline-start" />
                {statusBusy ? "Saxlanılır…" : "Statusu təsdiqlə"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {student.advanceRefund ? (
        <Dialog open={refundOpen} onOpenChange={setRefundOpen}>
          <DialogTrigger asChild>
            <Button type="button" variant="ghost" disabled={!permissions.canChangeStatus}>
              <Undo2 data-icon="inline-start" />
              Avansı geri qaytar
            </Button>
          </DialogTrigger>
          <DialogContent className="student-payment-dialog">
            <DialogHeader>
              <DialogTitle>Avansı geri qaytar</DialogTitle>
            </DialogHeader>
            <form
              className="student-payment-form"
              onSubmit={async (event) => {
                event.preventDefault();
                if (refundBusy || !student.advanceRefund) return;
                setRefundBusy(true);
                const formData = new FormData(event.currentTarget);
                try {
                  unwrapActionResult(await refundAdvanceAction(formData));
                  setRefundOpen(false);
                  notifySuccess("Avans geri qaytarıldı", "Tələbənin statusu imtinaya keçdi.");
                  router.refresh();
                } catch (error) {
                  notifyCaughtError(error, "Avans geri qaytarılmadı.");
                } finally {
                  setRefundBusy(false);
                }
              }}
            >
              <input name="saleId" type="hidden" value={student.advanceRefund.saleId} />
              <label className="form-field">
                <span>Məbləğ</span>
                <Input value={student.advanceRefund.amount} readOnly />
              </label>
              <label className="form-field">
                <span>Səbəb</span>
                <Input name="reason" minLength={3} maxLength={500} required placeholder="Məsələn: ilk dərsə gəlmədi" />
              </label>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="ghost">Ləğv et</Button>
                </DialogClose>
                <Button type="submit" disabled={refundBusy}>
                  <Undo2 data-icon="inline-start" />
                  {refundBusy ? "Qaytarılır…" : "Geri qaytar"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}

      {/* Record Payment Dialog */}
      <Dialog
        open={paymentOpen}
        onOpenChange={(nextOpen) => {
          setPaymentOpen(nextOpen);
          if (nextOpen) {
            setPaymentKind("MONTHLY");
            setPaymentAmount(student.advanceRefund?.remaining || student.detail.paymentDefaultAmount);
            setPaymentAmountError("");
            setPaymentRequestId(crypto.randomUUID());
            setPaymentDate(student.detail.paymentDefaultDate);
            setPaymentMonth(normalizeMonthValue(student.detail.paymentDefaultMonth) || currentBakuMonthValue());
          }
        }}
      >
        <DialogTrigger asChild>
          <Button className="student-action-payment" variant="secondary" type="button" disabled={!permissions.canRecordPayment}>
            <Banknote data-icon="inline-start" />
            Ödəniş qəbul et
          </Button>
        </DialogTrigger>
        <DialogContent className="student-payment-dialog">
          <DialogHeader>
            <DialogTitle>Ödəniş qəbul et</DialogTitle>
          </DialogHeader>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const purpose = String(formData.get("receiptPurpose") ?? "");
              if (isAdmissionAmountBelowMinimum(String(formData.get("amount") ?? ""), purpose)) {
                setPaymentAmountError(ADMISSION_PAYMENT_MIN_MESSAGE);
                return;
              }
              setPaymentAmountError("");
              if (!confirmPaymentMonthMismatch(formData)) return;
              try {
                const result = unwrapActionResult(await recordPaymentAction(formData)) as {
                  redirectTo: string;
                };
                setPaymentOpen(false);
                notifySuccess("Ödəniş qəbul edildi", "Tələbənin balansı yeniləndi.");
                router.replace(result.redirectTo as Route, { scroll: false });
                router.refresh();
              } catch (error) {
                notifyCaughtError(error, "Ödəniş qeydə alınmadı.");
              }
            }}
            className="student-payment-form"
          >
            <input name="studentId" type="hidden" value={student.id} />
            <input name="returnTo" type="hidden" value={`/students/${student.id}`} />
            <input name="idempotencyKey" type="hidden" value={paymentRequestId} />
            <input name="scheduleType" type="hidden" value={storedScheduleTypeForPaymentKind(paymentKind)} />
            {paymentKind === AVANS_PAYMENT_KIND ? (
              <>
                <input name="receiptPurpose" type="hidden" value="ADMISSION" />
                <input name="contractConfirmed" type="hidden" value="on" />
              </>
            ) : student.advanceRefund ? (
              <input name="receiptPurpose" type="hidden" value="INITIAL_BALANCE" />
            ) : null}

            <div className="field-grid">
              <label className="form-field">
                <span>Ödəniş növü</span>
                <FormSelect
                  name="paymentKind"
                  value={paymentKind}
                  onValueChange={(kind) => {
                    setPaymentKind(kind);
                    setPaymentAmountError("");
                    if (kind === AVANS_PAYMENT_KIND) setPaymentAmount(AVANS_DEFAULT_AMOUNT);
                  }}
                  options={student.advanceRefund
                    ? studentPaymentKindOptions.filter((option) => option.value !== AVANS_PAYMENT_KIND)
                    : studentPaymentKindOptions}
                />
              </label>
              <label className={`form-field${paymentAmountError ? " has-error" : ""}`}>
                <span>Məbləğ (AZN)</span>
                <Input
                  name="amount"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={paymentAmount}
                  aria-invalid={Boolean(paymentAmountError)}
                  onChange={(event) => {
                    setPaymentAmount(event.target.value);
                    setPaymentAmountError("");
                  }}
                  required
                />
                {paymentAmountError ? (
                  <small className="form-field-error" role="alert">
                    {paymentAmountError}
                  </small>
                ) : null}
              </label>
            </div>

            <div className="field-grid">
              <label className="form-field">
                <span>Ödəniş metodu</span>
                <FormSelect
                  name="method"
                  defaultValue="CASH"
                  options={studentPaymentMethodOptions}
                />
              </label>
              <label className="form-field">
                <span>Ödəniş tarixi</span>
                <DatePicker
                  name="paidDate"
                  value={paymentDate}
                  onValueChange={setPaymentDate}
                  maxValue={currentBakuDateValue()}
                  allowClear={false}
                  popoverPlacement="floating"
                  required
                />
              </label>
            </div>

            <label className="form-field">
              <span>Aid olduğu ay</span>
              <MonthPicker
                name="billingMonth"
                value={paymentMonth}
                onValueChange={setPaymentMonth}
                allowClear={false}
                required
              />
            </label>

            <label className="form-field">
              <span>Qeyd</span>
              <Input
                name="note"
                maxLength={240}
                placeholder="Məsələn: iyun ayı ödənişi"
              />
            </label>

            {student.advanceRefund && paymentKind !== AVANS_PAYMENT_KIND ? (
              <label className="contract-confirm-field">
                <Checkbox name="contractConfirmed" required />
                <span>Müqavilə imzalanıb</span>
              </label>
            ) : null}

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Ləğv et
                </Button>
              </DialogClose>
              <Button type="submit">
                <Banknote data-icon="inline-start" />
                Ödənişi təsdiqlə
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Student Dialog */}
      <Dialog open={editOpen} onOpenChange={(value) => {
        if (profileBusy) return;
        if (value) {
          setEditProgramId(student.detail.programId);
          setEditMonthlyFee(student.detail.monthlyFee);
          setEditLifecycleStatus(student.lifecycleStatusValue);
        }
        setEditOpen(value);
      }}>
        <DialogTrigger asChild>
          <Button className="student-action-edit" type="button" disabled={!permissions.canUpdateStudent}>
            <Edit data-icon="inline-start" />
            Redaktə et
          </Button>
        </DialogTrigger>
        <DialogContent className="student-create-dialog student-edit-dialog student-profile-edit-dialog">
          <DialogHeader>
            <DialogTitle>Tələbəni redaktə et</DialogTitle>
            <DialogDescription>
              Şəxsi məlumatlar slotdan və paket statusundan asılı olmadan redaktə edilir. Tamamlanmış paketi dəyişmək əvəzinə yeni paket əlavə edin.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (profileBusy) return;
              setProfileBusy(true);
              const formData = new FormData(e.currentTarget);
              try {
                unwrapActionResult(await updateStudentProfileAction(formData));
                notifySuccess("Məlumatlar yadda saxlanıldı", "Tələbənin profil və tədris məlumatları yeniləndi.");
                setEditOpen(false);
                router.refresh();
              } catch (error) {
                notifyCaughtError(error, "Tələbə profili yenilənmədi.");
              } finally {
                setProfileBusy(false);
              }
            }}
            className="student-create-form student-profile-edit-form"
          >
            <input name="studentId" type="hidden" value={student.id} />

            <input name="editScope" type="hidden" value={editingEnrollment ? "WITH_ENROLLMENT" : "PROFILE_ONLY"} />

            <section className="student-create-section">
              <div className="student-detail-section-title">
                <UserRound />
                <span>Şəxsi məlumatlar</span>
              </div>
              <div className="student-create-grid student-create-grid-personal">
                <label className="form-field">
                  <span>ART kodu</span>
                  <Input value={student.code} readOnly aria-label="Dəyişdirilməyən ART kodu" />
                </label>
                <label className="form-field">
                  <span>Ad və soyad</span>
                  <Input name="fullName" defaultValue={student.name} minLength={2} maxLength={120} required />
                </label>
                <label className="form-field">
                  <span>Telefon</span>
                  <Input name="phone" type="tel" defaultValue={student.phone} minLength={6} required />
                </label>
                <label className="form-field">
                  <span>E-poçt</span>
                  <Input name="email" type="email" defaultValue={student.detail.email} maxLength={320} />
                </label>
                <label className="form-field">
                  <span>Mənbə</span>
                  <FormSelect
                    name="source"
                    defaultValue={student.detail.source}
                    emptyLabel="Mənbə seçilməyib"
                    options={buildCrmSourceSelectOptions(sourceOptions)}
                    searchable
                    searchPlaceholder="Mənbə axtar..."
                    catalogKey="CRM_SOURCE"
                    createLabel="Yeni mənbə əlavə et"
                  />
                </label>
                <label className="form-field">
                  <span>Təhsil səviyyəsi</span>
                  <FormSelect
                    name="educationLevel"
                    defaultValue={student.detail.educationLevel}
                    emptyLabel="Təhsil səviyyəsi seçilməyib"
                    options={selectableEducationLevels}
                    searchable
                    catalogKey="STUDENT_EDUCATION_LEVEL"
                    createLabel="Yeni təhsil səviyyəsi əlavə et"
                  />
                </label>
              </div>
            </section>

            {editingEnrollment ? (
            <section className="student-create-section">
              <div className="student-detail-section-title">
                <GraduationCap />
                <span>Cari paket və ödəniş planı</span>
              </div>
              <div className="student-create-grid">
                <label className="form-field">
                  <span>Proqram</span>
                  <FormSelect
                    name="programId"
                    value={editProgramId}
                    onValueChange={(value) => {
                      setEditProgramId(value);
                      const program = editOptions.programs.find((item) => item.id === value);
                      if (program) setEditMonthlyFee(program.monthlyFee);
                    }}
                    emptyLabel="Proqram seçin"
                    options={editOptions.programs.map((program) => ({ value: program.id, label: program.name }))}
                    searchable
                    searchPlaceholder="Proqram axtar..."
                    required
                  />
                </label>
                <label className="form-field">
                  <span>Müəllim</span>
                  <FormSelect
                    name="teacherId"
                    defaultValue={student.detail.teacherId}
                    emptyLabel="Müəllim seçilməyib"
                    options={editOptions.teachers.map((teacher) => ({ value: teacher.id, label: teacher.fullName }))}
                    searchable
                    searchPlaceholder="Müəllim axtar..."
                  />
                </label>
                <label className="form-field">
                  <span>Cari paket üzrə ilk dərs</span>
                  <DatePicker name="firstLessonDate" defaultValue={student.detail.firstLessonDate} />
                </label>
                <label className="form-field">
                  <span>Status</span>
                  {permissions.canChangeStatus && !student.freezeReserved ? (
                    <>
                      <input name="lifecycleStatus" type="hidden" value={editLifecycleStatus} />
                      <FormSelect
                        name="lifecycleStatusPicker"
                        value={editLifecycleStatus}
                        onOpenChange={(open) => {
                          lifecycleStatusOpen.current = open;
                        }}
                        onValueChange={(value) => {
                          if (lifecycleStatusOpen.current) setEditLifecycleStatus(value);
                        }}
                        options={studentStatusOptions}
                      />
                    </>
                  ) : (
                    <>
                      <input name="lifecycleStatus" type="hidden" value={student.lifecycleStatusValue} />
                      <div className="student-readonly-status"><span /><strong>{student.freezeReserved ? "Yer rezervdir — dəyişmək üçün “Status dəyiş” bölməsini açın" : "Status dəyişmə icazəsi yoxdur"}</strong></div>
                    </>
                  )}
                </label>
                <label className="form-field">
                  <span>Status tarixi (status dəyişərsə)</span>
                  {permissions.canChangeStatus ? (
                    <DatePicker
                      name="statusEffectiveDate"
                      defaultValue={student.detail.paymentDefaultDate}
                    />
                  ) : (
                    <Input
                      name="statusEffectiveDate"
                      defaultValue={student.detail.paymentDefaultDate}
                      readOnly
                    />
                  )}
                </label>
                <label className="form-field">
                  <span>Güzəşt növü</span>
                  <FormSelect
                    name="discountType"
                    defaultValue={student.detail.discountType}
                    emptyLabel="Güzəşt yoxdur"
                    options={editOptions.discountTypes}
                    searchable
                    searchPlaceholder="Güzəşt növü axtar..."
                    catalogKey="STUDENT_DISCOUNT_TYPE"
                    createLabel="Yeni güzəşt növü əlavə et"
                  />
                </label>
                <label className="form-field">
                  <span>Aylıq məbləğ</span>
                  <Input
                    name="monthlyFee"
                    value={editMonthlyFee}
                    onChange={(event) => setEditMonthlyFee(event.target.value)}
                    inputMode="decimal"
                    required
                  />
                </label>
                <label className="form-field">
                  <span>Aylıq dərs sayı</span>
                  <Input
                    name="lessonsPerMonth"
                    defaultValue={student.detail.lessonsPerMonth}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={120}
                  />
                </label>
              </div>
              <details className="student-billing-change">
                <summary>
                  <span>Qiymət və dərs dəyişikliyi</span>
                  <ChevronDown size={16} aria-hidden="true" />
                </summary>
                <div className="field-grid">
                  <label className="form-field">
                    <span>Qiymət dəyişikliyinin tətbiqi</span>
                    <FormSelect
                      name="billingChangeMode"
                      defaultValue="FROM_MONTH"
                      options={[
                        { value: "FROM_MONTH", label: "Seçilən aydan etibarən" },
                        { value: "ONLY_MONTH", label: "Yalnız seçilən ay üçün" },
                      ]}
                    />
                  </label>
                  <label className="form-field">
                    <span>Qüvvəyə minən ay</span>
                    <MonthPicker
                      name="billingEffectiveMonth"
                      min={student.detail.earliestUpgradeMonth ?? undefined}
                      defaultValue={
                        student.detail.earliestUpgradeMonth
                        && student.detail.paymentDefaultMonth < student.detail.earliestUpgradeMonth
                          ? student.detail.earliestUpgradeMonth
                          : student.detail.paymentDefaultMonth
                      }
                      allowClear={false}
                    />
                  </label>
                  <label className="form-field">
                    <span>Qiymət/dərs dəyişikliyi səbəbi</span>
                    <Input name="billingChangeReason" maxLength={240} />
                  </label>
                  {permissions.canChangeStatus ? (
                    <label className="form-field">
                      <span>Status dəyişiklik qeydi</span>
                      <Input name="statusNote" maxLength={240} />
                    </label>
                  ) : null}
                </div>
              </details>
            </section>
            ) : (
              <section className="student-create-section">
                <div className="student-detail-section-title">
                  <GraduationCap />
                  <span>Cari paket və ödəniş planı</span>
                </div>
                <Button type="button" variant="outline" onClick={() => { setEditOpen(false); setPackageOpen(true); }}>Yeni paket əlavə et</Button>
              </section>
            )}

            <section className="student-create-section">
              <div className="student-detail-section-title">
                <BookOpen />
                <span>Qeydiyyat və məsul şəxslər</span>
              </div>
              <div className="student-create-grid">
                <label className="form-field">
                  <span>Məsul şəxs</span>
                  {permissions.canAssignStudentManager ? (
                    <FormSelect
                      name="managerId"
                      defaultValue={student.detail.managerId}
                      emptyLabel="Məsul şəxs seçilməyib"
                      options={editOptions.managers.map((manager) => ({ value: manager.id, label: manager.fullName }))}
                      searchable
                      searchPlaceholder="Məsul şəxs axtar..."
                    />
                  ) : (
                    <>
                      <input name="managerId" type="hidden" value={student.detail.managerId} />
                      <Input value={student.detail.manager} readOnly aria-label="Məsul şəxs" />
                    </>
                  )}
                </label>
                <label className="form-field">
                  <span>Kampaniya</span>
                  <FormSelect
                    name="campaignId"
                    defaultValue={student.detail.campaignId}
                    emptyLabel="Kampaniya seçilməyib"
                    options={editOptions.campaigns.map((campaign) => ({ value: campaign.id, label: campaign.name }))}
                    searchable
                    searchPlaceholder="Kampaniya axtar..."
                  />
                </label>
                <label className="form-field">
                  <span>Qeydiyyat tarixi</span>
                  <DatePicker
                    name="registeredDate"
                    defaultValue={student.detail.registeredDate}
                    allowClear={false}
                    popoverPlacement="floating"
                    required
                  />
                </label>
                <label className="form-field">
                  <span>Billing anchor (qorunan)</span>
                  <Input value={student.detail.billingAnchorDate || "Təsdiqlənməyib"} readOnly aria-readonly="true" />
                </label>
              </div>
            </section>

            <section className="student-create-section">
              <label className="form-field student-create-notes">
                <span>Profil qeydi</span>
                <Input
                  name="notes"
                  defaultValue={student.detail.notes === "Qeyd yoxdur" ? "" : student.detail.notes}
                  maxLength={500}
                />
              </label>
            </section>

            <div className="premium-edit-notice">
              <span className="sparkle">✨</span>
              <span>{editingEnrollment ? "Qiymət və ya dərs sayı dəyişirsə tətbiq ayını və səbəbi seçin. Tamamlanmış paketi başqa proqramla əvəz etməyin; yeni paket əlavə edin." : "Bu rejimdə yalnız şəxsi məlumatlar yenilənir. Status, dərs tarixi, paket, ödəniş və borc dəyişmir."}</span>
            </div>

            <DialogFooter>
              <Button
                className="student-edit-delete-button"
                type="button"
                variant="ghost"
                disabled={!permissions.canDeleteStudent}
                onClick={() => {
                  setEditOpen(false);
                  setDeleteOpen(true);
                }}
              >
                <Trash2 data-icon="inline-start" />
                Tələbəni sil
              </Button>
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Ləğv et
                </Button>
              </DialogClose>
              <Button type="submit" disabled={profileBusy}>
                {profileBusy ? "Saxlanılır…" : "Yadda saxla"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="student-payment-dialog student-delete-dialog">
          <DialogHeader>
            <DialogTitle>Tələbəni tam silmək istəyirsiniz?</DialogTitle>
            <DialogDescription>
              <strong>{student.name}</strong> ({student.code}) profilinə bağlı ödənişlər,
              fakturalar, qeydiyyatlar, dərslər, slot və workshop məlumatları tam silinəcək.
              Bu əməliyyatı geri qaytarmaq mümkün deyil.
            </DialogDescription>
          </DialogHeader>

          <form action={deleteStudent}>
            <input name="studentId" type="hidden" value={student.id} />
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Ləğv et
                </Button>
              </DialogClose>
              <Button type="submit" variant="destructive">
                <Trash2 data-icon="inline-start" />
                Bəli, tam sil
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
