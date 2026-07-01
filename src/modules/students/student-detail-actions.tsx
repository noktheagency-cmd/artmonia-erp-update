"use client";

import { useState } from "react";
import { Banknote, Edit, RefreshCcw } from "lucide-react";
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
    paymentDefaultMonth: string;
  };
}

interface Permissions {
  canCreateStudent: boolean;
  canConvertLead: boolean;
  canRecordPayment: boolean;
  canChangeStatus: boolean;
}

export function StudentDetailActions({
  student,
  permissions,
  recordPaymentAction,
  updateStudentStatusAction,
}: {
  student: StudentDetail;
  permissions: Permissions;
  recordPaymentAction: (formData: FormData) => void | Promise<void>;
  updateStudentStatusAction: (formData: FormData) => void | Promise<void>;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);

  return (
    <div className="student-actions-row">
      <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
        <DialogTrigger asChild>
          <button className="ui-button ui-button-outline" type="button" disabled={!permissions.canChangeStatus}>
            <RefreshCcw size={16} />
            Status dəyiş
          </button>
        </DialogTrigger>
        <DialogContent className="student-payment-dialog">
          <DialogHeader>
            <DialogTitle>Status dəyiş</DialogTitle>
            <DialogDescription>
              Aktiv ediləndə ilk dərs və növbəti ödəniş tarixi seçilən günə bağlanır.
            </DialogDescription>
          </DialogHeader>

          <form action={updateStudentStatusAction} className="student-payment-form">
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
      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogTrigger asChild>
          <button className="ui-button ui-button-secondary" type="button" disabled={!permissions.canRecordPayment}>
            <Banknote size={16} />
            Ödəniş qəbul et
          </button>
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
              await recordPaymentAction(formData);
              setPaymentOpen(false);
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
                  defaultValue={student.detail.paymentDefaultAmount}
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
                  defaultValue={student.detail.paymentDefaultDate}
                  allowClear={false}
                  required
                />
              </label>
              <label className="form-field">
                <span>Ödəniş ayı</span>
                <Input
                  name="paymentMonth"
                  type="month"
                  defaultValue={student.detail.paymentDefaultMonth}
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
          <button className="dark-action" type="button" disabled={!permissions.canCreateStudent}>
            <Edit size={16} />
            Redaktə et
          </button>
        </DialogTrigger>
        <DialogContent className="student-edit-dialog">
          <DialogHeader>
            <DialogTitle>Tələbəni redaktə et</DialogTitle>
            <DialogDescription>
              Tələbə profil məlumatlarını yeniləyin.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              alert("Məlumatlar uğurla qeyd olundu!");
              setEditOpen(false);
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
    </div>
  );
}
