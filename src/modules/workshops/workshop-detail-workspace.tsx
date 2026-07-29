"use client";

import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import {
  ArrowLeft,
  Banknote,
  CalendarDays,
  CircleDollarSign,
  Clock3,
  CreditCard,
  Edit3,
  EllipsisVertical,
  FileText,
  Gift,
  MapPin,
  Search,
  Trash2,
  UserPlus,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { notifyCaughtError } from "@/lib/app-notifications";
import { unwrapActionResult } from "@/lib/action-result";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { FormSelect } from "@/components/ui/select";
import { StatusChip } from "@/components/ui/status-chip";
import type {
  WorkshopDetailData,
  WorkshopExpenseRow,
  WorkshopParticipantRow,
  WorkshopPaymentRow,
} from "@/modules/workshops/queries";

type WorkshopAction = (formData: FormData) => unknown | Promise<unknown>;

type Actions = {
  updateEvent: WorkshopAction;
  deleteOrCancelEvent: WorkshopAction;
  createParticipant: WorkshopAction;
  updateParticipant: WorkshopAction;
  cancelParticipant: WorkshopAction;
  recordPayment: WorkshopAction;
  voidPayment: WorkshopAction;
  createExpense: WorkshopAction;
  voidExpense: WorkshopAction;
};

const paymentMethodOptions = [
  { value: "CASH", label: "Nağd" },
  { value: "CARD", label: "Kart" },
  { value: "BANK_TRANSFER", label: "Bank köçürməsi" },
  { value: "ONLINE", label: "Onlayn" },
  { value: "OTHER", label: "Digər" },
] as const;
const eventStatusOptions = [
  { value: "SCHEDULED", label: "Planlı" },
  { value: "ACTIVE", label: "Aktiv" },
  { value: "DRAFT", label: "Qaralama" },
  { value: "COMPLETED", label: "Tamamlandı" },
  { value: "CANCELLED", label: "Ləğv edildi" },
] as const;
export function WorkshopDetailWorkspace({
  data,
  actions,
  autoOpen,
}: {
  data: WorkshopDetailData;
  actions: Actions;
  autoOpen: boolean;
}) {
  const event = data.event;
  return (
    <section className="workshop-detail-shell">
      <nav className="workshop-breadcrumb" aria-label="Breadcrumb">
        <Link href="/workshops"><ArrowLeft />Workshop &amp; Masterclass</Link>
        <span>/</span><strong>{event.title}</strong>
      </nav>

      <header className="workshop-detail-topbar">
        <div>
          <div className="workshop-detail-title-row">
            <h1>{event.title}</h1>
            <span className={`workshop-type-tag ${getEventTypeClassName(event.eventTypeKind, event.eventType)}`}>{event.eventTypeLabel}</span>
            <StatusChip tone={event.statusTone}>{event.statusLabel}</StatusChip>
          </div>
          <div className="workshop-detail-meta">
            <span><CalendarDays />{event.date}, {event.time}</span>
            <span><MapPin />{event.room}</span>
            <span><UsersRound />{event.participantCount}{event.capacity ? `/${event.capacity}` : ""}</span>
            <span><Clock3 />{event.duration}</span>
          </div>
        </div>
        <div className="workshop-detail-actions">
          {data.permissions.canManage ? <EventActionsMenu data={data} actions={actions} /> : null}
          {data.permissions.canManageFinance ? (
            <PaymentDialog data={data} action={actions.recordPayment} autoOpen={autoOpen && data.activeTab === "payments"} />
          ) : null}
        </div>
      </header>

      <TabNavigation data={data} />

      {data.activeTab === "overview" ? <Overview data={data} actions={actions} /> : null}
      {data.activeTab === "participants" ? (
        <ParticipantsTab data={data} actions={actions} autoOpen={autoOpen} />
      ) : null}
      {data.activeTab === "payments" ? <PaymentsTab data={data} actions={actions} /> : null}
      {data.activeTab === "expenses" ? <ExpensesTab data={data} actions={actions} autoOpen={autoOpen} /> : null}
      {data.activeTab === "details" ? <DetailsTab data={data} actions={actions} /> : null}
    </section>
  );
}

function EventActionsMenu({ data, actions }: { data: WorkshopDetailData; actions: Actions }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="workshop-event-actions-menu">
      <Button
        type="button"
        variant="outline"
        className="workshop-event-actions-trigger"
        aria-label="Tədbir üçün əməliyyatlar"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <EllipsisVertical />
      </Button>
      {open ? (
        <div className="workshop-event-actions-popover" role="menu">
          <EditEventDialog data={data} action={actions.updateEvent} />
          <EventDangerDialog eventId={data.event.id} action={actions.deleteOrCancelEvent} />
        </div>
      ) : null}
    </div>
  );
}

