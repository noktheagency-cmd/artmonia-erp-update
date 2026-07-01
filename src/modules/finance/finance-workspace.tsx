"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownToLine,
  BadgeDollarSign,
  Banknote,
  BarChart3,
  Calculator,
  CalendarDays,
  CheckCircle2,
  FileText,
  ListFilter,
  Plus,
  ReceiptText,
  Search,
  ShieldCheck,
  Upload,
  UserRound,
  WalletCards,
} from "lucide-react";
import { useFormStatus } from "react-dom";
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
import { EMPTY_SELECT_VALUE } from "@/modules/shared/form-values";
import { studentPaymentMethodOptions } from "@/modules/students/payment-method";
import type { FinanceData } from "@/modules/finance/queries";

const addCategoryValue = "__add_category__";

type FinanceTab = FinanceData["filters"]["type"];

const financeTabs: Array<{
  value: FinanceTab;
  label: string;
  description: (data: FinanceData) => string;
  icon: typeof BarChart3;
}> = [
  {
    value: "overview",
    label: "Umumi statistika",
    description: (data) => data.summary.net,
    icon: BarChart3,
  },
  {
    value: "payments",
    label: "Odenisler",
    description: (data) => `${data.summary.paymentCount} emeliyyat`,
    icon: Banknote,
  },
  {
    value: "debts",
    label: "Borclar",
    description: (data) => `${data.summary.debtors} telebe`,
    icon: AlertTriangle,
  },
  {
    value: "expenses",
    label: "Xercler",
    description: (data) => `${data.summary.expenseCount} qeyd`,
    icon: ReceiptText,
  },
  {
    value: "payroll",
    label: "Maaslar",
    description: (data) => data.summary.payroll,
    icon: Calculator,
  },
];

const financeKpiIcons = [Banknote, ReceiptText, BarChart3, Calculator, AlertTriangle];
const financeAlertIcons = {
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertTriangle,
  neutral: ShieldCheck,
  info: BarChart3,
};

export function FinanceWorkspace({
  data,
  recordPaymentAction,
  createExpenseAction,
}: {
  data: FinanceData;
  recordPaymentAction: (formData: FormData) => void | Promise<void>;
  createExpenseAction: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <section className="page-stack finance-page">
      <header className="finance-header">
        <div className="finance-header-main">
          <div className="finance-scope-row">
            <span>Artmonia ERP</span>
            <span>{data.filterLabels.period}</span>
            <span>Maliyye</span>
          </div>
          <div className="finance-title-block">
            <h1>Maliyye emeliyyatlari</h1>
            <p>Odenis qebulu, xerc ledger-i, qebzler, kateqoriyalar ve maas hesablamalari bir isci panelinde izlenir.</p>
          </div>
        </div>
        <div className="finance-header-side">
          <div className="finance-period-card">
            <span className="finance-period-icon">
              <CalendarDays size={18} />
            </span>
            <div>
              <span>Aktiv dovr</span>
              <strong>{data.filterLabels.period}</strong>
            </div>
          </div>
          <div className="finance-header-actions">
            <PaymentDialog
              data={data}
              action={recordPaymentAction}
            />
            <ExpenseDialog
              data={data}
              action={createExpenseAction}
            />
          </div>
        </div>
      </header>

      <div className="finance-kpi-grid" aria-label="Maliyye KPI-lari">
        {data.kpis.map((kpi, index) => {
          const Icon = financeKpiIcons[index] ?? BarChart3;

          return (
            <article className={`finance-kpi is-${kpi.tone}`} key={kpi.label}>
              <div className="finance-kpi-top">
                <span className="finance-kpi-icon">
                  <Icon size={18} />
                </span>
                <span className="finance-kpi-label">{kpi.label}</span>
              </div>
              <strong>{kpi.value}</strong>
              <div className="finance-kpi-footer">
                <small>{kpi.helper}</small>
                <span aria-hidden="true" />
              </div>
            </article>
          );
        })}
      </div>

      <FinanceTabs data={data} />

      <FinanceCommandBar data={data} />

      <div className="finance-alert-row">
        {data.alerts.map((alert) => {
          const Icon = financeAlertIcons[alert.tone] ?? ShieldCheck;

          return (
            <div className={`finance-alert is-${alert.tone}`} key={alert.label}>
              <span className="finance-alert-icon">
                <Icon size={16} />
              </span>
              <div>
                <StatusChip tone={alert.tone}>{alert.label}</StatusChip>
                <strong>{alert.value}</strong>
              </div>
            </div>
          );
        })}
      </div>

      <div className="finance-tab-panel" key={data.filters.type}>
        {data.filters.type === "overview" ? <OverviewWorkspace data={data} /> : null}
        {data.filters.type === "payments" ? <PaymentLedger payments={data.payments} /> : null}
        {data.filters.type === "debts" ? <DebtLedger debtors={data.debtors} /> : null}
        {data.filters.type === "expenses" ? <ExpenseLedger expenses={data.expenses} /> : null}
        {data.filters.type === "payroll" ? <PayrollLedger payrollItems={data.payrollItems} /> : null}
      </div>
    </section>
  );
}

