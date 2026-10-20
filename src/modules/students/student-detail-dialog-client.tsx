"use client";

import { useState } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import {
  Banknote,
  CalendarDays,
  Clock3,
  CreditCard,
  History,
  Phone,
  ReceiptText,
  UserRound,
} from "lucide-react";
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
import { MonthPicker } from "@/components/ui/month-picker";
import { Input } from "@/components/ui/input";
import { FormSelect } from "@/components/ui/select";
import { StatusChip } from "@/components/ui/status-chip";
import { studentPaymentMethodOptions } from "@/modules/students/payment-method";
import { studentPaymentScheduleTypeOptions } from "@/modules/students/payment-schedule-type";
import type { StudentListData } from "@/modules/students/queries";
import { unwrapActionResult } from "@/lib/action-result";
import { notifyCaughtError, notifySuccess } from "@/lib/app-notifications";
import {
  ADMISSION_PAYMENT_MIN_MESSAGE,
  isAdmissionAmountBelowMinimum,
} from "@/modules/students/admission-payment-amount";
import { ReceiptFields } from "./receipt-fields";
import { CourseSalesPanel } from "./course-sales-panel";

type StudentRow = StudentListData["students"][number];

export function StudentDetailDialogClient({
  student,
  canRecordPayment,
  returnTo,
  recordPaymentAction,
}: {
  student: StudentRow;
  canRecordPayment: boolean;
  returnTo: string;
  recordPaymentAction: (formData: FormData) => unknown | Promise<unknown>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [receiptPurpose, setReceiptPurpose] = useState("RENEWAL");
  const [paymentAmount, setPaymentAmount] = useState(student.detail.paymentDefaultAmount);
  const [amountError, setAmountError] = useState("");
  const paymentClosed = student.lifecycleStatusValue === "COMPLETED";
  const amountMessage =
    amountError ||
    (isAdmissionAmountBelowMinimum(paymentAmount, receiptPurpose)
      ? ADMISSION_PAYMENT_MIN_MESSAGE
      : "");

  async function recordPayment(formData: FormData) {
    const nextAmount = String(formData.get("amount") ?? paymentAmount);
    const nextPurpose = String(formData.get("receiptPurpose") ?? receiptPurpose);
    if (isAdmissionAmountBelowMinimum(nextAmount, nextPurpose)) {
      setAmountError(ADMISSION_PAYMENT_MIN_MESSAGE);
      return;
    }
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
          setPaymentAmount(student.detail.paymentDefaultAmount);
          setReceiptPurpose("RENEWAL");
          setAmountError("");
        }
      }}
    >
      <DialogTrigger asChild>
        <button className="student-open-button" type="button">
          <strong>{student.name}</strong>
          <span>
            {student.code} - {student.phone}
          </span>
        </button>
      </DialogTrigger>
      <DialogContent className="student-detail-dialog">
        <DialogHeader>
          <DialogTitle>{student.name}</DialogTitle>
          <DialogDescription>
            {student.code} tələbə profili, balans və ödəniş əməliyyatları.
          </DialogDescription>
        </DialogHeader>

        <div className="lead-detail-summary student-detail-summary">
          <div>
            <Phone />
            <span>{student.phone}</span>
          </div>
          <div>
            <ReceiptText />
            <span>{student.program}</span>
          </div>
          <div>
            <UserRound />
            <span>{student.teacher}</span>
          </div>
          <div>
            <Banknote />
            <span>Cari borc: {student.dueDebt}</span>
          </div>
          <div>
            <CalendarDays />
            <span>Növbəti ödəniş tarixi: {student.dueDate}</span>
          </div>
        </div>

        <section className="student-detail-section student-slot-section">
          {open ? <CourseSalesPanel studentId={student.id} /> : null}
          <div className="student-detail-section-title">
            <CalendarDays />
            <span>Tədris slotları</span>
          </div>
          {student.detail.slots.length > 0 ? (
            <div className="student-slot-list">
              {student.detail.slots.map((slot) => (
                <article className="student-slot-item" data-active={slot.isActive} key={slot.id}>
                  <div>
                    <strong>{slot.name}</strong>
                    <span>{slot.schedule}</span>
                  </div>
                  <div>
                    <span>{slot.teacher}</span>
                    <span>{slot.room}</span>
                  </div>
                  <small>{slot.period}</small>
                </article>
              ))}
            </div>
          ) : (
            <div className="student-detail-empty">Tələbə heç bir slota təyin edilməyib</div>
          )}
        </section>

        <div className="student-detail-layout">
          <section className="student-detail-section">
            <div className="student-detail-section-title">
              <ReceiptText />
              <span>Faktura vəziyyəti</span>
            </div>
            <div className="student-mini-table">
              <div className="student-mini-table-head">
                <span>Ay</span>
                <span>Son tarix</span>
                <span>Məbləğ</span>
                <span>Balans</span>
                <span>Status</span>
              </div>
              <div className="student-mini-table-body">
                {student.detail.invoices.length > 0 ? (
                  student.detail.invoices.map((invoice) => (
                    <div className="student-mini-table-row" key={invoice.id}>
                      <span>{invoice.period}</span>
                      <span>{invoice.dueDate}</span>
                      <span>{invoice.amount}</span>
                      <span>{invoice.balance}</span>
                      <StatusChip tone={invoice.tone}>{invoice.status}</StatusChip>
                    </div>
                  ))
                ) : (
                  <div className="student-detail-empty">Faktura yoxdur</div>
                )}
              </div>
            </div>
          </section>

          <section className="student-detail-section">
            <div className="student-detail-section-title">
              <CreditCard />
              <span>Ödəniş qeyd et</span>
            </div>
            <form action={recordPayment} className="student-payment-form">
              <input name="studentId" type="hidden" value={student.id} />
              <input name="returnTo" type="hidden" value={returnTo} />

              <div className="field-grid">
                <label className={`form-field${amountMessage ? " has-error" : ""}`}>
                  <span>Məbləğ</span>
                  <Input
                    name="amount"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={paymentAmount}
                    aria-invalid={Boolean(amountMessage)}
                    aria-describedby={amountMessage ? "student-detail-amount-error" : undefined}
                    onChange={(event) => {
                      const value = event.target.value;
                      setPaymentAmount(value);
                      setAmountError(
                        isAdmissionAmountBelowMinimum(value, receiptPurpose)
                          ? ADMISSION_PAYMENT_MIN_MESSAGE
                          : "",
                      );
                    }}
                    required
                  />
                  {amountMessage ? (
                    <small id="student-detail-amount-error" className="form-field-error" role="alert">
                      {amountMessage}
                    </small>
                  ) : null}
                </label>
                <label className="form-field">
                  <span>Metod</span>
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
                    popoverPlacement="floating"
                    required
                  />
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
                <span>Aid olduğu ay</span>
                <MonthPicker
                  name="billingMonth"
                  defaultValue={student.detail.paymentDefaultMonth}
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

              <ReceiptFields
                studentId={student.id}
                onPurposeChange={(purpose) => {
                  setReceiptPurpose(purpose);
                  setAmountError(
                    isAdmissionAmountBelowMinimum(paymentAmount, purpose)
                      ? ADMISSION_PAYMENT_MIN_MESSAGE
                      : "",
                  );
                }}
              />
              <p className="payment-policy-note">
                {paymentClosed
                  ? "Tədris tamamlanıb: maliyyə öhdəliyi bağlıdır və yeni ödəniş tələb olunmur."
                  : "Ödəniş yalnız seçilmiş ayın fakturasına yazılır. Birdəfəlik seçimdə növbəti aylıq tarix yaradılmır."}
              </p>

              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="ghost">
                    Ləğv et
                  </Button>
                </DialogClose>
                <Button type="submit" disabled={!canRecordPayment || paymentClosed}>
                  <Banknote data-icon="inline-start" />
                  Ödənişi qeyd et
                </Button>
              </DialogFooter>
            </form>
          </section>
        </div>

        <div className="student-detail-layout student-detail-layout-secondary">
          <section className="student-detail-section">
            <div className="student-detail-section-title">
              <Clock3 />
              <span>Son ödənişlər</span>
            </div>
            <div className="student-payment-history">
              {student.detail.payments.length > 0 ? (
                student.detail.payments.map((payment) => (
                  <div className="student-history-line" key={payment.id}>
                    <strong>{payment.amount}</strong>
                    <span>
                      {payment.paidAt} - {payment.scheduleType} - {payment.method} - {payment.createdBy}
                    </span>
                    <small>Cari billing tarixi: {payment.nextPaymentDate} · {payment.note}</small>
                  </div>
                ))
              ) : (
                <div className="student-detail-empty">Ödəniş yoxdur</div>
              )}
            </div>
          </section>

          <section className="student-detail-section">
            <div className="student-detail-section-title">
              <History />
              <span>Status tarixçəsi</span>
            </div>
            <div className="student-timeline-history">
              <div className="student-history-line">
                <strong>{student.lifecycleStatus}</strong>
                <span>
                  <CalendarDays /> Qeydiyyat: {student.detail.registeredAt}
                </span>
                <small>
                  Məsul: {student.detail.manager} - Hesablama: {student.detail.billingPaused}
                </small>
              </div>
              {student.detail.timeline.map((item) => (
                <div className="student-history-line" key={item.id}>
                  <strong>{item.label}</strong>
                  <span>
                    {item.date} - {item.changedBy}
                  </span>
                  <small>{item.reason}</small>
                </div>
              ))}
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
