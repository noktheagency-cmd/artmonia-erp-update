"use client";

import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import {
  AlertTriangle,
  ArrowDownToLine,
  BadgeDollarSign,
  Banknote,
  BarChart3,
  Calculator,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  ListFilter,
  Pencil,
  Plus,
  ReceiptText,
  Search,
  Trash2,
  Upload,
  UserRound,
  WalletCards,
  XCircle,
} from "lucide-react";
import { createPortal, useFormStatus } from "react-dom";
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
    label: "Ümumi baxış",
    description: (data) => data.summary.net,
    icon: BarChart3,
  },
  {
    value: "payments",
    label: "Ödənişlər",
    description: (data) => `${data.summary.paymentCount} əməliyyat`,
    icon: Banknote,
  },
  {
    value: "debts",
    label: "Alacaqlar",
    description: (data) => `${data.summary.debtors} tələbə`,
    icon: AlertTriangle,
  },
  {
    value: "expenses",
    label: "Xərclər",
    description: (data) => `${data.summary.expenseCount} qeyd`,
    icon: ReceiptText,
  },
  {
    value: "payroll",
    label: "Əməkhaqqı",
    description: (data) => data.summary.payroll,
    icon: Calculator,
  },
];

const financeKpiIcons = [Banknote, ReceiptText, BarChart3, Calculator, AlertTriangle];

type FinanceFilterDraft = {
  query: string;
  category: string;
  from: string;
  to: string;
};

type FinanceToastTone = "success" | "danger";

type FinanceToastMessage = {
  id: number;
  tone: FinanceToastTone;
  title: string;
  body: string;
};

type FinanceMutationResult = {
  ok: true;
  redirectTo: string;
};

type FinanceMutationAction = (formData: FormData) => Promise<FinanceMutationResult>;

export function FinanceWorkspace({
  data,
  recordPaymentAction,
  createExpenseAction,
  updatePaymentAction,
  deletePaymentAction,
  updateExpenseAction,
  deleteExpenseAction,
}: {
  data: FinanceData;
  recordPaymentAction: FinanceMutationAction;
  createExpenseAction: FinanceMutationAction;
  updatePaymentAction: FinanceMutationAction;
  deletePaymentAction: FinanceMutationAction;
  updateExpenseAction: FinanceMutationAction;
  deleteExpenseAction: FinanceMutationAction;
}) {
  const [toast, setToast] = useState<FinanceToastMessage | null>(null);

  function showToast(message: Omit<FinanceToastMessage, "id">) {
    setToast({ ...message, id: Date.now() });
  }

  return (
    <section className="page-stack finance-page">
      <FinanceOperationToast toast={toast} onToastChange={setToast} />
      <header className="finance-hero">
        <div className="finance-hero-head">
          <div className="finance-header-main">
            <div className="finance-scope-row">
              <span>Artmonia ERP</span>
              <span>{data.filterLabels.period}</span>
              <span>Maliyyə</span>
            </div>
            <div className="finance-title-block">
              <h1>Maliyyə paneli</h1>
              <p>Gəlirlər, xərclər, alacaqlar və qəbzlər bir yerdə aydın görünür.</p>
            </div>
          </div>
          <div className="finance-header-actions">
            <PaymentDialog
            data={data}
            action={recordPaymentAction}
            onNotify={showToast}
          />
          <ExpenseDialog
            data={data}
            action={createExpenseAction}
            onNotify={showToast}
          />
          </div>
        </div>
        <FinanceCommandBar key={`filters-${data.returnTo}`} data={data} />
      </header>

      <div className="finance-kpi-grid" aria-label="Maliyyə göstəriciləri">
        {data.kpis.map((kpi, index) => {
          const Icon = financeKpiIcons[index] ?? BarChart3;

          return (
            <article className={`finance-kpi is-${kpi.tone}`} key={kpi.label}>
              <div className="finance-kpi-top">
                <span className="finance-kpi-label">{kpi.label}</span>
                <span className="finance-kpi-icon">
                  <Icon size={12} />
                </span>
              </div>
              <strong>{kpi.value}</strong>
              <div className="finance-kpi-footer">
                <small>{kpi.helper}</small>
              </div>
            </article>
          );
        })}
      </div>

      <FinanceTabs data={data} />

      <div className="finance-tab-panel" key={data.filters.type}>
        {data.filters.type === "overview" ? <OverviewWorkspace data={data} /> : null}
        {data.filters.type === "payments" ? (
          <PaymentLedger
            data={data}
            payments={data.payments}
            updateAction={updatePaymentAction}
            deleteAction={deletePaymentAction}
            onNotify={showToast}
          />
        ) : null}
        {data.filters.type === "debts" ? <DebtLedger debtors={data.debtors} /> : null}
        {data.filters.type === "expenses" ? (
          <ExpenseLedger
            data={data}
            expenses={data.expenses}
            updateAction={updateExpenseAction}
            deleteAction={deleteExpenseAction}
            onNotify={showToast}
          />
        ) : null}
        {data.filters.type === "payroll" ? (
          <PayrollLedger
            data={data}
            payrollItems={data.payrollItems}
            updateAction={updateExpenseAction}
            deleteAction={deleteExpenseAction}
            onNotify={showToast}
          />
        ) : null}
      </div>
    </section>
  );
}

function FinanceOperationToast({
  toast,
  onToastChange,
}: {
  toast: FinanceToastMessage | null;
  onToastChange: (message: FinanceToastMessage | null) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const notice = searchParams.get("financeNotice");

    if (!notice) {
      return;
    }

    const messages: Record<string, Omit<FinanceToastMessage, "id">> = {
      "payment-created": {
        tone: "success",
        title: "Ödəniş qəbul edildi",
        body: "Qəbz və alacaq balansı uğurla yeniləndi.",
      },
      "expense-created": {
        tone: "success",
        title: "Xərc saxlanıldı",
        body: "Xərc qeydi maliyyə cədvəllərinə əlavə edildi.",
      },
      "payment-updated": {
        tone: "success",
        title: "Ödəniş yeniləndi",
        body: "Ödəniş və alacaq balansı yenidən hesablandı.",
      },
      "payment-deleted": {
        tone: "success",
        title: "Ödəniş silindi",
        body: "Faktura balansları geri yeniləndi.",
      },
      "expense-updated": {
        tone: "success",
        title: "Xərc yeniləndi",
        body: "Xərc məlumatları uğurla saxlanıldı.",
      },
      "expense-deleted": {
        tone: "success",
        title: "Xərc silindi",
        body: "Maliyyə cədvəlləri yeniləndi.",
      },
    };
    const message = messages[notice];

    if (message) {
      onToastChange({ ...message, id: Date.now() });
    }

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("financeNotice");
    const nextQuery = nextParams.toString();
    router.replace((nextQuery ? `${pathname}?${nextQuery}` : pathname) as Route, { scroll: false });
  }, [onToastChange, pathname, router, searchParams]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeoutId = window.setTimeout(() => onToastChange(null), 4600);
    return () => window.clearTimeout(timeoutId);
  }, [onToastChange, toast]);

  if (!toast || typeof document === "undefined") {
    return null;
  }

  const Icon = toast.tone === "success" ? CheckCircle2 : XCircle;

  return createPortal(
    <div className="finance-toast-viewport" role="status" aria-live="polite">
      <div className={`finance-toast is-${toast.tone}`} key={toast.id}>
        <span className="finance-toast-icon">
          <Icon size={18} />
        </span>
        <div>
          <strong>{toast.title}</strong>
          <p>{toast.body}</p>
        </div>
        <button type="button" onClick={() => onToastChange(null)} aria-label="Bildirişi bağla">
          ×
        </button>
      </div>
    </div>,
    document.body
  );
}

