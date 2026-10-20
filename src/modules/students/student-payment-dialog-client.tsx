"use client";

import { useMemo, useState } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { Banknote, CreditCard, ReceiptText, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { currentBakuMonthValue, MonthPicker, normalizeMonthValue } from "@/components/ui/month-picker";
import { Input } from "@/components/ui/input";
import { FormSelect } from "@/components/ui/select";
import { studentPaymentMethodOptions } from "@/modules/students/payment-method";
import {
  AVANS_DEFAULT_AMOUNT,
  AVANS_PAYMENT_KIND,
  storedScheduleTypeForPaymentKind,
  studentPaymentKindOptions,
} from "@/modules/students/payment-schedule-type";
import type { StudentListData } from "@/modules/students/queries";
import { unwrapActionResult } from "@/lib/action-result";
import { notifyCaughtError, notifySuccess } from "@/lib/app-notifications";
import { currentBakuDateValue } from "@/modules/students/payment-date-policy";
import { confirmPaymentMonthMismatch } from "@/modules/students/payment-date-policy-client";
import {
  ADMISSION_PAYMENT_MIN_MESSAGE,
  isAdmissionAmountBelowMinimum,
} from "@/modules/students/admission-payment-amount";
import { ReceiptFields } from "./receipt-fields";

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
  const [receiptPurpose, setReceiptPurpose] = useState("RENEWAL");
  const [paymentKind, setPaymentKind] = useState("MONTHLY");
  const [amount, setAmount] = useState("");
  const [amountError, setAmountError] = useState("");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const effectiveStudentId = paymentEligibleStudents.some((student) => student.id === studentId)
    ? studentId
    : paymentEligibleStudents[0]?.id ?? "";
  const selectedStudent = useMemo(
    () => paymentEligibleStudents.find((student) => student.id === effectiveStudentId),
    [effectiveStudentId, paymentEligibleStudents],
  );
  const studentOptions = useMemo(
    () =>
      paymentEligibleStudents.map((student) => ({
        value: student.id,
        label: `${student.name} · ${student.code}`,
        searchText: `${student.name} ${student.code} ${student.phone}`,
      })),
    [paymentEligibleStudents],
  );

  const settlingAdvance = selectedStudent?.paymentStatusCode === "ADVANCE_PAID"
    && paymentKind !== AVANS_PAYMENT_KIND;

  function syncAmountError(nextAmount: string, purpose: string) {
    setAmountError(
      isAdmissionAmountBelowMinimum(nextAmount, purpose) ? ADMISSION_PAYMENT_MIN_MESSAGE : "",
    );
  }

  function changePaymentKind(kind: string) {
    setPaymentKind(kind);
    if (kind === AVANS_PAYMENT_KIND) {
      setAmount(AVANS_DEFAULT_AMOUNT);
      setReceiptPurpose("ADMISSION");
      syncAmountError(AVANS_DEFAULT_AMOUNT, "ADMISSION");
    } else if (selectedStudent?.paymentStatusCode === "ADVANCE_PAID") {
      setReceiptPurpose("INITIAL_BALANCE");
      syncAmountError(amount, "INITIAL_BALANCE");
    } else if (receiptPurpose === "ADMISSION") {
      setReceiptPurpose("RENEWAL");
      syncAmountError(amount, "RENEWAL");
    }
  }

  async function recordPayment(formData: FormData) {
    const nextAmount = String(formData.get("amount") ?? amount);
    const nextPurpose = String(formData.get("receiptPurpose") ?? receiptPurpose);
    if (isAdmissionAmountBelowMinimum(nextAmount, nextPurpose)) {
      setAmountError(ADMISSION_PAYMENT_MIN_MESSAGE);
      return;
    }
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
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          setPaymentKind("MONTHLY");
          setReceiptPurpose("RENEWAL");
          setAmountError("");
          setRequestId(crypto.randomUUID());
        }
      }}
    >
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
        </DialogHeader>

        {selectedStudent ? (
          <form action={recordPayment} className="student-payment-form">
            <input name="studentId" type="hidden" value={selectedStudent.id} />
            <input name="returnTo" type="hidden" value={returnTo} />
            <input name="idempotencyKey" type="hidden" value={requestId} />
            <input name="scheduleType" type="hidden" value={storedScheduleTypeForPaymentKind(paymentKind)} />
            {paymentKind === AVANS_PAYMENT_KIND ? (
              <>
                <input name="receiptPurpose" type="hidden" value="ADMISSION" />
                <input name="contractConfirmed" type="hidden" value="on" />
              </>
            ) : settlingAdvance ? (
              <input name="receiptPurpose" type="hidden" value="INITIAL_BALANCE" />
            ) : null}

            <label className="form-field">
              <span>Tələbə</span>
              <FormSelect
                name="studentPicker"
                value={effectiveStudentId}
                onValueChange={(id) => {
                  setStudentId(id);
                  const next = paymentEligibleStudents.find((student) => student.id === id);
                  if (next?.paymentStatusCode === "ADVANCE_PAID" && paymentKind === AVANS_PAYMENT_KIND) {
                    changePaymentKind("MONTHLY");
                  }
                }}
                options={studentOptions}
                searchable
                searchPlaceholder="Ad, kod və ya telefonla axtar..."
                icon={UserRound}
                required
              />
            </label>

            <div className="student-payment-summary" aria-label="Seçilmiş tələbə məlumatları">
              <span>
                <UserRound />
                {selectedStudent.code}
              </span>
              <span>
                <ReceiptText />
                {selectedStudent.program}
              </span>
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
                requestId,
                selectedStudent.id,
                selectedStudent.detail.paymentDefaultAmount,
                selectedStudent.detail.paymentDefaultDate,
                selectedStudent.detail.paymentDefaultMonth,
              ].join(":")}
              student={selectedStudent}
              amountError={amountError}
              receiptPurpose={paymentKind === AVANS_PAYMENT_KIND ? "ADMISSION" : receiptPurpose}
              paymentKind={paymentKind}
              onPaymentKindChange={changePaymentKind}
              hideAvans={selectedStudent.paymentStatusCode === "ADVANCE_PAID"}
              onAmountChange={(value) => {
                setAmount(value);
                syncAmountError(value, paymentKind === AVANS_PAYMENT_KIND ? "ADMISSION" : receiptPurpose);
              }}
            />
            <label className="form-field">
              <span>Metod</span>
              <FormSelect name="method" defaultValue="CASH" options={studentPaymentMethodOptions} />
            </label>

            <label className="form-field">
              <span>Qeyd</span>
              <Input name="note" maxLength={240} placeholder="Məsələn: iyul ayı ödənişi" />
            </label>

            {paymentKind === AVANS_PAYMENT_KIND || settlingAdvance ? null : (
              <ReceiptFields
                key={selectedStudent.id}
                studentId={selectedStudent.id}
                onPurposeChange={(purpose) => {
                  setReceiptPurpose(purpose);
                  syncAmountError(amount || selectedStudent.detail.paymentDefaultAmount, purpose);
                }}
              />
            )}
            {settlingAdvance ? (
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

function PaymentScheduleFields({
  student,
  amountError,
  receiptPurpose,
  paymentKind,
  onPaymentKindChange,
  onAmountChange,
  hideAvans = false,
}: {
  student: StudentRow;
  amountError: string;
  receiptPurpose: string;
  paymentKind: string;
  onPaymentKindChange: (value: string) => void;
  onAmountChange: (value: string) => void;
  hideAvans?: boolean;
}) {
  const [amount, setAmount] = useState(student.detail.paymentDefaultAmount);
  const [paidDate, setPaidDate] = useState(student.detail.paymentDefaultDate);
  const [billingMonth, setBillingMonth] = useState(
    () => normalizeMonthValue(student.detail.paymentDefaultMonth) || currentBakuMonthValue(),
  );
  const showError =
    amountError ||
    (isAdmissionAmountBelowMinimum(amount, receiptPurpose) ? ADMISSION_PAYMENT_MIN_MESSAGE : "");

  return (
    <>
      <div className="field-grid">
        <label className="form-field">
          <span>Ödəniş növü</span>
          <FormSelect
            name="paymentKind"
            value={paymentKind}
            onValueChange={(kind) => {
              if (kind === AVANS_PAYMENT_KIND) {
                setAmount(AVANS_DEFAULT_AMOUNT);
                onAmountChange(AVANS_DEFAULT_AMOUNT);
              }
              onPaymentKindChange(kind);
            }}
            options={hideAvans
              ? studentPaymentKindOptions.filter((option) => option.value !== AVANS_PAYMENT_KIND)
              : studentPaymentKindOptions}
          />
        </label>
        <label className={`form-field${showError ? " has-error" : ""}`}>
          <span>Məbləğ</span>
          <Input
            name="amount"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            aria-invalid={Boolean(showError)}
            aria-describedby={showError ? "payment-amount-error" : undefined}
            onChange={(event) => {
              const value = event.target.value;
              setAmount(value);
              onAmountChange(value);
            }}
            required
          />
          {showError ? (
            <small id="payment-amount-error" className="form-field-error" role="alert">
              {showError}
            </small>
          ) : null}
        </label>
      </div>
      <div className="field-grid">
        <label className="form-field">
          <span>Aid olduğu ay</span>
          <MonthPicker
            name="billingMonth"
            value={billingMonth}
            onValueChange={setBillingMonth}
            allowClear={false}
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
    </>
  );
}