function TabNavigation({ data }: { data: WorkshopDetailData }) {
  const tabs = [
    ["overview", "Ümumi baxış"],
    ["participants", "İştirakçılar"],
    ["payments", "Ödənişlər"],
    ["expenses", "Xərclər"],
    ["details", "Detallar"],
  ] as const;
  return (
    <nav className="workshop-detail-tabs" aria-label="Tədbir bölmələri">
      {tabs.map(([value, label]) => (
        <Link key={value} className={data.activeTab === value ? "is-active" : undefined} href={`/workshops/${data.event.id}?tab=${value}` as Route}>
          {label}
        </Link>
      ))}
    </nav>
  );
}

function Overview({ data, actions }: { data: WorkshopDetailData; actions: Actions }) {
  return (
    <div className="workshop-detail-content is-overview">
      <main className="workshop-overview-main">
        {data.permissions.canViewFinance ? (
          <div className="workshop-detail-kpis">
            <DetailKpi label="Dövriyyə" value={data.summary.revenue} icon={WalletCards} />
            <DetailKpi label="Xərclər" value={data.summary.expense} icon={CircleDollarSign} />
            <DetailKpi label="Xalis mənfəət" value={data.summary.netProfit} icon={Banknote} positive={data.event.netProfitValue >= 0} />
            <DetailKpi label="Gözlənilən" value={data.summary.expected} icon={Clock3} />
          </div>
        ) : null}

        <section className="workshop-detail-card">
          <SectionHeader title="Tutum və yığım" subtitle={`${data.event.participantCount} aktiv iştirakçı`} />
          <div className="workshop-capacity-block is-detail">
            <div><span>Tutum</span><strong>{data.event.participantCount}{data.event.capacity ? ` / ${data.event.capacity}` : ""}</strong></div>
            <div className="workshop-progress"><span style={{ width: `${data.event.fillRate}%` }} /></div>
            <div className="workshop-capacity-legend">
              <span><i className="is-paid" />Ödənilib {data.event.paidCount}</span>
              <span><i className="is-advance" />Avans {data.event.advanceCount}</span>
              <span><i className="is-unpaid" />Gözləyir {data.event.unpaidCount}</span>
              <span><i className="is-gift" />Hədiyyə {data.event.giftCount}</span>
            </div>
          </div>
        </section>

        <section className="workshop-detail-card">
          <SectionHeader title="Son iştirakçılar" subtitle="Ən son qeydiyyatlar" action={<Link href={`/workshops/${data.event.id}?tab=participants` as Route}>Hamısına bax</Link>} />
          <ParticipantTable rows={data.participants.slice(0, 6)} actions={actions} canManage={data.permissions.canManage} />
        </section>
      </main>
      <FinanceRail data={data} actions={actions} />
    </div>
  );
}

