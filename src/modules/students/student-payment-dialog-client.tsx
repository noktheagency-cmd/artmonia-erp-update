"use client";

import { useMemo, useState } from "react";
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
import type { StudentListData } from "@/modules/students/queries";

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
  recordPaymentAction: (formData: FormData) => void | Promise<void>;
}) {
  const [studentId, setStudentId] = useState(students[0]?.id ?? "");
  const selectedStudent = useMemo(
    () => students.find((student) => student.id === studentId) ?? students[0],
    [studentId, students]
  );
  const studentOptions = useMemo(
    () =>
      students.map((student) => ({
        value: student.id,
        label: `${student.name} · ${student.code}`,
        searchText: `${student.name} ${student.code} ${student.phone}`,
      })),
    [students]
  );

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          className="students-payment-action"
          disabled={!canRecordPayment || students.length === 0}
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
          <form action={recordPaymentAction} className="student-payment-form" key={selectedStudent.id}>
            <input name="studentId" type="hidden" value={selectedStudent.id} />
            <input name="returnTo" type="hidden" value={returnTo} />

            <label className="form-field">
              <span>Tələbə</span>
              <FormSelect
                name="studentPicker"
                value={studentId}
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
              <strong><CreditCard />{selectedStudent.balance}</strong>
            </div>

            <PaymentScheduleFields student={selectedStudent} />
            <div className="field-grid">
              <label className="form-field">
                <span>Metod</span>
                <FormSelect name="method" defaultValue="CASH" options={studentPaymentMethodOptions} />
              </label>
            </div>

            <label className="form-field">
              <span>Qeyd</span>
              <Input name="note" maxLength={240} placeholder="Məsələn: iyul ayı ödənişi" />
            </label>

            <p className="payment-policy-note">
              <CalendarDays /> Ödəniş ən köhnə açıq fakturalara avtomatik bölüşdürülür.
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
  const [nextPaymentDate, setNextPaymentDate] = useState(() => addOneMonth(paidDate));

  function updateAutomaticDate(nextAmount: string, nextPaidDate: string) {
    if (toAmount(nextAmount) >= toAmount(student.detail.monthlyFee)) {
      setNextPaymentDate(addOneMonth(nextPaidDate));
    }
  }

  return (
    <div className="student-payment-schedule-grid">
      <label className="form-field">
        <span>Məbləğ</span>
        <Input
          name="amount"
          inputMode="decimal"
          placeholder="0.00"
          value={amount}
          onChange={(event) => {
            setAmount(event.target.value);
            updateAutomaticDate(event.target.value, paidDate);
          }}
          required
        />
      </label>
      <label className="form-field">
        <span>Ödəniş tarixi</span>
        <DatePicker
          name="paidDate"
          value={paidDate}
          onValueChange={(value) => {
            setPaidDate(value);
            updateAutomaticDate(amount, value);
          }}
          allowClear={false}
          popoverPlacement="floating"
          required
        />
      </label>
      <label className="form-field">
        <span>Növbəti ödəniş tarixi</span>
        <DatePicker
          name="nextPaymentDate"
          value={nextPaymentDate}
          onValueChange={setNextPaymentDate}
          allowClear={false}
          popoverPlacement="floating"
          required
        />
      </label>
    </div>
  );
}

function toAmount(value: string) {
  return Number(value.replace(",", ".")) || 0;
}

function addOneMonth(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 10);
}
