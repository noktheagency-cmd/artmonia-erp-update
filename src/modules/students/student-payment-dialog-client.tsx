"use client";

import { useMemo, useState } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { Banknote, CalendarDays, CreditCard, ReceiptText, UserRound } from "lucide-react";
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
import { studentPaymentMethodOptions } from "@/modules/students/payment-method";
import { studentPaymentScheduleTypeOptions } from "@/modules/students/payment-schedule-type";
import type { StudentListData } from "@/modules/students/queries";
import { unwrapActionResult } from "@/lib/action-result";
import { notifyCaughtError, notifySuccess } from "@/lib/app-notifications";
import { currentBakuDateValue } from "@/modules/students/payment-date-policy";
import { confirmPaymentMonthMismatch } from "@/modules/students/payment-date-policy-client";

type StudentRow = StudentListData["students"][number];

export function StudentPaymentDialogClient({
  students,
  canRecordPayment,
  returnTo,
  recordPaymentAction,
}: {
  students: StudentRow[];
  canRecordPayment: boolean;
  returnTo: string;
  recordPaymentAction: (formData: FormData) => unknown | Promise<unknown>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const paymentEligibleStudents = useMemo(
    () => students.filter((student) => student.lifecycleStatusValue !== "COMPLETED"),
    [students],
  );
  const [studentId, setStudentId] = useState(paymentEligibleStudents[0]?.id ?? "");
  const effectiveStudentId = paymentEligibleStudents.some((student) => student.id === studentId)
    ? studentId
    : paymentEligibleStudents[0]?.id ?? "";
  const selectedStudent = useMemo(
    () => paymentEligibleStudents.find((student) => student.id === effectiveStudentId),
    [effectiveStudentId, paymentEligibleStudents]
  );
  const studentOptions = useMemo(
    () =>
      paymentEligibleStudents.map((student) => ({
        value: student.id,
        label: `${student.name} · ${student.code}`,
        searchText: `${student.name} ${student.code} ${student.phone}`,
      })),
    [paymentEligibleStudents]
  );

  async function recordPayment(formData: FormData) {
    if (!confirmPaymentMonthMismatch(formData)) return;
    try {
      const result = unwrapActionResult(await recordPaymentAction(formData)) as {
        redirectTo: string;
      };
      setOpen(false);
      notifySuccess("Ödəniş qəbul edildi", "Tələbənin balansı yeniləndi.");
      router.replace(result.redirectTo as Route, { scroll: false });
      router.refresh();
    } catch (error) {
      notifyCaughtError(error, "Ödəniş qeydə alınmadı.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          className="students-payment-action"
          disabled={!canRecordPayment || paymentEligibleStudents.length === 0}
        >
          <Banknote data-icon="inline-start" />
          Ödəniş qəbul et
        </Button>
      </DialogTrigger>
      <DialogContent className="student-payment-dialog student-payment-quick-dialog">
        <DialogHeader>
          <DialogTitle>Ödəniş qəbul et</DialogTitle>
          <DialogDescription>
            Tələbəni seçin, ödəniş detalları əlavə edin və balansı avtomatik yeniləyin.
          </DialogDescription>
        </DialogHeader>

        {selectedStudent ? (
          <form
            action={recordPayment}
            className="student-payment-form"
          >
            <input name="studentId" type="hidden" value={selectedStudent.id} />
            <input name="returnTo" type="hidden" value={returnTo} />

            <label className="form-field">
              <span>Tələbə</span>
              <FormSelect
                name="studentPicker"
                value={effectiveStudentId}
                onValueChange={setStudentId}
                options={studentOptions}
                searchable
                searchPlaceholder="Ad, kod və ya telefonla axtar..."
                icon={UserRound}
                required
              />
            </label>

            <div className="student-payment-summary" aria-label="Seçilmiş tələbə məlumatları">
              <span><UserRound />{selectedStudent.code}</span>
              <span><ReceiptText />{selectedStudent.program}</span>
              <strong>
                <CreditCard />
                {selectedStudent.hasDueDebt
                  ? `Cari borc: ${selectedStudent.dueDebt}`
                  : selectedStudent.hasFutureReceivable
                    ? `Gələcək: ${selectedStudent.futureReceivable}`
                    : "Borc yoxdur"}
              </strong>
            </div>

            <PaymentScheduleFields
              key={[
                selectedStudent.id,
                selectedStudent.detail.paymentDefaultAmount,
                selectedStudent.detail.paymentDefaultDate,
                selectedStudent.detail.paymentDefaultMonth,
              ].join(":")}
              student={selectedStudent}
            />
            <div className="field-grid">
              <label className="form-field">
                <span>Metod</span>
                <FormSelect name="method" defaultValue="CASH" options={studentPaymentMethodOptions} />
              </label>
              <label className="form-field">
                <span>Ödəniş növü</span>
                <FormSelect
                  name="scheduleType"
                  defaultValue="MONTHLY"
                  options={studentPaymentScheduleTypeOptions}
                />
              </label>
            </div>

            <label className="form-field">
              <span>Qeyd</span>
              <Input name="note" maxLength={240} placeholder="Məsələn: iyul ayı ödənişi" />
            </label>

            <p className="payment-policy-note">
              <CalendarDays /> Birdəfəlik ödənişdə növbəti aylıq ödəniş tarixi yaradılmır.
            </p>

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">Ləğv et</Button>
              </DialogClose>
              <Button type="submit" disabled={!canRecordPayment}>
                <Banknote data-icon="inline-start" />
                Ödənişi qəbul et
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function PaymentScheduleFields({ student }: { student: StudentRow }) {
  const [amount, setAmount] = useState(student.detail.paymentDefaultAmount);
  const [paidDate, setPaidDate] = useState(student.detail.paymentDefaultDate);
  const [billingMonth, setBillingMonth] = useState(student.detail.paymentDefaultMonth);

  return (
    <div className="student-payment-schedule-grid">
      <label className="form-field">
        <span>Məbləğ</span>
        <Input
          name="amount"
          inputMode="decimal"
          placeholder="0.00"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          required
        />
      </label>
      <label className="form-field">
        <span>Aid olduğu ay</span>
        <Input
          name="billingMonth"
          type="month"
          value={billingMonth}
          onChange={(event) => setBillingMonth(event.target.value)}
          required
        />
      </label>
      <label className="form-field">
        <span>Ödəniş tarixi</span>
        <DatePicker
          name="paidDate"
          value={paidDate}
          onValueChange={setPaidDate}
          maxValue={currentBakuDateValue()}
          allowClear={false}
          popoverPlacement="floating"
          required
        />
      </label>
    </div>
  );
}