function ParticipantsTab({ data, actions, autoOpen }: { data: WorkshopDetailData; actions: Actions; autoOpen: boolean }) {
  return (
    <div className="workshop-detail-content">
      <section className="workshop-detail-card is-full">
        <div className="workshop-table-toolbar">
          <form method="get" className="workshop-table-filter-form">
            <input type="hidden" name="tab" value="participants" />
            <InputGroup>
              <InputGroupAddon><Search /></InputGroupAddon>
              <InputGroupInput name="q" defaultValue={data.participantFilters.query} placeholder="İştirakçı axtar" />
            </InputGroup>
            <select name="paymentState" defaultValue={data.participantFilters.paymentState}>
              <option value="all">Bütün statuslar</option><option value="paid">Ödənilib</option>
              <option value="advance">Avans</option><option value="unpaid">Ödənilməyib</option>
              <option value="gift">Hədiyyə</option><option value="cancelled">Ləğv edilib</option>
            </select>
            <select name="participantType" defaultValue={data.participantFilters.participantType}>
              <option value="all">Tələbə + qonaq</option><option value="student">Mövcud tələbə</option><option value="guest">Qonaq</option>
            </select>
            <Button type="submit" variant="outline">Filtrlə</Button>
          </form>
          {data.permissions.canManage ? <ParticipantDialog data={data} action={actions.createParticipant} autoOpen={autoOpen} /> : null}
        </div>
        <ParticipantTable rows={data.participants} actions={actions} canManage={data.permissions.canManage} />
        <DetailPagination data={data} />
      </section>
    </div>
  );
}

function PaymentsTab({ data, actions }: { data: WorkshopDetailData; actions: Actions }) {
  return (
    <div className="workshop-detail-content is-finance-tab">
      <section className="workshop-detail-card is-full">
        <div className="workshop-table-toolbar">
          <SectionHeader title="Ödəniş tarixçəsi" subtitle={`${data.payments.length} əməliyyat`} />
          {data.permissions.canManageFinance ? <PaymentDialog data={data} action={actions.recordPayment} /> : null}
        </div>
        <div className="workshop-table-scroll">
          <table className="workshop-data-table is-detail-table">
            <thead><tr><th>İştirakçı</th><th>Tarix</th><th>Metod</th><th>Məbləğ</th><th>Ödəyən</th><th>Status</th><th /></tr></thead>
            <tbody>{data.payments.length ? data.payments.map((payment) => (
              <tr key={payment.id} className={payment.statusLabel === "Ləğv edilib" ? "is-voided" : undefined}>
                <td><strong>{payment.participantName}</strong><small>{payment.receipt}</small></td>
                <td>{payment.paidAt}</td><td>{payment.method}</td><td><strong>{payment.amount}</strong></td>
                <td>{payment.payerName}</td><td><StatusChip tone={payment.statusTone}>{payment.statusLabel}</StatusChip></td>
                <td>{payment.statusLabel === "Aktiv" && data.permissions.canManageFinance ? <VoidPaymentDialog row={payment} action={actions.voidPayment} /> : null}</td>
              </tr>
            )) : <EmptyTable colSpan={7} text="Ödəniş əməliyyatı yoxdur" />}</tbody>
          </table>
        </div>
      </section>
      <FinanceRail data={data} actions={actions} />
    </div>
  );
}

function ExpensesTab({ data, actions, autoOpen }: { data: WorkshopDetailData; actions: Actions; autoOpen: boolean }) {
  return (
    <div className="workshop-detail-content is-finance-tab">
      <section className="workshop-detail-card is-full">
        <div className="workshop-table-toolbar">
          <SectionHeader title="Xərc tarixçəsi" subtitle={`${data.expenses.length} əməliyyat`} />
          {data.permissions.canManageFinance ? <ExpenseDialog data={data} action={actions.createExpense} autoOpen={autoOpen} /> : null}
        </div>
        <div className="workshop-table-scroll">
          <table className="workshop-data-table is-detail-table">
            <thead><tr><th>Kateqoriya</th><th>Tarix</th><th>Vendor</th><th>Metod</th><th>Məbləğ</th><th>Status</th><th /></tr></thead>
            <tbody>{data.expenses.length ? data.expenses.map((expense) => (
              <tr key={expense.id} className={expense.statusLabel === "Ləğv edilib" ? "is-voided" : undefined}>
                <td><strong>{expense.category}</strong><small>{expense.description}</small></td>
                <td>{expense.expenseDate}</td><td>{expense.vendor}</td><td>{expense.method}</td><td><strong>{expense.amount}</strong></td>
                <td><StatusChip tone={expense.statusTone}>{expense.statusLabel}</StatusChip></td>
                <td>{expense.statusLabel === "Aktiv" && data.permissions.canManageFinance ? <VoidExpenseDialog row={expense} action={actions.voidExpense} /> : null}</td>
              </tr>
            )) : <EmptyTable colSpan={7} text="Xərc əməliyyatı yoxdur" />}</tbody>
          </table>
        </div>
      </section>
      <FinanceRail data={data} actions={actions} />
    </div>
  );
}