function getTabCount(tabValue: FinanceTab, data: FinanceData): number {
  switch (tabValue) {
    case "overview":
      return data.payments.length + data.expenses.length + data.debtors.length;
    case "payments":
      return data.payments.length;
    case "debts":
      return data.debtors.length;
    case "expenses":
      return data.expenses.length;
    case "payroll":
      return data.payrollItems.length;
    default:
      return 0;
  }
}

function FinanceTabs({ data }: { data: FinanceData }) {
  return (
    <nav className="finance-tabs" aria-label="Maliyyə bölmələri">
      {financeTabs.map((tab) => {
        const isActive = data.filters.type === tab.value;
        const count = getTabCount(tab.value, data);

        return (
          <Link
            aria-current={isActive ? "page" : undefined}
            className={`finance-tab${isActive ? " is-active" : ""}`}
            href={buildFinanceTabHref(data, tab.value)}
            key={tab.value}
          >
            <span className="finance-tab-copy">
              <span>{tab.label}</span>
              <strong>{count}</strong>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

function FinanceCommandBar({ data }: { data: FinanceData }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState<FinanceFilterDraft>(() => ({
    query: data.filters.query,
    category: data.filters.category,
    from: data.filters.from,
    to: data.filters.to,
  }));
  const presets = useMemo(() => buildPeriodPresets(), []);

  function applyFilters(nextDraft: FinanceFilterDraft, mode: "push" | "replace" = "replace") {
    setDraft(nextDraft);
    startTransition(() => {
      const href = buildFinanceFilterPath(data, nextDraft);
      if (mode === "push") {
        router.push(href as Route);
        return;
      }

      router.replace(href as Route);
    });
  }

  function updateDraft(nextValues: Partial<FinanceFilterDraft>, mode: "push" | "replace" = "replace") {
    applyFilters({ ...draft, ...nextValues }, mode);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    applyFilters(draft, "push");
  }

  return (
    <form className={`finance-command-bar${isPending ? " is-loading" : ""}`} action="/finance" onSubmit={handleSubmit}>
      {data.filters.type !== "overview" ? (
        <input type="hidden" name="type" value={data.filters.type} />
      ) : null}

      <div className="finance-filter-row">
        <label className="table-search finance-search">
          <Search size={14} />
          <span className="sr-only">Maliyyə üzrə axtar</span>
          <input
            name="q"
            value={draft.query}
            onChange={(event) => setDraft((current) => ({ ...current, query: event.target.value }))}
            placeholder="Axtar: tələbə, qəbz, alacaq, kateqoriya"
            suppressHydrationWarning
          />
        </label>

        <div className="finance-filter-field date">
          <DatePicker
            name="from"
            value={draft.from}
            onValueChange={(value) => updateDraft({ from: value })}
            allowClear={false}
            popoverPlacement="floating"
          />
        </div>

        <div className="finance-filter-field date">
          <DatePicker
            name="to"
            value={draft.to}
            onValueChange={(value) => updateDraft({ to: value })}
            allowClear={false}
            popoverPlacement="floating"
          />
        </div>

        <div className="finance-filter-field">
          <FormSelect
            name="category"
            defaultValue={draft.category || undefined}
            onValueChange={(value) => updateDraft({ category: cleanSelectValue(value) })}
            placeholder="Bütün kateqoriyalar"
            emptyLabel="Bütün kateqoriyalar"
            searchable
            searchPlaceholder="Kateqoriya axtar..."
            options={data.categories.map((category) => ({
              value: category.id,
              label: category.name,
            }))}
          />
        </div>

        <div className="finance-filter-actions">
          <Button type="submit" size="sm" disabled={isPending}>
            <ListFilter data-icon="inline-start" size={13} />
            {isPending ? "Yenilənir..." : "Göstər"}
          </Button>
          {data.filters.activeCount > 0 ? (
            <Link className="ui-button ui-button-ghost ui-button-sm" href="/finance">
              Təmizlə
            </Link>
          ) : null}
        </div>
      </div>

      <div className="finance-filter-presets">
        <div className="finance-preset-pills">
          {presets.map((preset) => {
            const isActive = draft.from === preset.from && draft.to === preset.to;

            return (
              <button
                type="button"
                key={preset.id}
                className={isActive ? "is-active" : undefined}
                onClick={() => applyFilters({ ...draft, from: preset.from, to: preset.to })}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
        <span className="finance-preset-info-text">
          Seçilən tarix və kateqoriya bütün cədvəllərə tətbiq olunur
        </span>
      </div>
    </form>
  );
}

function PaymentDialog({
  data,
  action,
  onNotify,
}: {
  data: FinanceData;
  action: FinanceMutationAction;
  onNotify: (message: Omit<FinanceToastMessage, "id">) => void;
}) {
  const router = useRouter();
  const [isSubmitting, startSubmitTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const selectedStudent = data.students.find((student) => student.id === selectedStudentId);
  const [values, setValues] = useState({
    amount: "",
    paidDate: data.students[0]?.defaultPaymentDate ?? "",
    paymentMonth: getNextPaymentDate(data.students[0]?.defaultPaymentDate ?? ""),
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
        paymentMonth: getNextPaymentDate(student.defaultPaymentDate),
        payerName: student.name,
      }));
    }
  }

  function handlePaidDateChange(value: string) {
    setValues((current) => ({
      ...current,
      paidDate: value,
      paymentMonth: getNextPaymentDate(value),
    }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startSubmitTransition(async () => {
      try {
        const result = await action(formData);
        setIsOpen(false);
        router.push(result.redirectTo as Route);
      } catch (error) {
        onNotify({
          tone: "danger",
          title: "Ödəniş qəbul edilmədi",
          body: getActionErrorMessage(error),
        });
      }
    });
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button type="button" disabled={!data.permissions.canRecordPayment}>
          <Banknote data-icon="inline-start" />
          Ödəniş əlavə et
        </Button>
      </DialogTrigger>
      <DialogContent className="finance-dialog finance-payment-dialog">
        <DialogHeader className="dialog-header-custom">
          <DialogTitle>Ödəniş qəbul et</DialogTitle>
          <DialogDescription>
            Tələbəni seç, qəbzi əlavə et və məbləği açıq fakturalara avtomatik bölüşdür.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="finance-form">
          <input type="hidden" name="studentId" value={selectedStudentId} />
          <input type="hidden" name="returnTo" value={data.returnTo} />

          <section className="finance-form-section">
            <div className="finance-form-section-title">
              <UserRound size={16} />
              <span>Tələbə və ödəniş</span>
            </div>
            <label className="form-field">
              <span>Ödəniş hansı tələbəyə aiddir?</span>
              <FormSelect
                name="studentSelector"
                value={selectedStudentId}
                onValueChange={handleStudentChange}
                emptyLabel="Tələbə seç"
                searchable
                searchPlaceholder="Tələbə axtar..."
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
                  <span>Müəllim</span>
                  <strong>{selectedStudent.teacher}</strong>
                </div>
                <div>
                  <span>Alacaq</span>
                  <strong>{selectedStudent.balance}</strong>
                </div>
              </div>
            ) : null}
          </section>

          <section className="finance-form-section">
            <div className="finance-form-section-title">
              <WalletCards size={16} />
              <span>Ödəniş detalları</span>
            </div>
            <div className="field-grid">
              <label className="form-field">
                <span>Məbləğ</span>
                <Input
                  name="amount"
                  value={values.amount}
                  onChange={(event) => setValues((current) => ({ ...current, amount: event.target.value }))}
                  inputMode="decimal"
                  required
                />
              </label>
              <label className="form-field">
                <span>Ödəniş üsulu</span>
                <FormSelect name="method" defaultValue="CASH" options={studentPaymentMethodOptions} />
              </label>
            </div>
            <div className="field-grid">
              <label className="form-field">
                <span>Ödəniş tarixi</span>
                <DatePicker
                  name="paidDate"
                  value={values.paidDate}
                  onValueChange={handlePaidDateChange}
                  allowClear={false}
                  popoverPlacement="floating"
                  required
                />
              </label>
              <label className="form-field">
                <span>Növbəti ödəniş tarixi</span>
                <DatePicker
                  name="paymentMonth"
                  value={values.paymentMonth}
                  onValueChange={(value) => setValues((current) => ({ ...current, paymentMonth: value }))}
                  allowClear={false}
                  popoverPlacement="floating"
                  required
                />
              </label>
            </div>
            <div className="field-grid">
              <label className="form-field">
                <span>Ödəyən şəxs</span>
                <Input
                  name="payerName"
                  value={values.payerName}
                  onChange={(event) => setValues((current) => ({ ...current, payerName: event.target.value }))}
                  maxLength={120}
                />
              </label>
              <label className="form-field">
                <span>Qəbz nömrəsi</span>
                <Input name="receiptReference" maxLength={120} placeholder="Məs: POS-10293" />
              </label>
            </div>
            <label className="form-field">
              <span>Qəbz əlavə et</span>
              <span className="finance-file-control">
                <Upload size={14} />
                <strong>Fayl seç</strong>
                <small>PDF / şəkil</small>
                <Input name="receiptFile" type="file" accept="image/*,.pdf" />
              </span>
            </label>
            <label className="form-field">
              <span>Qeyd</span>
              <Input name="note" maxLength={500} placeholder="Bank, terminal və ya əlavə qeyd" />
            </label>
          </section>

          <DialogFooter className="dialog-footer-custom">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Ləğv et
              </Button>
            </DialogClose>
            <SubmitButton isPending={isSubmitting} disabled={!selectedStudentId || !data.permissions.canRecordPayment}>
              <ArrowDownToLine data-icon="inline-start" />
              Ödənişi qəbul et
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
  onNotify,
}: {
  data: FinanceData;
  action: FinanceMutationAction;
  onNotify: (message: Omit<FinanceToastMessage, "id">) => void;
}) {
  const router = useRouter();
  const [isSubmitting, startSubmitTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(false);
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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startSubmitTransition(async () => {
      try {
        const result = await action(formData);
        setIsOpen(false);
        router.push(result.redirectTo as Route);
      } catch (error) {
        onNotify({
          tone: "danger",
          title: "Xərc saxlanılmadı",
          body: getActionErrorMessage(error),
        });
      }
    });
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="secondary" disabled={!data.permissions.canCreateExpense}>
          <Plus data-icon="inline-start" />
          Xərc əlavə et
        </Button>
      </DialogTrigger>
      <DialogContent className="finance-dialog finance-expense-dialog">
        <DialogHeader className="dialog-header-custom">
          <DialogTitle>Xərc əlavə et</DialogTitle>
          <DialogDescription>
            Xərc kateqoriyasını, qəbzi, təchizatçını və lazım olduqda əməkhaqqı hesablamasını qeyd et.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="finance-form">
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
              <span>Xərc kateqoriyası</span>
            </div>
            <div className="field-grid">
              <label className="form-field">
                <span>Kateqoriya</span>
                <FormSelect
                  name="categorySelector"
                  value={categoryValue}
                  onValueChange={handleCategoryChange}
                  emptyLabel="Kateqoriya seç"
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
                  placeholder="Məs: Təmir"
                />
              </label>
            </div>
          </section>

          {usesPayrollFlow ? (
            <section className="finance-form-section">
              <div className="finance-form-section-title">
              <UserRound size={16} />
                <span>Əməkdaş və əməkhaqqı hesablaması</span>
              </div>
              <label className="form-field">
                <span>Əməkdaş siyahısı</span>
                <FormSelect
                  name="staffSelector"
                  value={staffTarget}
                  onValueChange={handleStaffChange}
                  emptyLabel="Əməkdaş seç"
                  searchable
                  searchPlaceholder="Əməkdaş və ya müəllim axtar..."
                  options={data.staff.map((staff) => ({
                    value: staff.id,
                    label: `${staff.label} / ${staff.kind === "teacher" ? "Müəllim" : "Əməkdaş"} / ${staff.meta}`,
                  }))}
                  required
                />
              </label>

              {selectedStaff ? (
                <div className="finance-selected-record staff">
                  <div>
                    <strong>{selectedStaff.label}</strong>
                    <span>{selectedStaff.kind === "teacher" ? "Müəllim" : "ERP əməkdaşı"} / {selectedStaff.meta}</span>
                  </div>
                  <div>
                    <span>Əməkhaqqı növü</span>
                    <StatusChip tone={selectedStaff.salaryMode === "PERCENT" ? "info" : "neutral"}>
                      {selectedStaff.salaryMode === "PERCENT" ? "Faiz əsaslı" : "Sabit əməkhaqqı"}
                    </StatusChip>
                  </div>
                  <div>
                    <span>{selectedStaff.salaryMode === "PERCENT" ? "Formula" : "Sabit məbləğ"}</span>
                    <strong>{formatStaffSalaryFormula(selectedStaff)}</strong>
                  </div>
                  <div>
                    <span>Ödəniləcək əməkhaqqı</span>
                    <strong>{payableSalary}</strong>
                  </div>
                </div>
              ) : (
                <div className="finance-salary-box">
                  <div className="finance-salary-head">
                    <div>
                      <span>Əməkhaqqı hesablaması</span>
                      <strong>Əməkdaş seçilməyib</strong>
                    </div>
                  </div>
                </div>
              )}
            </section>
          ) : null}

          <section className="finance-form-section">
            <div className="finance-form-section-title">
              <FileText size={16} />
              <span>Xərc detalları və qəbz</span>
            </div>
            <div className="field-grid">
              <label className="form-field">
                <span>{usesPayrollFlow ? "Ödəniləcək məbləğ" : "Məbləğ"}</span>
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
                <DatePicker
                  name="expenseDate"
                  defaultValue={data.filters.to}
                  allowClear={false}
                  popoverPlacement="floating"
                  required
                />
              </label>
            </div>
            <div className="field-grid">
              <label className="form-field">
                <span>Ödəniş üsulu</span>
                <FormSelect name="method" defaultValue="CASH" options={studentPaymentMethodOptions} />
              </label>
              <label className="form-field">
                <span>Təchizatçı / mənbə</span>
                <Input name="vendor" maxLength={120} placeholder="Məs: Meta Ads, icarəçi, əməkdaş adı" />
              </label>
            </div>
            <div className="field-grid">
              <label className="form-field">
                <span>Qəbz nömrəsi</span>
                <Input name="receiptReference" maxLength={120} placeholder="INV-2026-06" />
              </label>
              <label className="form-field">
                <span>Qəbz əlavə et</span>
                <span className="finance-file-control">
                  <Upload size={14} />
                  <strong>Fayl seç</strong>
                  <small>PDF / şəkil</small>
                  <Input name="receiptFile" type="file" accept="image/*,.pdf" />
                </span>
              </label>
            </div>
            <label className="form-field">
              <span>Açıqlama</span>
              <textarea name="description" maxLength={700} placeholder="Xərcin səbəbi, qəbz qeydi və ya əməkhaqqı izahı" />
            </label>
          </section>

          <DialogFooter className="dialog-footer-custom">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Ləğv et
              </Button>
            </DialogClose>
            <SubmitButton
              isPending={isSubmitting}
              disabled={
                !categoryValue ||
                !amount ||
                (usesPayrollFlow && !selectedStaff) ||
                !data.permissions.canCreateExpense
              }
            >
              <Upload data-icon="inline-start" />
              Xərci saxla
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CashFlowChart({ data }: { data: FinanceData }) {
  const expenseMovements = useMemo(
    () => [...data.expenses, ...data.payrollItems],
    [data.expenses, data.payrollItems]
  );
  const dates = useMemo(() => {
    const set = new Set<string>();
    data.payments.forEach((payment) => {
      if (payment.dateKey) {
        set.add(payment.dateKey);
      }
    });
    expenseMovements.forEach((expense) => {
      if (expense.dateKey) {
        set.add(expense.dateKey);
      }
    });
    const list = Array.from(set);
    list.sort();
    return list;
  }, [data.payments, expenseMovements]);

  const trendPoints = useMemo(() => {
    if (dates.length === 0) {
      return [
        { date: "", income: 0, expense: 0, net: 0 },
        { date: "", income: 0, expense: 0, net: 0 },
      ];
    }
    let accumulatedIncome = 0;
    let accumulatedExpense = 0;
    return dates.map(date => {
      const dayIncome = data.payments
        .filter((payment) => payment.dateKey === date)
        .reduce((sum, payment) => sum + payment.amountValue, 0);
      const dayExpense = expenseMovements
        .filter((expense) => expense.dateKey === date)
        .reduce((sum, expense) => sum + expense.amountValue, 0);
      accumulatedIncome += dayIncome;
      accumulatedExpense += dayExpense;
      return {
        date,
        income: accumulatedIncome,
        expense: accumulatedExpense,
        net: accumulatedIncome - accumulatedExpense,
      };
    });
  }, [dates, data.payments, expenseMovements]);

  const maxVal = useMemo(() => {
    let highest = 100;
    trendPoints.forEach(p => {
      if (p.income > highest) highest = p.income;
      if (p.expense > highest) highest = p.expense;
      if (Math.abs(p.net) > highest) highest = Math.abs(p.net);
    });
    return highest * 1.15;
  }, [trendPoints]);

  const pts = useMemo(() => {
    const count = trendPoints.length;
    return trendPoints.map((p, i) => {
      const x = count > 1 ? 50 + (i / (count - 1)) * 390 : 245;
      const yIncome = 170 - (p.income / maxVal) * 150;
      const yExpense = 170 - (p.expense / maxVal) * 150;
      const yNet = 170 - (p.net / maxVal) * 150;
      return {
        ...p,
        x,
        yIncome: Math.max(10, Math.min(175, yIncome)),
        yExpense: Math.max(10, Math.min(175, yExpense)),
        yNet: Math.max(10, Math.min(175, yNet)),
      };
    });
  }, [trendPoints, maxVal]);

  const incomePoints = pts.map(p => `${p.x},${p.yIncome}`).join(" L ");
  const expensePoints = pts.map(p => `${p.x},${p.yExpense}`).join(" L ");
  const netPoints = pts.map(p => `${p.x},${p.yNet}`).join(" L ");

  const incomeAreaD = `M 50,170 L ${incomePoints} L ${pts[pts.length - 1].x},170 Z`;
  const expenseAreaD = `M 50,170 L ${expensePoints} L ${pts[pts.length - 1].x},170 Z`;

  return (
    <div className="finance-svg-chart-container" style={{ position: "relative" }}>
      <svg viewBox="0 0 460 210" className="finance-svg-chart">
        {/* Grids */}
        <line x1="50" y1="20" x2="440" y2="20" className="chart-grid-line" />
        <line x1="50" y1="70" x2="440" y2="70" className="chart-grid-line" />
        <line x1="50" y1="120" x2="440" y2="120" className="chart-grid-line" />
        <line x1="50" y1="170" x2="440" y2="170" className="chart-axis-line" stroke="var(--fin-border)" />

        {/* Y Axis */}
        <text x="40" y="24" textAnchor="end" className="chart-text-label">{(maxVal).toFixed(0)}</text>
        <text x="40" y="74" textAnchor="end" className="chart-text-label">{(maxVal * 0.66).toFixed(0)}</text>
        <text x="40" y="124" textAnchor="end" className="chart-text-label">{(maxVal * 0.33).toFixed(0)}</text>
        <text x="40" y="174" textAnchor="end" className="chart-text-label">0</text>

        {/* Area gradients */}
        <path d={incomeAreaD} className="chart-area-path" fill="var(--fin-success)" opacity="0.04" />
        <path d={expenseAreaD} className="chart-area-path" fill="var(--fin-danger)" opacity="0.04" />

        {/* Paths */}
        {pts.length > 1 && (
          <>
            <path d={`M ${incomePoints}`} className="chart-line-path chart-line-income" />
            <path d={`M ${expensePoints}`} className="chart-line-path chart-line-expense" />
            <path d={`M ${netPoints}`} className="chart-line-path chart-line-net" />
          </>
        )}

        {/* Data circles & triggers */}
        {dates.length > 0 && pts.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.yIncome} r="4" fill="var(--fin-success)" className="chart-data-dot" />
            <circle cx={p.x} cy={p.yExpense} r="4" fill="var(--fin-danger)" className="chart-data-dot" />
            <circle cx={p.x} cy={p.yNet} r="3.5" fill="var(--fin-primary)" className="chart-data-dot" />

            <rect x={p.x - 10} y="20" width="20" height="150" fill="transparent" className="chart-data-dot-trigger" style={{ cursor: "pointer" }} />

            <g className="chart-tooltip-group">
              <rect x={p.x > 340 ? p.x - 110 : p.x + 10} y="30" width="100" height="70" rx="6" fill="var(--fin-ink)" opacity="0.95" />
              <text x={p.x > 340 ? p.x - 60 : p.x + 60} y="46" textAnchor="middle" fill="#ffffff" style={{ fontSize: "8.5px", fontWeight: 700 }}>
                {p.date}
              </text>
              <text x={p.x > 340 ? p.x - 100 : p.x + 20} y="62" fill="var(--fin-success)" style={{ fontSize: "9px", fontWeight: 700 }}>
                Gəlir: {p.income.toFixed(0)}
              </text>
              <text x={p.x > 340 ? p.x - 100 : p.x + 20} y="77" fill="var(--fin-danger)" style={{ fontSize: "9px", fontWeight: 700 }}>
                Xərc: {p.expense.toFixed(0)}
              </text>
              <text x={p.x > 340 ? p.x - 100 : p.x + 20} y="92" fill="#ffffff" style={{ fontSize: "9px", fontWeight: 700 }}>
                Xalis: {p.net.toFixed(0)}
              </text>
            </g>
          </g>
        ))}

        {/* X Axis dates */}
        {dates.length > 0 && pts.map((p, i) => {
          const shouldShow = i === 0 || i === pts.length - 1 || (pts.length > 3 && i === Math.floor(pts.length / 2));
          if (!shouldShow) return null;

          const dParts = p.date.split("-");
          const formattedDate = dParts[2] ? `${dParts[2]} ${getMonthNameShort(dParts[1])}` : p.date;

          return (
            <text key={`date-${i}`} x={p.x} y="190" textAnchor="middle" className="chart-text-label" style={{ fontWeight: 700 }}>
              {formattedDate}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

function getMonthNameShort(monthNum: string | undefined): string {
  if (!monthNum) return "";
  const months: Record<string, string> = {
    "01": "yan", "02": "fev", "03": "mar", "04": "apr", "05": "may", "06": "iyn",
    "07": "iyl", "08": "avq", "09": "sen", "10": "okt", "11": "noy", "12": "dek"
  };
  return months[monthNum] || "";
}

function CategoryDistributionList({ data }: { data: FinanceData }) {
  const slices = useMemo(() => {
    const breakdown: Record<string, number> = {};
    [...data.expenses, ...data.payrollItems].forEach((exp) => {
      const cat = exp.category || "Digər";
      const amt = exp.amountValue;
      breakdown[cat] = (breakdown[cat] || 0) + amt;
    });

    const list = Object.entries(breakdown).map(([label, value], index) => ({
      label,
      value,
      color: chartPalette[index % chartPalette.length],
    }));
    list.sort((a, b) => b.value - a.value);
    return list.slice(0, 5);
  }, [data.expenses, data.payrollItems]);

  if (slices.length === 0) {
    return <div className="finance-overview-empty">Xərc kateqoriyası yoxdur</div>;
  }

  return (
    <DonutChart
      slices={slices}
      centerLabel="Cəmi xərc"
      centerValue={formatChartAmount(sumChartValues(slices))}
    />
  );
}

function OverviewWorkspace({ data }: { data: FinanceData }) {
  return (
    <>
      <div className="finance-overview-grid">
        <article className="finance-panel finance-overview-panel">
          <div className="finance-panel-head">
            <div>
              <span>Pul axını</span>
              <h2>Gəlir, xərc və xalis qazanc</h2>
            </div>
          </div>
          <CashFlowChart data={data} />
        </article>

        <article className="finance-panel finance-overview-panel">
          <div className="finance-panel-head">
            <div>
              <span>Xərclərin bölgüsü</span>
              <h2>Əsas kateqoriyalar</h2>
            </div>
          </div>
          <CategoryDistributionList data={data} />
        </article>
      </div>

      <div className="finance-stat-grid" aria-label="Maliyyə statistikası">
        <FinanceStructureChart data={data} />
        <PaymentMethodChart data={data} />
        <DebtRiskChart data={data} />
      </div>
    </>
  );
}

type ChartSlice = {
  label: string;
  value: number;
  color: string;
  helper?: string;
};

const chartPalette = ["#2b58f0", "#20b8a8", "#f59e0b", "#ef476f", "#8b5cf6", "#64748b"];

function FinanceStructureChart({ data }: { data: FinanceData }) {
  const slices = useMemo<ChartSlice[]>(() => {
    const income = data.payments.reduce((sum, payment) => sum + payment.amountValue, 0);
    const expense = data.expenses.reduce((sum, item) => sum + item.amountValue, 0);
    const payroll = data.payrollItems.reduce((sum, item) => sum + item.amountValue, 0);
    const receivable = data.debtors.reduce((sum, item) => sum + item.balanceValue, 0);

    return [
      { label: "Daxil olan", value: income, color: "#20b8a8", helper: `${data.payments.length} ödəniş` },
      { label: "Xərclər", value: expense, color: "#ef476f", helper: `${data.expenses.length} qeyd` },
      { label: "Əməkhaqqı", value: payroll, color: "#8b5cf6", helper: `${data.payrollItems.length} qeyd` },
      { label: "Alacaqlar", value: receivable, color: "#f59e0b", helper: `${data.debtors.length} tələbə` },
    ].filter((slice) => slice.value > 0);
  }, [data.debtors, data.expenses, data.payments, data.payrollItems]);

  return (
    <article className="finance-panel finance-stat-panel">
      <div className="finance-panel-head">
        <div>
          <span>Struktur</span>
          <h2>Maliyyə payları</h2>
        </div>
      </div>
      {slices.length > 0 ? (
        <DonutChart
          slices={slices}
          centerLabel="Ümumi həcm"
          centerValue={formatChartAmount(sumChartValues(slices))}
          compact
        />
      ) : (
        <div className="finance-overview-empty">Pay bölgüsü üçün məlumat yoxdur</div>
      )}
    </article>
  );
}

function PaymentMethodChart({ data }: { data: FinanceData }) {
  const rows = useMemo(() => {
    const breakdown = new Map<string, { value: number; count: number }>();

    data.payments.forEach((payment) => {
      const current = breakdown.get(payment.method) ?? { value: 0, count: 0 };
      breakdown.set(payment.method, {
        value: current.value + payment.amountValue,
        count: current.count + 1,
      });
    });

    return Array.from(breakdown.entries())
      .map(([label, item], index) => ({
        label,
        value: item.value,
        count: item.count,
        color: chartPalette[index % chartPalette.length],
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 4);
  }, [data.payments]);

  return (
    <article className="finance-panel finance-stat-panel">
      <div className="finance-panel-head">
        <div>
          <span>Ödəniş davranışı</span>
          <h2>Ödəniş üsulları</h2>
        </div>
      </div>
      {rows.length > 0 ? (
        <HorizontalStatBars rows={rows} />
      ) : (
        <div className="finance-overview-empty">Ödəniş üsulu üzrə məlumat yoxdur</div>
      )}
    </article>
  );
}

function DebtRiskChart({ data }: { data: FinanceData }) {
  const slices = useMemo<ChartSlice[]>(() => {
    const toneLabels: Record<FinanceData["debtors"][number]["tone"], { label: string; color: string }> = {
      success: { label: "Bağlanıb", color: "#20b8a8" },
      info: { label: "Planlı", color: "#2b58f0" },
      neutral: { label: "Neytral", color: "#64748b" },
      warning: { label: "Gecikir", color: "#f59e0b" },
      danger: { label: "Kritik", color: "#ef476f" },
    };
    const totals = new Map<string, ChartSlice>();

    data.debtors.forEach((debt) => {
      const meta = toneLabels[debt.tone];
      const current = totals.get(debt.tone) ?? {
        label: meta.label,
        value: 0,
        color: meta.color,
        helper: "0 tələbə",
      };
      const nextCount = Number(current.helper?.split(" ")[0] ?? 0) + 1;
      totals.set(debt.tone, {
        ...current,
        value: current.value + debt.balanceValue,
        helper: `${nextCount} tələbə`,
      });
    });

    return Array.from(totals.values()).filter((slice) => slice.value > 0);
  }, [data.debtors]);

  return (
    <article className="finance-panel finance-stat-panel">
      <div className="finance-panel-head">
        <div>
          <span>Risk xəritəsi</span>
          <h2>Alacaq riski</h2>
        </div>
      </div>
      {slices.length > 0 ? (
        <DonutChart
          slices={slices}
          centerLabel="Alacaq"
          centerValue={formatChartAmount(sumChartValues(slices))}
          compact
        />
      ) : (
        <div className="finance-overview-empty">Aktiv alacaq yoxdur</div>
      )}
    </article>
  );
}

function DonutChart({
  slices,
  centerLabel,
  centerValue,
  compact = false,
}: {
  slices: ChartSlice[];
  centerLabel: string;
  centerValue: string;
  compact?: boolean;
}) {
  const total = sumChartValues(slices);
  const gradient = buildConicGradient(slices, total);

  return (
    <div className={`finance-donut-layout${compact ? " is-compact" : ""}`}>
      <div className="finance-donut" style={{ background: gradient }} aria-hidden="true">
        <div className="finance-donut-core">
          <span>{centerLabel}</span>
          <strong>{centerValue}</strong>
        </div>
      </div>
      <div className="finance-chart-legend">
        {slices.map((slice) => {
          const pct = total > 0 ? (slice.value / total) * 100 : 0;

          return (
            <div className="finance-chart-legend-row" key={slice.label}>
              <span className="finance-chart-dot" style={{ backgroundColor: slice.color }} />
              <div>
                <strong>{slice.label}</strong>
                <small>{slice.helper ?? formatChartAmount(slice.value)}</small>
              </div>
              <b>{pct.toFixed(0)}%</b>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HorizontalStatBars({
  rows,
}: {
  rows: Array<{ label: string; value: number; count: number; color: string }>;
}) {
  const maxValue = Math.max(...rows.map((row) => row.value), 1);

  return (
    <div className="finance-method-bars">
      {rows.map((row) => {
        const width = Math.max(6, (row.value / maxValue) * 100);

        return (
          <div className="finance-method-row" key={row.label}>
            <div className="finance-method-row-head">
              <strong>{row.label}</strong>
              <span>{formatChartAmount(row.value)}</span>
            </div>
            <div className="finance-method-track">
              <span style={{ width: `${width}%`, backgroundColor: row.color }} />
            </div>
            <small>{row.count} əməliyyat</small>
          </div>
        );
      })}
    </div>
  );
}

function sumChartValues(slices: Array<{ value: number }>) {
  return slices.reduce((sum, slice) => sum + slice.value, 0);
}

function buildConicGradient(slices: ChartSlice[], total: number) {
  if (total <= 0) {
    return "conic-gradient(#e5eaf3 0deg 360deg)";
  }

  let current = 0;
  const stops = slices.map((slice) => {
    const start = current;
    const end = current + (slice.value / total) * 360;
    current = end;
    return `${slice.color} ${start.toFixed(2)}deg ${end.toFixed(2)}deg`;
  });

  return `conic-gradient(${stops.join(", ")})`;
}

function formatChartAmount(value: number) {
  const rounded = Math.round(value);
  const formatted = rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${formatted} AZN`;
}

function PaymentLedger({
  data,
  payments,
  updateAction,
  deleteAction,
  onNotify,
}: {
  data: FinanceData;
  payments: FinanceData["payments"];
  updateAction: FinanceMutationAction;
  deleteAction: FinanceMutationAction;
  onNotify: (message: Omit<FinanceToastMessage, "id">) => void;
}) {
  return (
    <article className="finance-panel">
      <div className="finance-panel-head">
        <div>
          <span>Gəlir cədvəli</span>
          <h2>Ödəniş qəbulu</h2>
          <small>{payments.length} sətir göstərilir</small>
        </div>
        <BadgeDollarSign size={18} />
      </div>
      <div className="finance-table-wrap">
        <table className="finance-table">
          <thead>
            <tr>
              <th>Tələbə</th>
              <th>Ödəyən</th>
              <th>Məbləğ</th>
              <th>Tarix</th>
              <th>Növbəti ödəniş</th>
              <th>Ödəniş üsulu</th>
              <th>Qəbz</th>
              <th>Qeyd</th>
              <th>Əməliyyat</th>
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
                  <td>
                    <ReceiptActions payment={payment} />
                  </td>
                  <td>{payment.note}</td>
                  <td>
                    <PaymentCrudActions
                      data={data}
                      payment={payment}
                      updateAction={updateAction}
                      deleteAction={deleteAction}
                      onNotify={onNotify}
                    />
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={9}>
                  <div className="finance-empty">Seçilmiş dövrdə ödəniş tapılmadı</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function ReceiptActions({ payment }: { payment: FinanceData["payments"][number] }) {
  if (!payment.receiptFilePath) {
    return <span className="finance-receipt-muted">{payment.receipt}</span>;
  }

  return (
    <div className="finance-receipt-actions">
      <span title={payment.receipt}>{payment.receipt}</span>
      <div>
        <a href={payment.receiptFilePath} target="_blank" rel="noreferrer" aria-label="Qəbzə bax">
          <Eye size={13} />
          Bax
        </a>
        <a href={payment.receiptFilePath} download aria-label="Qəbzi endir">
          <Download size={13} />
          Endir
        </a>
      </div>
    </div>
  );
}

function PaymentCrudActions({
  data,
  payment,
  updateAction,
  deleteAction,
  onNotify,
}: {
  data: FinanceData;
  payment: FinanceData["payments"][number];
  updateAction: FinanceMutationAction;
  deleteAction: FinanceMutationAction;
  onNotify: (message: Omit<FinanceToastMessage, "id">) => void;
}) {
  const router = useRouter();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function runMutation(formData: FormData, action: FinanceMutationAction, successTitle: string) {
    startTransition(async () => {
      try {
        const result = await action(formData);
        setIsEditOpen(false);
        setIsDeleteOpen(false);
        onNotify({
          tone: "success",
          title: successTitle,
          body: "Məlumatlar yeniləndi.",
        });
        router.push(result.redirectTo as Route);
      } catch (error) {
        onNotify({
          tone: "danger",
          title: "Əməliyyat alınmadı",
          body: getActionErrorMessage(error),
        });
      }
    });
  }

  function handleUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    runMutation(new FormData(event.currentTarget), updateAction, "Ödəniş yeniləndi");
  }

  function handleDelete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    runMutation(new FormData(event.currentTarget), deleteAction, "Ödəniş silindi");
  }

  return (
    <div className="finance-row-actions">
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogTrigger asChild>
          <button type="button" className="finance-row-action-btn">
            <Pencil size={13} />
            Düzəliş
          </button>
        </DialogTrigger>
        <DialogContent className="finance-dialog finance-crud-dialog">
          <DialogHeader>
            <DialogTitle>Ödənişi düzəliş et</DialogTitle>
            <DialogDescription>
              Məbləğ, tarix və qəbz məlumatını yenilə. Alacaq balansı avtomatik yenidən hesablanacaq.
            </DialogDescription>
          </DialogHeader>
          <form className="finance-form" onSubmit={handleUpdate}>
            <input type="hidden" name="paymentId" value={payment.id} />
            <input type="hidden" name="studentId" value={payment.studentId} />
            <input type="hidden" name="returnTo" value={data.returnTo} />
            <div className="field-grid">
              <label className="form-field">
                <span>Məbləğ</span>
                <Input name="amount" defaultValue={payment.amountInput} inputMode="decimal" required />
              </label>
              <label className="form-field">
                <span>Ödəniş üsulu</span>
                <FormSelect name="method" defaultValue={payment.methodValue} options={studentPaymentMethodOptions} />
              </label>
            </div>
            <div className="field-grid">
              <label className="form-field">
                <span>Ödəniş tarixi</span>
                <DatePicker name="paidDate" defaultValue={payment.paidDateValue} allowClear={false} popoverPlacement="floating" required />
              </label>
              <label className="form-field">
                <span>Növbəti ödəniş tarixi</span>
                <DatePicker name="paymentMonth" defaultValue={payment.paymentMonthValue} allowClear={false} popoverPlacement="floating" required />
              </label>
            </div>
            <div className="field-grid">
              <label className="form-field">
                <span>Ödəyən şəxs</span>
                <Input name="payerName" defaultValue={payment.payerName} maxLength={120} />
              </label>
              <label className="form-field">
                <span>Qəbz nömrəsi</span>
                <Input name="receiptReference" defaultValue={payment.receiptReference} maxLength={120} />
              </label>
            </div>
            <label className="form-field">
              <span>Yeni qəbz faylı</span>
              <span className="finance-file-control">
                <Upload size={14} />
                <strong>Fayl seç</strong>
                <small>PDF / şəkil</small>
                <Input name="receiptFile" type="file" accept="image/*,.pdf" />
              </span>
            </label>
            <label className="form-field">
              <span>Qeyd</span>
              <Input name="note" defaultValue={payment.note === "-" ? "" : payment.note} maxLength={500} />
            </label>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setIsEditOpen(false)}>
                Ləğv et
              </Button>
              <Button type="submit" disabled={isPending}>
                Yadda saxla
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogTrigger asChild>
          <button type="button" className="finance-row-action-btn is-danger">
            <Trash2 size={13} />
            Sil
          </button>
        </DialogTrigger>
        <DialogContent className="finance-dialog finance-confirm-dialog">
          <DialogHeader>
            <DialogTitle>Ödəniş silinsin?</DialogTitle>
            <DialogDescription>
              Bu əməliyyat qəbulu siləcək və faktura balanslarını geri hesablayacaq.
            </DialogDescription>
          </DialogHeader>
          <form className="finance-form" onSubmit={handleDelete}>
            <input type="hidden" name="paymentId" value={payment.id} />
            <input type="hidden" name="returnTo" value={data.returnTo} />
            <div className="finance-confirm-box">
              <strong>{payment.studentName}</strong>
              <span>{payment.amount} / {payment.paidAt}</span>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setIsDeleteOpen(false)}>
                Ləğv et
              </Button>
              <Button type="submit" disabled={isPending} variant="secondary">
                Sil
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DebtLedger({ debtors }: { debtors: FinanceData["debtors"] }) {
  return (
    <article className="finance-panel">
      <div className="finance-panel-head">
        <div>
          <span>Alacaqlar cədvəli</span>
          <h2>Alacaqlar</h2>
          <small>{debtors.length} balans göstərilir</small>
        </div>
        <AlertTriangle size={18} />
      </div>
      <div className="finance-table-wrap">
        <table className="finance-table finance-debt-table">
          <thead>
            <tr>
              <th>Tələbə</th>
              <th>Proqram / müəllim</th>
              <th>Alacaq</th>
              <th>Növbəti son tarix</th>
              <th>Gecikmə</th>
              <th>Telefon</th>
              <th>Status</th>
              <th>Əməliyyat</th>
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
                  <td>
                    <div className="finance-row-actions">
                      <Link className="finance-row-action-btn" href={`/students/${debt.id}` as Route}>
                        <Eye size={13} />
                        Profil
                      </Link>
                      <Link className="finance-row-action-btn" href="/finance?type=payments">
                        <Banknote size={13} />
                        Ödənişlər
                      </Link>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8}>
                  <div className="finance-empty">Alacaq tapılmadı</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function ExpenseLedger({
  data,
  expenses,
  updateAction,
  deleteAction,
  onNotify,
}: {
  data: FinanceData;
  expenses: FinanceData["expenses"];
  updateAction: FinanceMutationAction;
  deleteAction: FinanceMutationAction;
  onNotify: (message: Omit<FinanceToastMessage, "id">) => void;
}) {
  return (
    <article className="finance-panel">
      <div className="finance-panel-head">
        <div>
          <span>Xərc cədvəli</span>
          <h2>Kateqoriyalar üzrə xərclər</h2>
          <small>{expenses.length} xərc qeydi</small>
        </div>
        <ReceiptText size={18} />
      </div>
      <div className="finance-table-wrap">
        <table className="finance-table">
          <thead>
            <tr>
              <th>Kateqoriya</th>
              <th>Məbləğ</th>
              <th>Tarix</th>
              <th>Təchizatçı</th>
              <th>Ödəniş üsulu</th>
              <th>Qəbz</th>
              <th>Açıqlama</th>
              <th>Əməliyyat</th>
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
                  <td>
                    <ExpenseCrudActions
                      data={data}
                      expense={expense}
                      updateAction={updateAction}
                      deleteAction={deleteAction}
                      onNotify={onNotify}
                    />
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8}>
                  <div className="finance-empty">Seçilmiş filtrlərlə xərc tapılmadı</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function PayrollLedger({
  data,
  payrollItems,
  updateAction,
  deleteAction,
  onNotify,
}: {
  data: FinanceData;
  payrollItems: FinanceData["payrollItems"];
  updateAction: FinanceMutationAction;
  deleteAction: FinanceMutationAction;
  onNotify: (message: Omit<FinanceToastMessage, "id">) => void;
}) {
  return (
    <article className="finance-panel">
      <div className="finance-panel-head">
        <div>
          <span>Əməkhaqqı cədvəli</span>
          <h2>Sabit və faizli əməkhaqqı</h2>
          <small>{payrollItems.length} əməkhaqqı qeydi</small>
        </div>
        <Calculator size={18} />
      </div>
      <div className="finance-table-wrap">
        <table className="finance-table">
          <thead>
            <tr>
              <th>Əməkdaş / müəllim</th>
              <th>Kateqoriya</th>
              <th>Məbləğ</th>
              <th>Tarix</th>
              <th>Əməkhaqqı növü</th>
              <th>Formula</th>
              <th>Ödəniş üsulu</th>
              <th>Qəbz</th>
              <th>Əməliyyat</th>
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
                  <td>
                    <ExpenseCrudActions
                      data={data}
                      expense={payroll}
                      updateAction={updateAction}
                      deleteAction={deleteAction}
                      onNotify={onNotify}
                    />
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={9}>
                  <div className="finance-empty">Seçilmiş dövrdə əməkhaqqı qeydi tapılmadı</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function ExpenseCrudActions({
  data,
  expense,
  updateAction,
  deleteAction,
  onNotify,
}: {
  data: FinanceData;
  expense: FinanceData["expenses"][number] | FinanceData["payrollItems"][number];
  updateAction: FinanceMutationAction;
  deleteAction: FinanceMutationAction;
  onNotify: (message: Omit<FinanceToastMessage, "id">) => void;
}) {
  const router = useRouter();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function runMutation(formData: FormData, action: FinanceMutationAction, successTitle: string) {
    startTransition(async () => {
      try {
        const result = await action(formData);
        setIsEditOpen(false);
        setIsDeleteOpen(false);
        onNotify({
          tone: "success",
          title: successTitle,
          body: "Maliyyə məlumatları yeniləndi.",
        });
        router.push(result.redirectTo as Route);
      } catch (error) {
        onNotify({
          tone: "danger",
          title: "Əməliyyat alınmadı",
          body: getActionErrorMessage(error),
        });
      }
    });
  }

  function handleUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    runMutation(new FormData(event.currentTarget), updateAction, "Xərc yeniləndi");
  }

  function handleDelete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    runMutation(new FormData(event.currentTarget), deleteAction, "Xərc silindi");
  }

  return (
    <div className="finance-row-actions">
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogTrigger asChild>
          <button type="button" className="finance-row-action-btn">
            <Pencil size={13} />
            Düzəliş
          </button>
        </DialogTrigger>
        <DialogContent className="finance-dialog finance-crud-dialog">
          <DialogHeader>
            <DialogTitle>Xərci düzəliş et</DialogTitle>
            <DialogDescription>
              Məbləğ, tarix, kateqoriya və qəbz məlumatlarını yenilə.
            </DialogDescription>
          </DialogHeader>
          <form className="finance-form" onSubmit={handleUpdate}>
            <input type="hidden" name="expenseId" value={expense.id} />
            <input type="hidden" name="categoryId" value={expense.categoryId} />
            <input type="hidden" name="staffTarget" value={expense.staffTarget} />
            <input type="hidden" name="salaryMode" value="NONE" />
            <input type="hidden" name="returnTo" value={data.returnTo} />
            <div className="field-grid">
              <label className="form-field">
                <span>Məbləğ</span>
                <Input name="amount" defaultValue={expense.amountInput} inputMode="decimal" required />
              </label>
              <label className="form-field">
                <span>Tarix</span>
                <DatePicker name="expenseDate" defaultValue={expense.expenseDateValue} allowClear={false} popoverPlacement="floating" required />
              </label>
            </div>
            <div className="field-grid">
              <label className="form-field">
                <span>Ödəniş üsulu</span>
                <FormSelect name="method" defaultValue={expense.methodValue} options={studentPaymentMethodOptions} />
              </label>
              <label className="form-field">
                <span>Təchizatçı / mənbə</span>
                <Input name="vendor" defaultValue={expense.vendor === "-" ? "" : expense.vendor} maxLength={120} />
              </label>
            </div>
            <div className="field-grid">
              <label className="form-field">
                <span>Qəbz nömrəsi</span>
                <Input name="receiptReference" defaultValue={expense.receiptReference} maxLength={120} />
              </label>
              <label className="form-field">
                <span>Yeni qəbz faylı</span>
                <span className="finance-file-control">
                  <Upload size={14} />
                  <strong>Fayl seç</strong>
                  <small>PDF / şəkil</small>
                  <Input name="receiptFile" type="file" accept="image/*,.pdf" />
                </span>
              </label>
            </div>
            <label className="form-field">
              <span>Açıqlama</span>
              <textarea name="description" defaultValue={expense.description === "-" ? "" : expense.description} maxLength={700} />
            </label>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setIsEditOpen(false)}>
                Ləğv et
              </Button>
              <Button type="submit" disabled={isPending}>
                Yadda saxla
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogTrigger asChild>
          <button type="button" className="finance-row-action-btn is-danger">
            <Trash2 size={13} />
            Sil
          </button>
        </DialogTrigger>
        <DialogContent className="finance-dialog finance-confirm-dialog">
          <DialogHeader>
            <DialogTitle>Xərc silinsin?</DialogTitle>
            <DialogDescription>
              Bu qeyd maliyyə cədvəlindən silinəcək.
            </DialogDescription>
          </DialogHeader>
          <form className="finance-form" onSubmit={handleDelete}>
            <input type="hidden" name="expenseId" value={expense.id} />
            <input type="hidden" name="returnTo" value={data.returnTo} />
            <div className="finance-confirm-box">
              <strong>{expense.category}</strong>
              <span>{expense.amount} / {expense.expenseDate}</span>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setIsDeleteOpen(false)}>
                Ləğv et
              </Button>
              <Button type="submit" disabled={isPending} variant="secondary">
                Sil
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SubmitButton({
  children,
  disabled,
  isPending = false,
}: {
  children: ReactNode;
  disabled?: boolean;
  isPending?: boolean;
}) {
  const { pending } = useFormStatus();
  const isBusy = pending || isPending;

  return (
    <Button type="submit" disabled={isBusy || disabled}>
      {children}
      {pending ? "Hazırlanır..." : null}
    </Button>
  );
}

function getActionErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return normalizeActionErrorMessage(error.message);
  }

  return "Əməliyyat zamanı xəta baş verdi. Məlumatları yoxlayıb yenidən cəhd edin.";
}

function normalizeActionErrorMessage(message: string) {
  if (message.includes("NEXT_REDIRECT")) {
    return "Əməliyyat tamamlandı, səhifə yenilənir.";
  }

  if (message.includes("Invalid input") || message.includes("Required")) {
    return "Məlumatlar tam və düzgün doldurulmalıdır.";
  }

  return message;
}

function buildFinanceFilterPath(
  data: FinanceData,
  nextValues: Partial<FinanceFilterDraft & { type: FinanceTab }>
) {
  const params = new URLSearchParams();
  const query = nextValues.query ?? data.filters.query;
  const category = nextValues.category ?? data.filters.category;
  const type = nextValues.type ?? data.filters.type;
  const from = nextValues.from ?? data.filters.from;
  const to = nextValues.to ?? data.filters.to;

  if (query) {
    params.set("q", query);
  }

  if (category) {
    params.set("category", category);
  }

  if (type !== "overview") {
    params.set("type", type);
  }

  if (from) {
    params.set("from", from);
  }

  if (to) {
    params.set("to", to);
  }

  const queryString = params.toString();
  return queryString ? `/finance?${queryString}` : "/finance";
}

function buildPeriodPresets() {
  const today = startOfLocalDay(new Date());
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const previousMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const previousMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
  const last30Start = addLocalDays(today, -29);

  return [
    {
      id: "today",
      label: "Bu gün",
      from: toDateInput(today),
      to: toDateInput(today),
    },
    {
      id: "current-month",
      label: "Bu ay",
      from: toDateInput(monthStart),
      to: toDateInput(today),
    },
    {
      id: "last-30",
      label: "Son 30 gün",
      from: toDateInput(last30Start),
      to: toDateInput(today),
    },
    {
      id: "previous-month",
      label: "Keçən ay",
      from: toDateInput(previousMonthStart),
      to: toDateInput(previousMonthEnd),
    },
  ];
}

function startOfLocalDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function addLocalDays(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function addLocalMonths(value: Date, months: number) {
  const next = new Date(value);
  const originalDay = next.getDate();

  next.setDate(1);
  next.setMonth(next.getMonth() + months);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(originalDay, lastDay));

  return next;
}

function toDateInput(value: Date) {
  return [
    value.getFullYear().toString(),
    (value.getMonth() + 1).toString().padStart(2, "0"),
    value.getDate().toString().padStart(2, "0"),
  ].join("-");
}

function getNextPaymentDate(value: string) {
  if (!value) {
    return "";
  }

  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return "";
  }

  return toDateInput(addLocalMonths(new Date(year, month - 1, day), 1));
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

  return "Planlı";
}

function cleanSelectValue(value: string) {
  return value === EMPTY_SELECT_VALUE ? "" : value;
}

function isPayrollCategoryName(value: string) {
  const normalized = normalizeKeyword(value);
  return [
    "maas",
    "maaş",
    "əməkhaqqı",
    "emekhaqqi",
    "əmək haqqı",
    "emek haqqi",
    "salary",
    "payroll",
    "isci",
    "işçi",
    "əməkdaş",
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
