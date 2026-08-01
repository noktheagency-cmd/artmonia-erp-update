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
import { Input } from "@/components/ui/input";
import { FormSelect } from "@/components/ui/select";
import { StatusChip } from "@/components/ui/status-chip";
import { studentPaymentMethodOptions } from "@/modules/students/payment-method";
import type { StudentListData } from "@/modules/students/queries";
import { unwrapActionResult } from "@/lib/action-result";
import { notifyCaughtError, notifySuccess } from "@/lib/app-notifications";

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

  async function recordPayment(formData: FormData) {
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
            <span>{student.balance}</span>
          </div>
        </div>

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
                <span>Balans</span>
                <span>Status</span>
              </div>
              {student.detail.invoices.length > 0 ? (
                student.detail.invoices.map((invoice) => (
                  <div className="student-mini-table-row" key={invoice.id}>
                    <span>{invoice.period}</span>
                    <span>{invoice.dueDate}</span>
                    <span>{invoice.balance}</span>
                    <StatusChip tone={invoice.tone}>{invoice.status}</StatusChip>
                  </div>
                ))
              ) : (
                <div className="student-detail-empty">Faktura yoxdur</div>
              )}
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
                <label className="form-field">
                  <span>Məbləğ</span>
                  <Input
                    name="amount"
                    inputMode="decimal"
                    placeholder="0.00"
                    defaultValue={student.detail.paymentDefaultAmount}
                    required
                  />
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
                  <span>Növbəti ödəniş tarixi</span>
                  <DatePicker
                    name="nextPaymentDate"
                    defaultValue={student.detail.paymentDefaultNextDate}
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
                <Button type="submit" disabled={!canRecordPayment}>
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
                      {payment.paidAt} - {payment.method} - {payment.createdBy}
                    </span>
                    <small>Növbəti ödəniş: {payment.nextPaymentDate} · {payment.note}</small>
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