function DetailsTab({ data, actions }: { data: WorkshopDetailData; actions: Actions }) {
  return (
    <div className="workshop-detail-content">
      <section className="workshop-detail-card is-full workshop-info-grid">
        <Info label="Tədbir növü" value={data.event.eventTypeLabel} />
        <Info label="Status" value={data.event.statusLabel} />
        <Info label="Tarix və saat" value={`${data.event.date}, ${data.event.time}`} />
        <Info label="Müddət" value={data.event.duration} />
        <Info label="Məkan" value={data.event.room} />
        <Info label="Təlimçi" value={data.event.instructor} />
        <Info label="Tutum" value={data.event.capacity ? String(data.event.capacity) : "Limitsiz"} />
        <Info label="Giriş qiyməti" value={data.event.entryPrice} />
        <Info label="Qeyd" value={data.event.note || "Qeyd yoxdur"} wide />
        {data.permissions.canManage ? (
          <div className="workshop-details-actions">
            <EditEventDialog data={data} action={actions.updateEvent} />
            <EventDangerDialog eventId={data.event.id} action={actions.deleteOrCancelEvent} />
          </div>
        ) : null}
      </section>
    </div>
  );
}

function FinanceRail({ data, actions }: { data: WorkshopDetailData; actions: Actions }) {
  if (!data.permissions.canViewFinance) return null;
  return (
    <aside className="workshop-finance-rail">
      <div><span>Dövriyyə</span><strong>{data.summary.revenue}</strong><small>Aktiv ödənişlər</small></div>
      <div><span>Xərclər</span><strong>{data.summary.expense}</strong><small>Tədbirə bağlı</small></div>
      <div><span>Xalis mənfəət</span><strong className={data.event.netProfitValue >= 0 ? "is-positive" : "is-negative"}>{data.summary.netProfit}</strong></div>
      <div><span>Gözlənilən ödəniş</span><strong>{data.summary.expected}</strong></div>
      {data.permissions.canManageFinance ? <PaymentDialog data={data} action={actions.recordPayment} /> : null}
      {data.permissions.canManageFinance ? <ExpenseDialog data={data} action={actions.createExpense} /> : null}
    </aside>
  );
}

function ParticipantTable({ rows, actions, canManage }: { rows: WorkshopParticipantRow[]; actions: Actions; canManage: boolean }) {
  return (
    <div className="workshop-table-scroll">
      <table className="workshop-data-table is-detail-table">
        <thead><tr><th>İştirakçı</th><th>Telefon</th><th>Qiymət</th><th>Ödənilib</th><th>Qalıq</th><th>Status</th><th>Qeydiyyat</th><th /></tr></thead>
        <tbody>{rows.length ? rows.map((row) => (
          <tr key={row.id} className={row.paymentState === "CANCELLED" ? "is-voided" : undefined}>
            <td><strong>{row.fullName}</strong><small>{row.kind === "student" ? "Mövcud tələbə" : "Qonaq"}</small></td>
            <td>{row.phone}</td><td>{row.netPrice}</td><td>{row.paid}</td><td><strong>{row.balance}</strong></td>
            <td><StatusChip tone={row.paymentTone}>{row.paymentLabel}</StatusChip></td><td>{row.assignedAt}</td>
            <td>{canManage && row.paymentState !== "CANCELLED" ? <ParticipantActions row={row} actions={actions} /> : null}</td>
          </tr>
        )) : <EmptyTable colSpan={8} text="İştirakçı yoxdur" />}</tbody>
      </table>
    </div>
  );
}