function FinanceTabs({ data }: { data: FinanceData }) {
  return (
    <nav className="finance-tabs" aria-label="Maliyye bolmeleri">
      {financeTabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = data.filters.type === tab.value;

        return (
          <Link
            aria-current={isActive ? "page" : undefined}
            className={`finance-tab${isActive ? " is-active" : ""}`}
            href={buildFinanceTabHref(data, tab.value)}
            key={tab.value}
          >
            <span className="finance-tab-icon">
              <Icon size={16} />
            </span>
            <span className="finance-tab-copy">
              <span>{tab.label}</span>
              <strong>{tab.description(data)}</strong>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

function FinanceCommandBar({ data }: { data: FinanceData }) {
  return (
    <form className="finance-command-bar" action="/finance">
      {data.filters.type !== "overview" ? (
        <input type="hidden" name="type" value={data.filters.type} />
      ) : null}

      <label className="table-search finance-search">
        <Search size={15} />
        <span className="sr-only">Maliyye axtar</span>
        <input
          name="q"
          defaultValue={data.filters.query}
          placeholder="Telebe, borc, qebz, kateqoriya, isci uzre axtar"
        />
      </label>

      <label className="finance-filter-field">
        <span>Kateqoriya</span>
        <select name="category" defaultValue={data.filters.category}>
          <option value="">Butun kateqoriyalar</option>
          {data.categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>

      <label className="finance-filter-field date">
        <span>Baslangic</span>
        <DatePicker name="from" defaultValue={data.filters.from} />
      </label>

      <label className="finance-filter-field date">
        <span>Son</span>
        <DatePicker name="to" defaultValue={data.filters.to} />
      </label>

      <div className="finance-filter-actions">
        <Button type="submit" size="sm" variant="outline">
          <ListFilter data-icon="inline-start" />
          Filtrle
        </Button>
        {data.filters.activeCount > 0 ? (
          <Link className="ui-button ui-button-ghost ui-button-sm" href="/finance">
            Sifirla
          </Link>
        ) : null}
      </div>
    </form>
  );
}

function PaymentDialog({
  data,
  action,
}: {
  data: FinanceData;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const selectedStudent = data.students.find((student) => student.id === selectedStudentId);
  const [values, setValues] = useState({
    amount: "",
    paidDate: data.students[0]?.defaultPaymentDate ?? "",
    paymentMonth: data.students[0]?.defaultPaymentMonth ?? "",
    payerName: "",
  });

  function handleStudentChange(value: string) {
    const studentId = cleanSelectValue(value);
    const student = data.students.find((item) => item.id === studentId);
    setSelectedStudentId(studentId);

    if (student) {
      setValues((current) => ({
        ...current,
        amount: student.defaultAmount,
        paidDate: student.defaultPaymentDate,
        paymentMonth: student.defaultPaymentMonth,
        payerName: student.name,
      }));
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" disabled={!data.permissions.canRecordPayment}>
          <Banknote data-icon="inline-start" />
          Odenis elave et
        </Button>
      </DialogTrigger>
      <DialogContent className="finance-dialog finance-payment-dialog">
        <DialogHeader>
          <DialogTitle>Odenis qebul et</DialogTitle>
          <DialogDescription>
            Odenisin hansi telebeden geldiyini sec, qebzi yukle ve meblegi aciq fakturalara avtomatik bol.
          </DialogDescription>
        </DialogHeader>

        <form action={action} className="finance-form">
          <input type="hidden" name="studentId" value={selectedStudentId} />
          <input type="hidden" name="returnTo" value={data.returnTo} />

          <section className="finance-form-section">
            <div className="finance-form-section-title">
              <UserRound size={16} />
              <span>Telebe ve odenis konteksti</span>
            </div>
            <label className="form-field">
              <span>Odenis hansi telebeden gelir?</span>
              <FormSelect
                name="studentSelector"
                value={selectedStudentId}
                onValueChange={handleStudentChange}
                emptyLabel="Telebe secin"
                searchable
                searchPlaceholder="Telebe axtar..."
                options={data.students.map((student) => ({
                  value: student.id,
                  label: student.label,
                  searchText: [
                    student.code,
                    student.phone,
                    student.program,
                    student.teacher,
                    student.balance,
                  ].join(" "),
                }))}
              />
            </label>

            {selectedStudent ? (
              <div className="finance-selected-record">
                <div>
                  <strong>{selectedStudent.name}</strong>
                  <span>{selectedStudent.code} / {selectedStudent.phone}</span>
                </div>
                <div>
                  <span>Proqram</span>
                  <strong>{selectedStudent.program}</strong>
                </div>
                <div>
                  <span>Muellim</span>
                  <strong>{selectedStudent.teacher}</strong>
                </div>
                <div>
                  <span>Aciq balans</span>
                  <strong>{selectedStudent.balance}</strong>
                </div>
              </div>
            ) : null}
          </section>

          <section className="finance-form-section">
            <div className="finance-form-section-title">
              <WalletCards size={16} />
              <span>Odenis detallari</span>
            </div>
            <div className="field-grid">
              <label className="form-field">
                <span>Mebleg</span>
                <Input
                  name="amount"
                  value={values.amount}
                  onChange={(event) => setValues((current) => ({ ...current, amount: event.target.value }))}
                  inputMode="decimal"
                  required
                />
              </label>
              <label className="form-field">
                <span>Metod</span>
                <FormSelect name="method" defaultValue="CASH" options={studentPaymentMethodOptions} />
              </label>
            </div>
            <div className="field-grid">
              <label className="form-field">
                <span>Odenis tarixi</span>
                <DatePicker
                  name="paidDate"
                  value={values.paidDate}
                  onValueChange={(value) => setValues((current) => ({ ...current, paidDate: value }))}
                  allowClear={false}
                  required
                />
              </label>
              <label className="form-field">
                <span>Odenis ayi</span>
                <Input
                  name="paymentMonth"
                  type="month"
                  value={values.paymentMonth}
                  onChange={(event) => setValues((current) => ({ ...current, paymentMonth: event.target.value }))}
                  required
                />
              </label>
            </div>
            <div className="field-grid">
              <label className="form-field">
                <span>Odeyen sexs</span>
                <Input
                  name="payerName"
                  value={values.payerName}
                  onChange={(event) => setValues((current) => ({ ...current, payerName: event.target.value }))}
                  maxLength={120}
                />
              </label>
              <label className="form-field">
                <span>Qebz nomresi</span>
                <Input name="receiptReference" maxLength={120} placeholder="Mes: POS-10293" />
              </label>
            </div>
            <label className="form-field">
              <span>Qebz yukle</span>
              <Input name="receiptFile" type="file" accept="image/*,.pdf" />
            </label>
            <label className="form-field">
              <span>Qeyd</span>
              <Input name="note" maxLength={500} placeholder="Bank, terminal, izah ve ya borc qeydi" />
            </label>
          </section>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Legv et
              </Button>
            </DialogClose>
            <SubmitButton disabled={!selectedStudentId || !data.permissions.canRecordPayment}>
              <ArrowDownToLine data-icon="inline-start" />
              Odenisi qebul et
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ExpenseDialog({
  data,
  action,
}: {
  data: FinanceData;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [categoryValue, setCategoryValue] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [staffTarget, setStaffTarget] = useState("");
  const selectedStaff = data.staff.find((staff) => staff.id === staffTarget);
  const [amount, setAmount] = useState("");
  const isAddingCategory = categoryValue === addCategoryValue;
  const selectedCategory = data.categories.find((category) => category.id === categoryValue);
  const categoryName = isAddingCategory ? newCategoryName : selectedCategory?.name ?? "";
  const usesPayrollFlow = isPayrollCategoryName(categoryName);
  const salaryMode = usesPayrollFlow && selectedStaff ? selectedStaff.salaryMode : "NONE";
  const salaryBaseAmount = usesPayrollFlow && selectedStaff ? getStaffSalaryBase(selectedStaff) : "";
  const salaryCalculatedAmount =
    usesPayrollFlow && selectedStaff ? getStaffCalculatedSalary(selectedStaff) : "";
  const payableSalary = salaryCalculatedAmount ? `${salaryCalculatedAmount} AZN` : "0 AZN";

  function handleCategoryChange(value: string) {
    const nextCategory = cleanSelectValue(value);
    const nextCategoryName =
      nextCategory === addCategoryValue
        ? newCategoryName
        : data.categories.find((category) => category.id === nextCategory)?.name ?? "";

    setCategoryValue(nextCategory);

    if (!isPayrollCategoryName(nextCategoryName)) {
      setStaffTarget("");
      return;
    }

    if (selectedStaff) {
      setAmount(getStaffCalculatedSalary(selectedStaff));
    }
  }

  function handleNewCategoryNameChange(value: string) {
    setNewCategoryName(value);

    if (!isPayrollCategoryName(value)) {
      setStaffTarget("");
      return;
    }

    if (selectedStaff) {
      setAmount(getStaffCalculatedSalary(selectedStaff));
    }
  }

  function handleStaffChange(value: string) {
    const nextTarget = cleanSelectValue(value);
    const staff = data.staff.find((item) => item.id === nextTarget);
    setStaffTarget(nextTarget);

    if (!staff) {
      return;
    }

    if (usesPayrollFlow) {
      setAmount(getStaffCalculatedSalary(staff));
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="secondary" disabled={!data.permissions.canCreateExpense}>
          <Plus data-icon="inline-start" />
          Xerc elave et
        </Button>
      </DialogTrigger>
      <DialogContent className="finance-dialog finance-expense-dialog">
        <DialogHeader>
          <DialogTitle>Xerc elave et</DialogTitle>
          <DialogDescription>
            Kateqoriya, qebz, vendor ve ehtiyac varsa isci/maas hesablama snapshot-i ile xerc qeyd et.
          </DialogDescription>
        </DialogHeader>

        <form action={action} className="finance-form">
          <input
            type="hidden"
            name="categoryId"
            value={isAddingCategory ? "" : categoryValue}
          />
          <input type="hidden" name="staffTarget" value={staffTarget} />
          <input type="hidden" name="salaryMode" value={salaryMode} />
          <input
            type="hidden"
            name="salaryPercent"
            value={salaryMode === "PERCENT" && selectedStaff ? selectedStaff.salaryPercent : ""}
          />
          <input type="hidden" name="salaryBaseAmount" value={salaryBaseAmount} />
          <input type="hidden" name="salaryCalculatedAmount" value={salaryCalculatedAmount} />
          <input type="hidden" name="returnTo" value={data.returnTo} />

          <section className="finance-form-section">
            <div className="finance-form-section-title">
              <ReceiptText size={16} />
              <span>Xerc kateqoriyasi</span>
            </div>
            <div className="field-grid">
              <label className="form-field">
                <span>Kateqoriya</span>
                <FormSelect
                  name="categorySelector"
                  value={categoryValue}
                  onValueChange={handleCategoryChange}
                  emptyLabel="Kateqoriya secin"
                  options={[
                    ...data.categories.map((category) => ({
                      value: category.id,
                      label: category.name,
                    })),
                    { value: addCategoryValue, label: "+ Yeni kateqoriya" },
                  ]}
                />
              </label>
              <label className="form-field">
                <span>Yeni kateqoriya</span>
                <Input
                  name="newCategoryName"
                  value={newCategoryName}
                  onChange={(event) => handleNewCategoryNameChange(event.target.value)}
                  disabled={!isAddingCategory}
                  required={isAddingCategory}
                  maxLength={80}
                  placeholder="Mes: Temir"
                />
              </label>
            </div>
          </section>

          {usesPayrollFlow ? (
            <section className="finance-form-section">
              <div className="finance-form-section-title">
                <UserRound size={16} />
                <span>Isci ve maas hesablamasi</span>
              </div>
              <label className="form-field">
                <span>Isci siyahisi</span>
                <FormSelect
                  name="staffSelector"
                  value={staffTarget}
                  onValueChange={handleStaffChange}
                  emptyLabel="Isci secin"
                  searchable
                  searchPlaceholder="Isci ve ya muellim axtar..."
                  options={data.staff.map((staff) => ({
                    value: staff.id,
                    label: `${staff.label} / ${staff.kind === "teacher" ? "Muellim" : "Isci"} / ${staff.meta}`,
                  }))}
                  required
                />
              </label>

              {selectedStaff ? (
                <div className="finance-selected-record staff">
                  <div>
                    <strong>{selectedStaff.label}</strong>
                    <span>{selectedStaff.kind === "teacher" ? "Muellim" : "ERP iscisi"} / {selectedStaff.meta}</span>
                  </div>
                  <div>
                    <span>Maas tipi</span>
                    <StatusChip tone={selectedStaff.salaryMode === "PERCENT" ? "info" : "neutral"}>
                      {selectedStaff.salaryMode === "PERCENT" ? "Faiz esasli" : "Statik maas"}
                    </StatusChip>
                  </div>
                  <div>
                    <span>{selectedStaff.salaryMode === "PERCENT" ? "Formula" : "Statik mebleg"}</span>
                    <strong>{formatStaffSalaryFormula(selectedStaff)}</strong>
                  </div>
                  <div>
                    <span>Odenilmeli maas</span>
                    <strong>{payableSalary}</strong>
                  </div>
                </div>
              ) : (
                <div className="finance-salary-box">
                  <div className="finance-salary-head">
                    <div>
                      <span>Maas snapshot-i</span>
                      <strong>Isci secilmeyib</strong>
                    </div>
                  </div>
                </div>
              )}
            </section>
          ) : null}

          <section className="finance-form-section">
            <div className="finance-form-section-title">
              <FileText size={16} />
              <span>Xerc detallari ve qebz</span>
            </div>
            <div className="field-grid">
              <label className="form-field">
                <span>{usesPayrollFlow ? "Odenilecek mebleg" : "Mebleg"}</span>
                <Input
                  name="amount"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  inputMode="decimal"
                  placeholder={usesPayrollFlow ? payableSalary : "0.00"}
                  required
                />
              </label>
              <label className="form-field">
                <span>Tarix</span>
                <DatePicker name="expenseDate" defaultValue={data.filters.to} allowClear={false} required />
              </label>
            </div>
            <div className="field-grid">
              <label className="form-field">
                <span>Metod</span>
                <FormSelect name="method" defaultValue="CASH" options={studentPaymentMethodOptions} />
              </label>
              <label className="form-field">
                <span>Vendor / Tedarukcu</span>
                <Input name="vendor" maxLength={120} placeholder="Mes: Meta Ads, landlord, isci adi" />
              </label>
            </div>
            <div className="field-grid">
              <label className="form-field">
                <span>Qebz nomresi</span>
                <Input name="receiptReference" maxLength={120} placeholder="INV-2026-06" />
              </label>
              <label className="form-field">
                <span>Qebz yukle</span>
                <Input name="receiptFile" type="file" accept="image/*,.pdf" />
              </label>
            </div>
            <label className="form-field">
              <span>Aciqlama</span>
              <textarea name="description" maxLength={700} placeholder="Xercin sebebi, qebz qeydi, maas izahi" />
            </label>
          </section>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Legv et
              </Button>
            </DialogClose>
            <SubmitButton
              disabled={
                !categoryValue ||
                !amount ||
                (usesPayrollFlow && !selectedStaff) ||
                !data.permissions.canCreateExpense
              }
            >
              <Upload data-icon="inline-start" />
              Xerci saxla
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function OverviewWorkspace({ data }: { data: FinanceData }) {
  return (
    <div className="finance-overview-grid">
      <article className="finance-panel finance-overview-panel finance-overview-panel-wide">
        <div className="finance-panel-head">
          <div>
            <span>Umumi statistika</span>
            <h2>Pul axini snapshot-i</h2>
            <small>{data.filterLabels.period} / {data.filterLabels.category}</small>
          </div>
          <BarChart3 size={18} />
        </div>
        <div className="finance-cash-board">
          <div className="finance-cash-lead">
            <span>Net netice</span>
            <strong>{data.summary.net}</strong>
            <small>{data.summary.paymentCount} qebul / {data.summary.expenseCount} xerc qeydi</small>
          </div>
          <div className="finance-cash-grid">
            <div>
              <span>Daxil olan</span>
              <strong className="finance-money positive">{data.summary.income}</strong>
            </div>
            <div>
              <span>Xerc</span>
              <strong className="finance-money negative">{data.summary.expense}</strong>
            </div>
            <div>
              <span>Maas fondu</span>
              <strong>{data.summary.payroll}</strong>
            </div>
            <div>
              <span>Aciq borc</span>
              <strong className="finance-money warning">{data.summary.debt}</strong>
            </div>
          </div>
        </div>
      </article>

      <article className="finance-panel finance-overview-panel">
        <div className="finance-panel-head">
          <div>
            <span>Son qebullar</span>
            <h2>Odenis axini</h2>
            <small>{data.summary.paymentCount} emeliyyat</small>
          </div>
          <Banknote size={18} />
        </div>
        <div className="finance-overview-list">
          {data.payments.slice(0, 4).length > 0 ? (
            data.payments.slice(0, 4).map((payment) => (
              <div className="finance-overview-row" key={payment.id}>
                <div>
                  <strong>{payment.studentName}</strong>
                  <span>{payment.paidAt} / {payment.method}</span>
                </div>
                <b className="finance-money positive">{payment.amount}</b>
              </div>
            ))
          ) : (
            <div className="finance-overview-empty">Bu dovrde odenis yoxdur</div>
          )}
        </div>
      </article>

      <article className="finance-panel finance-overview-panel">
        <div className="finance-panel-head">
          <div>
            <span>Borc nezareti</span>
            <h2>Riskli balanslar</h2>
            <small>{data.summary.debtors} telebe</small>
          </div>
          <AlertTriangle size={18} />
        </div>
        <div className="finance-overview-list">
          {data.debtors.slice(0, 4).length > 0 ? (
            data.debtors.slice(0, 4).map((debt) => (
              <div className="finance-overview-row" key={debt.id}>
                <div>
                  <strong>{debt.studentName}</strong>
                  <span>{debt.nextDueDate} / {debt.overdueDays}</span>
                </div>
                <b className="finance-money warning">{debt.balance}</b>
              </div>
            ))
          ) : (
            <div className="finance-overview-empty">Aciq borc yoxdur</div>
          )}
        </div>
      </article>

      <article className="finance-panel finance-overview-panel">
        <div className="finance-panel-head">
          <div>
            <span>Maas hazirligi</span>
            <h2>Hesablanan maaslar</h2>
            <small>{data.summary.payroll}</small>
          </div>
          <Calculator size={18} />
        </div>
        <div className="finance-overview-list">
          {data.payrollItems.slice(0, 4).length > 0 ? (
            data.payrollItems.slice(0, 4).map((payroll) => (
              <div className="finance-overview-row" key={payroll.id}>
                <div>
                  <strong>{payroll.staffName}</strong>
                  <span>{payroll.salaryMode} / {payroll.expenseDate}</span>
                </div>
                <b className="finance-money negative">{payroll.amount}</b>
              </div>
            ))
          ) : (
            <div className="finance-overview-empty">Maas xerc qeydi yoxdur</div>
          )}
        </div>
      </article>
    </div>
  );
}

function PaymentLedger({ payments }: { payments: FinanceData["payments"] }) {
  return (
    <article className="finance-panel">
      <div className="finance-panel-head">
        <div>
          <span>Gelir ledger-i</span>
          <h2>Odenis qebulu</h2>
          <small>{payments.length} setir gosterilir</small>
        </div>
        <BadgeDollarSign size={18} />
      </div>
      <div className="finance-table-wrap">
        <table className="finance-table">
          <thead>
            <tr>
              <th>Telebe</th>
              <th>Odeyen</th>
              <th>Mebleg</th>
              <th>Tarix</th>
              <th>Ay</th>
              <th>Metod</th>
              <th>Qebz</th>
              <th>Qeyd</th>
            </tr>
          </thead>
          <tbody>
            {payments.length > 0 ? (
              payments.map((payment) => (
                <tr key={payment.id}>
                  <td>
                    <div className="finance-entity-cell">
                      <strong>{payment.studentName}</strong>
                      <span>{payment.studentCode}</span>
                    </div>
                  </td>
                  <td>{payment.payerName}</td>
                  <td className="finance-money positive">{payment.amount}</td>
                  <td>{payment.paidAt}</td>
                  <td>{payment.paymentMonth}</td>
                  <td><span className="payment-method-chip">{payment.method}</span></td>
                  <td>{payment.receipt}</td>
                  <td>{payment.note}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8}>
                  <div className="finance-empty">Secilmis dovrde odenis tapilmadi</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function DebtLedger({ debtors }: { debtors: FinanceData["debtors"] }) {
  return (
    <article className="finance-panel">
      <div className="finance-panel-head">
        <div>
          <span>Borc ledger-i</span>
          <h2>Aciq borclar</h2>
          <small>{debtors.length} balans gosterilir</small>
        </div>
        <AlertTriangle size={18} />
      </div>
      <div className="finance-table-wrap">
        <table className="finance-table finance-debt-table">
          <thead>
            <tr>
              <th>Telebe</th>
              <th>Proqram / muellim</th>
              <th>Borc</th>
              <th>Novbeti son tarix</th>
              <th>Gecikme</th>
              <th>Telefon</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {debtors.length > 0 ? (
              debtors.map((debt) => (
                <tr key={debt.id}>
                  <td>
                    <div className="finance-entity-cell">
                      <strong>{debt.studentName}</strong>
                      <span>{debt.studentCode}</span>
                    </div>
                  </td>
                  <td>
                    <div className="finance-entity-cell">
                      <strong>{debt.program}</strong>
                      <span>{debt.teacher}</span>
                    </div>
                  </td>
                  <td className="finance-money warning">{debt.balance}</td>
                  <td>{debt.nextDueDate}</td>
                  <td>{debt.overdueDays}</td>
                  <td>{debt.phone}</td>
                  <td><StatusChip tone={debt.tone}>{formatDebtStatus(debt.tone)}</StatusChip></td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7}>
                  <div className="finance-empty">Aciq borc tapilmadi</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function ExpenseLedger({ expenses }: { expenses: FinanceData["expenses"] }) {
  return (
    <article className="finance-panel">
      <div className="finance-panel-head">
        <div>
          <span>Xerc ledger-i</span>
          <h2>Kateqoriyalar uzre xercler</h2>
          <small>{expenses.length} xerc qeydi</small>
        </div>
        <ReceiptText size={18} />
      </div>
      <div className="finance-table-wrap">
        <table className="finance-table">
          <thead>
            <tr>
              <th>Kateqoriya</th>
              <th>Mebleg</th>
              <th>Tarix</th>
              <th>Vendor</th>
              <th>Metod</th>
              <th>Qebz</th>
              <th>Aciqlama</th>
            </tr>
          </thead>
          <tbody>
            {expenses.length > 0 ? (
              expenses.map((expense) => (
                <tr key={expense.id}>
                  <td>
                    <div className="finance-entity-cell">
                      <strong>{expense.category}</strong>
                      <span>{expense.description}</span>
                    </div>
                  </td>
                  <td className="finance-money negative">{expense.amount}</td>
                  <td>{expense.expenseDate}</td>
                  <td>
                    <div className="finance-entity-cell">
                      <strong>{expense.vendor}</strong>
                      <span>{expense.staffName}</span>
                    </div>
                  </td>
                  <td><span className="payment-method-chip">{expense.method}</span></td>
                  <td>{expense.receipt}</td>
                  <td>{expense.description}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7}>
                  <div className="finance-empty">Secilmis filtrlerle xerc tapilmadi</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function PayrollLedger({ payrollItems }: { payrollItems: FinanceData["payrollItems"] }) {
  return (
    <article className="finance-panel">
      <div className="finance-panel-head">
        <div>
          <span>Maas ledger-i</span>
          <h2>Statik ve faizli maaslar</h2>
          <small>{payrollItems.length} maas qeydi</small>
        </div>
        <Calculator size={18} />
      </div>
      <div className="finance-table-wrap">
        <table className="finance-table">
          <thead>
            <tr>
              <th>Isci / muellim</th>
              <th>Kateqoriya</th>
              <th>Mebleg</th>
              <th>Tarix</th>
              <th>Maas tipi</th>
              <th>Formula</th>
              <th>Metod</th>
              <th>Qebz</th>
            </tr>
          </thead>
          <tbody>
            {payrollItems.length > 0 ? (
              payrollItems.map((payroll) => (
                <tr key={payroll.id}>
                  <td>
                    <div className="finance-entity-cell">
                      <strong>{payroll.staffName}</strong>
                      <span>{payroll.vendor}</span>
                    </div>
                  </td>
                  <td>
                    <div className="finance-entity-cell">
                      <strong>{payroll.category}</strong>
                      <span>{payroll.description}</span>
                    </div>
                  </td>
                  <td className="finance-money negative">{payroll.amount}</td>
                  <td>{payroll.expenseDate}</td>
                  <td>{payroll.salaryMode}</td>
                  <td>{payroll.salaryFormula}</td>
                  <td><span className="payment-method-chip">{payroll.method}</span></td>
                  <td>{payroll.receipt}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8}>
                  <div className="finance-empty">Secilmis dovrde maas qeydi tapilmadi</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function SubmitButton({
  children,
  disabled,
}: {
  children: ReactNode;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending || disabled}>
      {children}
      {pending ? "Hazirlanir..." : null}
    </Button>
  );
}

function buildFinanceTabHref(data: FinanceData, tab: FinanceTab) {
  const query: Record<string, string> = {};

  if (data.filters.query) {
    query.q = data.filters.query;
  }

  if (data.filters.category) {
    query.category = data.filters.category;
  }

  if (tab !== "overview") {
    query.type = tab;
  }

  if (data.filters.from) {
    query.from = data.filters.from;
  }

  if (data.filters.to) {
    query.to = data.filters.to;
  }

  return {
    pathname: "/finance" as const,
    query,
  };
}

function formatDebtStatus(tone: FinanceData["debtors"][number]["tone"]) {
  if (tone === "danger") {
    return "Kritik";
  }

  if (tone === "warning") {
    return "Gecikir";
  }

  return "Planli";
}

function cleanSelectValue(value: string) {
  return value === EMPTY_SELECT_VALUE ? "" : value;
}

function isPayrollCategoryName(value: string) {
  const normalized = normalizeKeyword(value);
  return [
    "maas",
    "emekhaqqi",
    "emek haqqi",
    "salary",
    "payroll",
    "isci",
    "employee",
    "staff",
    "worker",
  ].some((keyword) => normalized.includes(keyword));
}

function normalizeKeyword(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[ə]/g, "e")
    .replace(/[ı]/g, "i")
    .replace(/[ş]/g, "s")
    .replace(/[ç]/g, "c")
    .replace(/[ğ]/g, "g")
    .replace(/[ö]/g, "o")
    .replace(/[ü]/g, "u");
}

function getStaffSalaryBase(staff: FinanceData["staff"][number]) {
  return staff.salaryMode === "PERCENT"
    ? staff.salaryBase
    : staff.staticSalary || staff.calculatedSalary;
}

function getStaffCalculatedSalary(staff: FinanceData["staff"][number]) {
  return staff.calculatedSalary || staff.staticSalary || "";
}

function formatStaffSalaryFormula(staff: FinanceData["staff"][number]) {
  if (staff.salaryMode === "PERCENT") {
    return `${staff.salaryBase || "0"} AZN x ${staff.salaryPercent || "0"}%`;
  }

  return `${staff.staticSalary || staff.calculatedSalary || "0"} AZN`;
}
