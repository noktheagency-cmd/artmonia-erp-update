"use client";

import { useState } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { Banknote, Edit, RefreshCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
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
import { notifyCaughtError, notifySuccess } from "@/lib/app-notifications";
import { unwrapActionResult } from "@/lib/action-result";
import { StudentReminderDialog } from "@/modules/students/student-reminders-client";

const studentStatusOptions = [
  { value: "GROUP_WAITING", label: "Qrup gözləyir" },
  { value: "ACTIVE", label: "Aktiv" },
  { value: "DEBT", label: "Borclu" },
  { value: "FROZEN", label: "Dondurulub" },
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
  detail: {
    notes: string;
    paymentDefaultAmount: string;
    paymentDefaultDate: string;
    reminderDefaultDate: string;
  };
}

interface Permissions {
  canCreateStudent: boolean;
  canUpdateStudent: boolean;
  canConvertLead: boolean;
  canRecordPayment: boolean;
  canChangeStatus: boolean;
  canDeleteStudent: boolean;
  canManageReminders: boolean;
}

export function StudentDetailActions({
  student,
  permissions,
  recordPaymentAction,
  updateStudentProfileAction,
  updateStudentStatusAction,
  deleteStudentAction,
  createStudentReminderAction,
}: {
  student: StudentDetail;
  permissions: Permissions;
  recordPaymentAction: (formData: FormData) => unknown | Promise<unknown>;
  updateStudentProfileAction: (formData: FormData) => unknown | Promise<unknown>;
  updateStudentStatusAction: (formData: FormData) => unknown | Promise<unknown>;
  deleteStudentAction: (formData: FormData) => unknown | Promise<unknown>;
  createStudentReminderAction: (formData: FormData) => unknown | Promise<unknown>;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState(student.detail.paymentDefaultAmount);
  const [paymentDate, setPaymentDate] = useState(student.detail.paymentDefaultDate);

  async function updateStatus(formData: FormData) {
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

  return (
    <div className="student-actions-row">
      <StudentReminderDialog
        studentId={student.id}
        studentName={student.name}
        defaultDate={student.detail.reminderDefaultDate}
        canManage={permissions.canManageReminders}
        action={createStudentReminderAction}
      />

      <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
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
              Aktiv ediləndə ilk dərs və növbəti ödəniş tarixi seçilən günə bağlanır.
            </DialogDescription>
          </DialogHeader>

          <form action={updateStatus} className="student-payment-form">
            <input name="studentId" type="hidden" value={student.id} />
            <input name="returnTo" type="hidden" value={`/students/${student.id}`} />

            <div className="field-grid">
              <label className="form-field">
                <span>Status</span>
                <FormSelect
                  name="lifecycleStatus"
                  defaultValue={student.lifecycleStatusValue}
                  options={studentStatusOptions}
                />
              </label>
              <label className="form-field">
                <span>İlk dərs / status tarixi</span>
                <DatePicker
                  name="firstLessonDate"
                  defaultValue={student.detail.paymentDefaultDate}
                />
              </label>
            </div>

            <label className="form-field">
              <span>Qeyd</span>
              <Input
                name="note"
                maxLength={240}
                placeholder="Məsələn: qrup başladı, imtina etdi"
              />
            </label>

            <p className="payment-policy-note">
              İmtina zamanı qəbul edilən ödəniş geri qaytarılmır.
            </p>

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Ləğv et
                </Button>
              </DialogClose>
              <Button type="submit">
                <RefreshCcw data-icon="inline-start" />
                Statusu təsdiqlə
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Record Payment Dialog */}
      <Dialog
        open={paymentOpen}
        onOpenChange={(nextOpen) => {
          setPaymentOpen(nextOpen);
          if (nextOpen) {
            setPaymentAmount(student.detail.paymentDefaultAmount);
            setPaymentDate(student.detail.paymentDefaultDate);
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
            <DialogDescription>
              {student.name} üçün yeni ödəniş əməliyyatı qeyd edin.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
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

            <div className="field-grid">
              <label className="form-field">
                <span>Məbləğ (AZN)</span>
                <Input
                  name="amount"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={paymentAmount}
                  onChange={(event) => setPaymentAmount(event.target.value)}
                  required
                />
              </label>
              <label className="form-field">
                <span>Ödəniş metodu</span>
                <FormSelect
                  name="method"
                  defaultValue="CASH"
                  options={studentPaymentMethodOptions}
                />
              </label>
            </div>

            <div className="field-grid">
              <label className="form-field">
                <span>Ödəniş tarixi</span>
                <DatePicker
                  name="paidDate"
                  value={paymentDate}
                  onValueChange={setPaymentDate}
                  allowClear={false}
                  popoverPlacement="floating"
                  required
                />
              </label>
            </div>

            <label className="form-field">
              <span>Qeyd</span>
              <Input
                name="note"
                maxLength={240}
                placeholder="Məsələn: iyun ayı ödənişi"
              />
            </label>

            <p className="payment-policy-note">
              İmtina zamanı qəbul edilən ödəniş geri qaytarılmır.
            </p>

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
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogTrigger asChild>
          <Button className="student-action-edit" type="button" disabled={!permissions.canUpdateStudent}>
            <Edit data-icon="inline-start" />
            Redaktə et
          </Button>
        </DialogTrigger>
        <DialogContent className="student-edit-dialog">
          <DialogHeader>
            <DialogTitle>Tələbəni redaktə et</DialogTitle>
            <DialogDescription>
              Tələbə profil məlumatlarını yeniləyin.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              formData.set("studentId", student.id);
              try {
                unwrapActionResult(await updateStudentProfileAction(formData));
                notifySuccess("Məlumatlar yadda saxlanıldı", "Tələbə profili uğurla yeniləndi.");
                setEditOpen(false);
                router.refresh();
              } catch (error) {
                notifyCaughtError(error, "Tələbə profili yenilənmədi.");
              }
            }}
            className="student-create-form"
          >
            <div className="field-grid">
              <label className="form-field">
                <span>Ad və soyad</span>
                <Input
                  name="fullName"
                  defaultValue={student.name}
                  required
                />
              </label>
              <label className="form-field">
                <span>Telefon</span>
                <Input
                  name="phone"
                  defaultValue={student.phone}
                  required
                />
              </label>
            </div>

            <label className="form-field">
              <span>Qeyd</span>
              <Input
                name="notes"
                defaultValue={student.detail.notes === "Qeyd yoxdur" ? "" : student.detail.notes}
                maxLength={500}
              />
            </label>

            <div className="premium-edit-notice">
              <span className="sparkle">✨</span>
              <span>ART ERP premium profil redaktəsi. Bu dəyişikliklər tələbənin cədvəl və maliyyə tarixçəsinə təsir edə bilər.</span>
            </div>

            <DialogFooter>
              <Button
                className="student-edit-delete-button"
                type="button"
                variant="ghost"
                disabled={!permissions.canDeleteStudent}
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 data-icon="inline-start" />
                Tələbəni sil
              </Button>
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Ləğv et
                </Button>
              </DialogClose>
              <Button type="submit">
                Yadda saxla
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
              fakturalar, qeydiyyatlar, dərslər, qrup və workshop məlumatları tam silinəcək.
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