function ParticipantActions({ row, actions }: { row: WorkshopParticipantRow; actions: Actions }) {
  return (
    <div className="workshop-row-actions">
      <EditParticipantDialog row={row} action={actions.updateParticipant} />
      <ReasonDialog title="İştirakçını ləğv et" description="Ödəniş tarixçəsi qorunacaq." hiddenName="participantId" hiddenValue={row.id} action={actions.cancelParticipant} icon={<Trash2 />} />
    </div>
  );
}

function DetailKpi({ label, value, icon: Icon, positive = false }: { label: string; value: string; icon: typeof Banknote; positive?: boolean }) {
  return <article><Icon /><span>{label}</span><strong className={positive ? "is-positive" : undefined}>{value}</strong></article>;
}

function SectionHeader({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) {
  return <div className="workshop-section-head"><div><span>{subtitle}</span><h2>{title}</h2></div>{action}</div>;
}

function Info({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return <div className={wide ? "is-wide" : undefined}><span>{label}</span><strong>{value}</strong></div>;
}

function EmptyTable({ colSpan, text }: { colSpan: number; text: string }) {
  return <tr><td colSpan={colSpan}><div className="workshop-empty-state is-inline"><FileText /><strong>{text}</strong></div></td></tr>;
}

function DetailPagination({ data }: { data: WorkshopDetailData }) {
  const p = data.participantPagination;
  if (p.totalPages <= 1) return <div className="workshop-pagination"><span>Cəmi {p.total} iştirakçı</span></div>;
  return <div className="workshop-pagination"><span>Cəmi {p.total} iştirakçı</span><div>{p.page} / {p.totalPages}</div></div>;
}

function ParticipantDialog({ data, action, autoOpen = false }: { data: WorkshopDetailData; action: WorkshopAction; autoOpen?: boolean }) {
  return (
    <ActionDialog
      title="İştirakçı əlavə et"
      description="Mövcud tələbə və ya qonaq seçin, istəyə görə avans qəbul edin."
      trigger={<Button><UserPlus data-icon="inline-start" />İştirakçı əlavə et</Button>}
      action={action}
      defaultOpen={autoOpen}
      headerIcon={<UserPlus />}
    >
      <input type="hidden" name="eventId" value={data.event.id} />
      <FieldGroup>
        <Field><FieldLabel>Mövcud tələbə</FieldLabel><FormSelect name="studentId" emptyLabel="Qonaq kimi əlavə et" searchable searchPlaceholder="Tələbə axtar..." options={data.students.map((student) => ({ value: student.id, label: student.label, searchText: `${student.phone} ${student.program}` }))} /></Field>
        <div className="workshop-form-grid">
          <Field><FieldLabel htmlFor="participant-name">Ad və soyad</FieldLabel><Input id="participant-name" name="fullName" /></Field>
          <Field><FieldLabel htmlFor="participant-phone">Telefon</FieldLabel><Input id="participant-phone" name="phone" /></Field>
          <Field><FieldLabel htmlFor="participant-email">Email</FieldLabel><Input id="participant-email" name="email" type="email" /></Field>
          <Field><FieldLabel htmlFor="participant-price">Siyahı qiyməti</FieldLabel><Input id="participant-price" name="listPrice" defaultValue={data.event.entryPriceInput} inputMode="decimal" /></Field>
          <Field><FieldLabel htmlFor="participant-discount">Endirim</FieldLabel><Input id="participant-discount" name="discountAmount" defaultValue="0" inputMode="decimal" /></Field>
          <Field><FieldLabel htmlFor="participant-advance">Avans məbləği</FieldLabel><Input id="participant-advance" name="advanceAmount" defaultValue="0" inputMode="decimal" /></Field>
          <Field><FieldLabel>Ödəniş üsulu</FieldLabel><FormSelect name="paymentMethod" defaultValue="CASH" options={paymentMethodOptions} /></Field>
        </div>
        <Field className="workshop-check-field"><label><input type="checkbox" name="isGift" /><Gift />Hədiyyə iştirakçı</label><FieldDescription>Hədiyyə seçildikdə qiymət və qalıq sıfırlanır.</FieldDescription></Field>
        <Field><FieldLabel htmlFor="participant-note">Qeyd</FieldLabel><textarea id="participant-note" name="note" rows={3} /></Field>
      </FieldGroup>
    </ActionDialog>
  );
}

function PaymentDialog({ data, action, autoOpen = false }: { data: WorkshopDetailData; action: WorkshopAction; autoOpen?: boolean }) {
  const payable = data.participants.filter((row) => row.balanceValue > 0 && !row.isGift && row.paymentState !== "CANCELLED");
  return (
    <ActionDialog title="Ödəniş qəbul et" description="İştirakçı üçün yeni ödəniş əməliyyatı yaradın." trigger={<Button disabled={payable.length === 0}><CreditCard data-icon="inline-start" />Ödəniş qəbul et</Button>} action={action} defaultOpen={autoOpen && payable.length > 0} headerIcon={<CreditCard />}>
      <input type="hidden" name="eventId" value={data.event.id} />
      <FieldGroup>
        <Field><FieldLabel>İştirakçı</FieldLabel><FormSelect name="participantId" required searchable options={payable.map((row) => ({ value: row.id, label: `${row.fullName} / qalıq ${row.balance}` }))} /></Field>
        <div className="workshop-form-grid">
          <Field><FieldLabel htmlFor="payment-amount">Məbləğ</FieldLabel><Input id="payment-amount" name="amount" inputMode="decimal" required /></Field>
          <Field><FieldLabel>Ödəniş tarixi</FieldLabel><DatePicker name="paidAt" defaultValue={data.defaultDate} required allowClear={false} popoverPlacement="floating" /></Field>
          <Field><FieldLabel>Ödəniş üsulu</FieldLabel><FormSelect name="paymentMethod" defaultValue="CASH" options={paymentMethodOptions} /></Field>
          <Field><FieldLabel htmlFor="payer-name">Ödəyən</FieldLabel><Input id="payer-name" name="payerName" /></Field>
          <Field><FieldLabel htmlFor="payment-receipt">Qəbz №</FieldLabel><Input id="payment-receipt" name="receiptReference" /></Field>
          <Field><FieldLabel htmlFor="payment-file">Qəbz faylı</FieldLabel><Input id="payment-file" name="receiptFile" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" /></Field>
        </div>
        <Field><FieldLabel htmlFor="payment-note">Qeyd</FieldLabel><textarea id="payment-note" name="note" rows={3} /></Field>
      </FieldGroup>
    </ActionDialog>
  );
}

function ExpenseDialog({ data, action, autoOpen = false }: { data: WorkshopDetailData; action: WorkshopAction; autoOpen?: boolean }) {
  return (
    <ActionDialog title="Xərc əlavə et" description="Tədbirə bağlanan xərc ümumi Maliyyədə də görünəcək." trigger={<Button variant="outline"><CircleDollarSign data-icon="inline-start" />Xərc əlavə et</Button>} action={action} defaultOpen={autoOpen} headerIcon={<CircleDollarSign />}>
      <input type="hidden" name="eventId" value={data.event.id} />
      <FieldGroup>
        <Field><FieldLabel>Kateqoriya</FieldLabel><FormSelect name="categoryId" required options={data.categories.map((category) => ({ value: category.id, label: category.name }))} /></Field>
        <div className="workshop-form-grid">
          <Field><FieldLabel htmlFor="expense-amount">Məbləğ</FieldLabel><Input id="expense-amount" name="amount" inputMode="decimal" required /></Field>
          <Field><FieldLabel>Xərc tarixi</FieldLabel><DatePicker name="expenseDate" defaultValue={data.defaultDate} required allowClear={false} popoverPlacement="floating" /></Field>
          <Field><FieldLabel>Ödəniş üsulu</FieldLabel><FormSelect name="method" defaultValue="CASH" options={paymentMethodOptions} /></Field>
          <Field><FieldLabel htmlFor="expense-vendor">Vendor</FieldLabel><Input id="expense-vendor" name="vendor" /></Field>
          <Field><FieldLabel htmlFor="expense-receipt">Qəbz №</FieldLabel><Input id="expense-receipt" name="receiptReference" /></Field>
          <Field><FieldLabel htmlFor="expense-file">Qəbz faylı</FieldLabel><Input id="expense-file" name="receiptFile" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" /></Field>
        </div>
        <Field><FieldLabel htmlFor="expense-description">Təsvir</FieldLabel><textarea id="expense-description" name="description" rows={3} /></Field>
      </FieldGroup>
    </ActionDialog>
  );
}

function EditEventDialog({ data, action }: { data: WorkshopDetailData; action: WorkshopAction }) {
  const event = data.event;
  return (
    <ActionDialog title="Tədbiri redaktə et" description="Yeni qiymət yalnız gələcək qeydiyyatlara default olacaq." trigger={<button type="button" className="workshop-event-menu-item" role="menuitem"><Edit3 />Redaktə et</button>} action={action} headerIcon={<CalendarDays />}>
      <input type="hidden" name="eventId" value={event.id} />
      <FieldGroup><div className="workshop-form-grid">
        <Field className="workshop-field-span-2"><FieldLabel>Ad</FieldLabel><Input name="title" defaultValue={event.title} required /></Field>
        <Field>
          <FieldLabel>Növ / kateqoriya</FieldLabel>
          <FormSelect
            name="eventType"
            defaultValue={event.eventType}
            options={data.eventTypes}
            searchable
            creatable
            searchPlaceholder="Tip seçin və ya yenisini yazın"
            createLabel="Yeni tip əlavə et"
          />
        </Field>
        <Field><FieldLabel>Tarix</FieldLabel><DatePicker name="eventDate" defaultValue={event.dateValue} required allowClear={false} popoverPlacement="floating" /></Field>
        <Field><FieldLabel>Saat</FieldLabel><Input name="startTime" defaultValue={event.time} required /></Field>
        <Field><FieldLabel>Müddət</FieldLabel><Input name="durationMinutes" type="number" defaultValue={event.durationMinutes} required /></Field>
        <Field><FieldLabel>Status</FieldLabel><FormSelect name="status" defaultValue={event.status} options={eventStatusOptions} /></Field>
        <Field><FieldLabel>Qiymət</FieldLabel><Input name="entryPrice" defaultValue={event.entryPriceInput} required /></Field>
        <Field><FieldLabel>Tutum</FieldLabel><Input name="capacity" type="number" defaultValue={event.capacity ?? ""} /></Field>
        <Field className="workshop-field-span-2"><FieldLabel>Məkan</FieldLabel><Input name="room" defaultValue={event.room === "Məkan seçilməyib" ? "" : event.room} /></Field>
        <Field><FieldLabel>Təlimçi</FieldLabel><Input name="instructor" defaultValue={event.instructor === "Təlimçi seçilməyib" ? "" : event.instructor} /></Field>
      </div><Field><FieldLabel>Qeyd</FieldLabel><textarea name="note" defaultValue={event.note} rows={3} /></Field></FieldGroup>
    </ActionDialog>
  );
}

function EditParticipantDialog({ row, action }: { row: WorkshopParticipantRow; action: WorkshopAction }) {
  return (
    <ActionDialog title="İştirakçını redaktə et" description="Qiymət qəbul edilmiş ödənişdən aşağı ola bilməz." trigger={<button type="button" className="workshop-icon-action" aria-label="Redaktə et"><Edit3 /></button>} action={action} headerIcon={<UsersRound />}>
      <input type="hidden" name="participantId" value={row.id} />
      <FieldGroup><div className="workshop-form-grid">
        <Field><FieldLabel>Ad və soyad</FieldLabel><Input name="fullName" defaultValue={row.fullName} required /></Field>
        <Field><FieldLabel>Telefon</FieldLabel><Input name="phone" defaultValue={row.phone === "-" ? "" : row.phone} /></Field>
        <Field><FieldLabel>Email</FieldLabel><Input name="email" type="email" defaultValue={row.email === "-" ? "" : row.email} /></Field>
        <Field><FieldLabel>Siyahı qiyməti</FieldLabel><Input name="listPrice" defaultValue={row.listPriceInput} required /></Field>
        <Field><FieldLabel>Endirim</FieldLabel><Input name="discountAmount" defaultValue={row.discountAmountInput} /></Field>
      </div><Field className="workshop-check-field"><label><input type="checkbox" name="isGift" defaultChecked={row.isGift} /><Gift />Hədiyyə iştirakçı</label></Field><Field><FieldLabel>Qeyd</FieldLabel><textarea name="note" defaultValue={row.note} rows={3} /></Field></FieldGroup>
    </ActionDialog>
  );
}

function getEventTypeClassName(kind: "WORKSHOP" | "MASTERCLASS", value: string) {
  if (value !== "WORKSHOP" && value !== "MASTERCLASS") return "is-custom";
  if (kind === "MASTERCLASS") return "is-masterclass";
  if (kind === "WORKSHOP") return "is-workshop";
  return "is-custom";
}

function EventDangerDialog({ eventId, action }: { eventId: string; action: WorkshopAction }) {
  const router = useRouter();
  return (
    <ActionDialog
      title="Tədbiri tam sil"
      description="Tədbirə bağlı bütün iştirakçılar, ödənişlər və xərclər həmişəlik silinəcək."
      trigger={<button type="button" className="workshop-event-menu-item is-danger" role="menuitem"><Trash2 />Sil</button>}
      action={action}
      destructive
      onSuccess={() => router.replace("/workshops")}
      headerIcon={<Trash2 />}
    >
      <input type="hidden" name="eventId" value={eventId} />
    </ActionDialog>
  );
}

function VoidPaymentDialog({ row, action }: { row: WorkshopPaymentRow; action: WorkshopAction }) {
  return <ReasonDialog title="Ödənişi ləğv et" description={`${row.amount} dövriyyədən çıxarılacaq.`} hiddenName="paymentId" hiddenValue={row.id} action={action} icon={<Trash2 />} />;
}

function VoidExpenseDialog({ row, action }: { row: WorkshopExpenseRow; action: WorkshopAction }) {
  return <ReasonDialog title="Xərci ləğv et" description={`${row.amount} xərc hesabından çıxarılacaq.`} hiddenName="expenseId" hiddenValue={row.id} action={action} icon={<Trash2 />} />;
}

function ReasonDialog({ title, description, hiddenName, hiddenValue, action, icon, onSuccess }: {
  title: string; description: string; hiddenName: string; hiddenValue: string; action: WorkshopAction; icon: ReactNode; onSuccess?: () => void;
}) {
  return (
    <ActionDialog title={title} description={description} trigger={<button type="button" className="workshop-icon-action" aria-label={title}>{icon}</button>} action={action} destructive onSuccess={onSuccess} headerIcon={icon}>
      <input type="hidden" name={hiddenName} value={hiddenValue} />
    </ActionDialog>
  );
}

function ActionDialog({ title, description, trigger, action, children, defaultOpen = false, destructive = false, onSuccess, headerIcon }: {
  title: string;
  description: string;
  trigger: ReactNode;
  action: WorkshopAction;
  children: ReactNode;
  defaultOpen?: boolean;
  destructive?: boolean;
  onSuccess?: () => void;
  headerIcon?: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setError("");
    startTransition(() => {
      void Promise.resolve(action(new FormData(form))).then((result) => {
        unwrapActionResult(result);
        setOpen(false);
        if (onSuccess) onSuccess();
        else router.refresh();
      }).catch((caught) => setError(notifyCaughtError(caught, "Əməliyyat tamamlanmadı")));
    });
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="workshop-dialog workshop-action-dialog">
        <DialogHeader className="workshop-dialog-header">
          <div className="workshop-dialog-heading">
            {headerIcon ? <span className={destructive ? "workshop-dialog-icon is-danger" : "workshop-dialog-icon"} aria-hidden="true">{headerIcon}</span> : null}
            <div>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <form onSubmit={submit} className="workshop-dialog-form">
          {children}
          {error ? <p className="workshop-form-error" role="alert">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Ləğv et</Button>
            <Button type="submit" disabled={pending} className={destructive ? "is-destructive" : undefined}>{pending ? "İcra olunur..." : destructive ? "Təsdiqlə" : "Yadda saxla"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
