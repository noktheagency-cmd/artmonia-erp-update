"use client";

import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import { unwrapActionResult, type ActionResult } from "@/lib/action-result";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowRight,
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
  ShieldCheck,
  Trash2,
  TrendingUp,
  Upload,
  UserRound,
  WalletCards,
  XCircle,
} from "lucide-react";
import {
  Bar,
  BarChart,
  ComposedChart,
  CartesianGrid,
  Cell,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import { createPortal, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
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
import { studentPaymentScheduleTypeOptions } from "@/modules/students/payment-schedule-type";
import { ExportDialog } from "@/modules/exports/export-dialog";
import type { FinanceData } from "@/modules/finance/queries";
import {
  getIncomeDescription,
  getIncomeReportingCategory,
  isCashInflow,
} from "@/modules/finance/reporting";

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

const financeKpiIcons = [Banknote, ReceiptText, BadgeDollarSign, BarChart3, Calculator, AlertTriangle];

const financeCostCenterOptions = [
  { value: "TEACHING", label: "Tədris" },
  { value: "SALES", label: "Satış" },
  { value: "MARKETING", label: "Marketinq" },
  { value: "OPERATIONS", label: "Əməliyyat" },
  { value: "MANAGEMENT", label: "Rəhbərlik" },
];

function getFinancialClassLabel(value: string) {
  return {
    DIRECT_COST: "Birbaşa xərc",
    OPEX: "Əməliyyat xərci",
    CAPEX: "Kapital investisiyası",
    FINANCING: "Maliyyələşmə",
    LEGACY_LIABILITY: "Keçmiş öhdəlik",
  }[value] ?? "Maliyyə hərəkəti";
}

function getCostCenterLabel(value: string) {
  return financeCostCenterOptions.find((option) => option.value === value)?.label ?? "Təyin edilməyib";
}

function buildFinanceExportPreview(data: FinanceData): Array<Record<string, string>> {
  if (data.filters.type === "payments") {
    return data.payments.map((payment) => ({
      student: payment.studentName,
      studentCode: payment.studentCode,
      amount: payment.amount,
      paidAt: payment.paidAt,
      paymentMonth: payment.paymentMonth,
      method: payment.method,
      payer: payment.payerName,
      receipt: payment.receipt,
      note: payment.note,
    }));
  }

  if (data.filters.type === "debts") {
    return data.debtors.map((debtor) => ({
      student: debtor.studentName,
      studentCode: debtor.studentCode,
      phone: debtor.phone,
      program: debtor.program,
      teacher: debtor.teacher,
      balance: debtor.balance,
      dueDate: debtor.nextDueDate,
      overdueDays: debtor.overdueDays,
    }));
  }

  const expenses = data.filters.type === "payroll" ? data.payrollItems : data.expenses;
  return expenses.map((expense) => ({
    staff: expense.staffName,
    category: expense.category,
    financialClass: getFinancialClassLabel(expense.financialClass),
    costCenter: getCostCenterLabel(expense.costCenter),
    amount: expense.amount,
    expenseDate: expense.expenseDate,
    method: expense.method,
    vendor: expense.vendor,
    salaryFormula: expense.salaryFormula,
    receipt: expense.receipt,
    description: expense.description,
  }));
}

type FinanceFilterDraft = {
  query: string;
  category: string;
  from: string;
  to: string;
  source: FinanceData["filters"]["source"];
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

type FinanceMutationAction = (
  formData: FormData,
) => Promise<ActionResult<FinanceMutationResult>>;

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
  const router = useRouter();
  const [toast, setToast] = useState<FinanceToastMessage | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    }, 60_000);

    return () => window.clearInterval(timer);
  }, [router]);

  function showToast(message: Omit<FinanceToastMessage, "id">) {
    setToast({ ...message, id: Date.now() });
  }

  if (data.accessMode === "ENTRY_ONLY") {
    return (
      <section className="finance-command-page finance-page finance-entry-only">
        <FinanceOperationToast toast={toast} onToastChange={setToast} />
        <header className="finance-hero finance-entry-hero">
          <div>
            <span>Məhdud maliyyə girişi</span>
            <h1>Ödəniş və xərc əlavə et</h1>
            <p>Bu rol yalnız yeni əməliyyat daxil edə bilər. Maliyyə göstəriciləri, balanslar və əməliyyat siyahıları göstərilmir.</p>
          </div>
          <div className="finance-header-actions">
            <ExpenseDialog data={data} action={createExpenseAction} onNotify={showToast} />
            <PaymentDialog data={data} action={recordPaymentAction} onNotify={showToast} />
          </div>
        </header>
        <div className="finance-entry-safety-note">
          <ShieldCheck />
          <div><strong>Maliyyə məlumatları qorunur</strong><span>Daxil etdiyiniz əməliyyat audit jurnalına yazılır, tam hesabatları isə yalnız maliyyə icazəsi olan şəxslər görür.</span></div>
        </div>
      </section>
    );
  }

  return (
    <section className="finance-command-page finance-page">
      <FinanceOperationToast toast={toast} onToastChange={setToast} />
      <header className="finance-hero finance-command-hero">
        <div className="finance-hero-head">
          <div className="finance-header-main">
            <div className="finance-title-block">
              <h1>Maliyyə paneli</h1>
              <p>Tələbə və tədbir gəlirləri, xərclər, alacaqlar və qəbzlər vahid mərkəzdə görünür.</p>
            </div>
          </div>
          <div className="finance-header-actions">
            <Link href={"/finance/billing-migration" as Route} className="finance-migration-link">
              Billing migration hesabatı
            </Link>
            {data.permissions.canExport ? (
              <ExportDialog
                key={`finance-export-${data.filters.type}`}
                module="finance"
                initialDataset={data.filters.type === "overview" ? "payments" : data.filters.type}
                resultCount={data.filters.type === "payments" || data.filters.type === "overview" ? data.payments.length : data.filters.type === "expenses" ? data.expenses.length : data.filters.type === "debts" ? data.debtors.length : data.payrollItems.length}
                filters={{ q: data.filters.query, category: data.filters.category, type: data.filters.type, from: data.filters.from, to: data.filters.to }}
                previewRows={buildFinanceExportPreview(data)}
              />
            ) : null}
            <ExpenseDialog
              data={data}
              action={createExpenseAction}
              onNotify={showToast}
            />
            <PaymentDialog
              data={data}
              action={recordPaymentAction}
              onNotify={showToast}
            />
          </div>
        </div>
        <FinanceCommandBar key={`filters-${data.returnTo}`} data={data} />
      </header>

      <FinancePrimaryKpis data={data} />

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
        {data.filters.type === "debts" ? <DebtLedger key={data.returnTo} data={data} /> : null}
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
        title: "Maliyyə hərəkəti ləğv edildi",
        body: "Qeyd audit tarixçəsində saxlanıldı və hesabatlardan çıxarıldı.",
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
    query: "",
    category: data.filters.category,
    from: data.filters.from,
    to: data.filters.to,
    source: data.filters.source,
  }));

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

        <div className="finance-filter-field">
          <FormSelect
            name="source"
            defaultValue={draft.source}
            onValueChange={(value) => updateDraft({ source: cleanSelectValue(value) as FinanceFilterDraft["source"] })}
            placeholder="Bütün mənbələr"
            options={[
              { value: "all", label: "Bütün mənbələr" },
              { value: "student", label: "Tələbə ödənişləri" },
              { value: "workshop", label: "Tədbirlər (Workshop / Masterclass)" },
            ]}
          />
        </div>

      </div>

      <div className="finance-filter-footer">
        <div className="finance-filter-presets">
          <span className="finance-preset-info-text">
            Tarix headerdəki ümumi calendar, kateqoriya isə bu panel üzərindən tətbiq olunur
          </span>
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
    billingMonth: data.students[0]?.defaultPaymentMonth ?? "",
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
        billingMonth: student.defaultPaymentMonth,
        payerName: student.name,
      }));
    }
  }

  function handlePaidDateChange(value: string) {
    setValues((current) => ({
      ...current,
      paidDate: value,
    }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startSubmitTransition(async () => {
      try {
        const result = unwrapActionResult(await action(formData));
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
          Ödəniş qəbul et
        </Button>
      </DialogTrigger>
      <DialogContent className="finance-dialog finance-payment-dialog">
        <DialogHeader className="dialog-header-custom">
          <span className="finance-dialog-heading-icon" aria-hidden="true">
            <ArrowDownToLine size={19} />
          </span>
          <div>
            <DialogTitle>Ödəniş qəbul et</DialogTitle>
            <DialogDescription>
              Tələbəni, əməliyyat tarixini və ödənişin aid olduğu ayı ayrıca qeyd et.
            </DialogDescription>
          </div>
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
                <span>Ödəniş növü</span>
                <FormSelect
                  name="scheduleType"
                  defaultValue="MONTHLY"
                  options={studentPaymentScheduleTypeOptions}
                />
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
                <span>Ödəniş üsulu</span>
                <FormSelect name="method" defaultValue="CASH" options={studentPaymentMethodOptions} />
              </label>
            </div>
            <label className="form-field">
              <span>Aid olduğu ay</span>
              <Input
                name="billingMonth"
                type="month"
                value={values.billingMonth}
                onChange={(event) => setValues((current) => ({
                  ...current,
                  billingMonth: event.target.value,
                }))}
                required
              />
            </label>
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
                <Input name="receiptFile" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" />
              </span>
            </label>
            <label className="form-field">
              <span>Qeyd</span>
              <Input name="note" maxLength={500} placeholder="Bank, terminal və ya əlavə qeyd" />
            </label>
            <div className="finance-allocation-note">
              <AlertTriangle size={14} aria-hidden="true" />
              Aylıq ödəniş yalnız seçilmiş ayın fakturasına yazılır; əməliyyat tarixi billing ayını dəyişmir.
            </div>
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
  const [staffTarget, setStaffTarget] = useState("");
  const [payeeMode, setPayeeMode] = useState<"MANUAL" | "COMPANY">("MANUAL");
  const selectedStaff = data.staff.find((staff) => staff.id === staffTarget);
  const [amount, setAmount] = useState("");
  const availableCategories = data.categories.filter(
    (category) => category.isActive && !category.requiresProject && category.transactionType !== "INCOME"
  );
  const selectedCategory = availableCategories.find((category) => category.id === categoryValue);
  const usesPayrollFlow = selectedCategory?.requiresStaff ?? false;
  const salaryMode = usesPayrollFlow && selectedStaff ? selectedStaff.salaryMode : "NONE";
  const salaryBaseAmount = usesPayrollFlow && selectedStaff ? getStaffSalaryBase(selectedStaff) : "";
  const salaryCalculatedAmount =
    usesPayrollFlow && selectedStaff ? getStaffCalculatedSalary(selectedStaff) : "";
  const payableSalary = salaryCalculatedAmount ? `${salaryCalculatedAmount} AZN` : "0 AZN";

  function resetExpenseForm() {
    setCategoryValue("");
    setStaffTarget("");
    setPayeeMode("MANUAL");
    setAmount("");
  }

  function handleDialogOpenChange(nextOpen: boolean) {
    setIsOpen(nextOpen);

    if (!nextOpen) {
      resetExpenseForm();
    }
  }

  function handleCategoryChange(value: string) {
    const nextCategoryId = cleanSelectValue(value);
    const nextCategory = availableCategories.find((category) => category.id === nextCategoryId);

    setCategoryValue(nextCategory?.id ?? "");

    if (!nextCategory?.requiresStaff) {
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
        const result = unwrapActionResult(await action(formData));
        resetExpenseForm();
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
    <Dialog open={isOpen} onOpenChange={handleDialogOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="secondary" disabled={!data.permissions.canCreateExpense}>
          <Plus data-icon="inline-start" />
          Maliyyə hərəkəti əlavə et
        </Button>
      </DialogTrigger>
      <DialogContent className="finance-dialog finance-expense-dialog">
        <DialogTitle className="sr-only">Yeni maliyyə hərəkəti</DialogTitle>
        <DialogDescription className="sr-only">
          Yeni xərc qeydinin məlumatları
        </DialogDescription>

        <form onSubmit={handleSubmit} className="finance-form">
          <input
            type="hidden"
            name="categoryId"
            value={categoryValue}
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
              <span>Kateqoriya</span>
            </div>
            <label className="form-field finance-category-field">
              <span>Təsdiqlənmiş kateqoriya</span>
              <FormSelect
                name="categorySelector"
                value={categoryValue}
                onValueChange={handleCategoryChange}
                emptyLabel="Kateqoriya seç"
                searchable
                searchPlaceholder="Kateqoriya axtar..."
                options={availableCategories.map((category) => ({
                    value: category.id,
                    label: `${category.name} / ${getFinancialClassLabel(category.financialClass)}`,
                  }))}
                required
              />
            </label>
            {selectedCategory ? (
              <div className="finance-selected-record">
                <div>
                  <strong>{selectedCategory.name}</strong>
                  <span>{selectedCategory.description || "Təsdiqlənmiş maliyyə kateqoriyası"}</span>
                </div>
                <StatusChip tone="info">{getFinancialClassLabel(selectedCategory.financialClass)}</StatusChip>
              </div>
            ) : null}
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
              ) : null}
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
            <label className="form-field">
              <span>Ödəniş üsulu</span>
              <FormSelect name="method" defaultValue="CASH" options={studentPaymentMethodOptions} />
            </label>
            <div className="field-grid">
              {usesPayrollFlow ? (
                <label className="form-field">
                  <span>Ödəniş alan əməkdaş</span>
                  <Input name="vendor" placeholder={selectedStaff?.label ?? "Əməkdaş seçimindən doldurulur"} disabled />
                  <input type="hidden" name="payeeMode" value="MANUAL" />
                </label>
              ) : (
                <label className="form-field">
                  <span>Ödəniş alan növü</span>
                  <FormSelect
                    name="payeeMode"
                    value={payeeMode}
                    onValueChange={(value) => setPayeeMode(value === "COMPANY" ? "COMPANY" : "MANUAL")}
                    options={[{ value: "MANUAL", label: "Manual daxil et" }, { value: "COMPANY", label: "Korporativ şirkət seç" }]}
                  />
                </label>
              )}
              <label className="form-field">
                <span>Xərc mərkəzi</span>
                <FormSelect name="costCenter" defaultValue="OPERATIONS" options={financeCostCenterOptions} required />
              </label>
            </div>
            {!usesPayrollFlow ? (
              payeeMode === "COMPANY" ? (
                <label className="form-field">
                  <span>HR korporativ müştərisi</span>
                  <FormSelect name="corporateCustomerId" emptyLabel="Şirkət seç" searchable searchPlaceholder="Şirkət axtar..." options={data.corporateCustomers.map((company) => ({ value: company.id, label: company.name }))} required />
                </label>
              ) : (
                <label className="form-field">
                  <span>Kimə ödənilib</span>
                  <Input name="vendor" placeholder="Şəxsin və ya şirkətin adını yazın" maxLength={120} required />
                </label>
              )
            ) : null}
            <div className="field-grid">
              <label className="form-field">
                <span>Qəbz nömrəsi</span>
                <Input name="receiptReference" maxLength={120} placeholder="Varsa qəbz və ya sənəd nömrəsi" />
              </label>
              <label className="form-field finance-receipt-upload-field">
                <span>Qəbz əlavə et</span>
                <span className="finance-file-control">
                  <Upload size={14} />
                  <strong>Fayl seç</strong>
                  <small>PDF / şəkil</small>
                  <Input name="receiptFile" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" />
                </span>
              </label>
            </div>
            <label className="form-field">
              <span>Açıqlama</span>
              <textarea name="description" minLength={3} maxLength={700} placeholder="Hərəkətin məqsədi və izahı" required />
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
              Maliyyə hərəkətini saxla
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
  const trendPoints = useMemo(() => {
    const rangeDays = Math.max(1, Math.ceil((Date.parse(data.filters.to) - Date.parse(data.filters.from)) / 86_400_000) + 1);
    const grouping: "day" | "week" | "month" = rangeDays <= 45 ? "day" : rangeDays <= 180 ? "week" : "month";
    const buckets = new Map<string, { date: string; income: number; expense: number }>();
    const ensure = (date: string) => {
      const key = cashFlowBucketKey(date, grouping);
      const current = buckets.get(key) ?? { date: key, income: 0, expense: 0 };
      buckets.set(key, current);
      return current;
    };
    data.payments.forEach((payment) => {
      if (payment.dateKey) ensure(payment.dateKey).income += payment.amountValue;
    });
    expenseMovements.forEach((movement) => {
      if (!movement.dateKey) return;
      const bucket = ensure(movement.dateKey);
      if (isCashInflow(movement.transactionType)) bucket.income += movement.amountValue;
      else bucket.expense += movement.amountValue;
    });
    const points = [...buckets.values()]
      .sort((first, second) => first.date.localeCompare(second.date))
      .map((point) => ({ ...point, net: point.income - point.expense, grouping }));
    return points.length ? points : [{ date: data.filters.from, income: 0, expense: 0, net: 0, grouping }];
  }, [data.filters.from, data.filters.to, data.payments, expenseMovements]);

  const reduceMotion = useReducedMotion();
  const chartData = useMemo(
    () => trendPoints.map((point) => ({
      ...point,
      label: point.date ? formatCashFlowBucketLabel(point.date, point.grouping) : "—",
    })),
    [trendPoints]
  );
  const chartConfig = {
    income: { label: "Pul girişi", color: "#11a683" },
    expense: { label: "Pul çıxışı", color: "#f04462" },
    net: { label: "Net pul", color: "#3158f5" },
  } satisfies ChartConfig;

  return (
    <div className="finance-cash-flow">
      <div className="finance-chart-key" aria-label="Qrafik göstəriciləri">
        {Object.entries(chartConfig).map(([key, item]) => (
          <span key={key}>
            <i style={{ background: item.color }} />
            {item.label}
          </span>
        ))}
      </div>
      <ChartContainer config={chartConfig} className="finance-cash-flow-chart" initialDimension={{ width: 720, height: 280 }}>
        <ComposedChart data={chartData} margin={{ top: 12, right: 16, left: -10, bottom: 0 }} accessibilityLayer>
          <CartesianGrid vertical={false} strokeDasharray="4 6" />
          <XAxis dataKey="label" axisLine={false} tickLine={false} tickMargin={12} minTickGap={26} />
          <YAxis axisLine={false} tickLine={false} width={54} tickFormatter={formatCompactAmount} />
          <ReferenceLine y={0} stroke="#cbd5e1" strokeDasharray="3 4" />
          <ChartTooltip
            cursor={{ stroke: "#aebbd0", strokeDasharray: "4 4" }}
            content={<ChartTooltipContent formatter={(value, name) => (
              <div className="finance-tooltip-value">
                <span>{chartConfig[name as keyof typeof chartConfig]?.label ?? name}</span>
                <strong>{formatChartAmount(Number(value))}</strong>
              </div>
            )} />}
          />
          <Bar
            dataKey="income"
            fill="var(--color-income)"
            radius={[6, 6, 0, 0]}
            maxBarSize={24}
            isAnimationActive={!reduceMotion}
            animationDuration={800}
          />
          <Bar
            dataKey="expense"
            fill="var(--color-expense)"
            radius={[6, 6, 0, 0]}
            maxBarSize={24}
            isAnimationActive={!reduceMotion}
            animationDuration={950}
          />
          <Line
            type="monotone"
            dataKey="net"
            stroke="var(--color-net)"
            strokeWidth={2.25}
            strokeDasharray="5 4"
            dot={{ r: 3, fill: "var(--color-net)", stroke: "#fff", strokeWidth: 2 }}
            activeDot={{ r: 5, strokeWidth: 2 }}
            isAnimationActive={!reduceMotion}
            animationDuration={1100}
          />
        </ComposedChart>
      </ChartContainer>
    </div>
  );
}

function formatShortDate(value: string): string {
  const [, monthNum, day] = value.split("-");
  if (!monthNum || !day) return value;
  const months: Record<string, string> = {
    "01": "yan", "02": "fev", "03": "mar", "04": "apr", "05": "may", "06": "iyn",
    "07": "iyl", "08": "avq", "09": "sen", "10": "okt", "11": "noy", "12": "dek"
  };
  return `${day} ${months[monthNum] ?? monthNum}`;
}

function CategoryDistributionList({ data }: { data: FinanceData }) {
  const slices = useMemo(() => {
    const list = data.expenseBreakdown.map((item, index) => ({
      label: item.label,
      value: item.value,
      helper: `${item.count} qeyd`,
      color: chartPalette[index % chartPalette.length],
    }));
    return list.filter((slice) => slice.value > 0).slice(0, 7);
  }, [data.expenseBreakdown]);

  if (slices.length === 0) {
    return <div className="finance-overview-empty">Xərc kateqoriyası yoxdur</div>;
  }

  return (
    <ExpenseBreakdownBarChart
      slices={slices}
    />
  );
}

function FinancePrimaryKpis({ data }: { data: FinanceData }) {
  const [selected, setSelected] = useState<"income" | "expense" | "profit" | "receivables" | "details" | null>(null);
  const cards = [
    { key: "income" as const, label: "Ümumi gəlir", value: data.summary.income, helper: `Təhsil ${data.summary.studentIncome} · Tədbirlər ${data.summary.eventIncome}`, tone: "success", icon: WalletCards },
    { key: "expense" as const, label: "Ümumi xərc", value: data.summary.expense, helper: `Əsas xərclər ${data.summary.coreExpense} · Tədbirlər ${data.summary.eventExpense}`, tone: "warning", icon: ReceiptText },
    { key: "profit" as const, label: "Net Profit", value: data.summary.netProfit, helper: "Operating Profit − qeyri-əməliyyat P&L maddələri", tone: "neutral", icon: TrendingUp },
    { key: "receivables" as const, label: "Maliyyə sağlamlığı · açıq borc", value: data.receivableSummary.studentOutstanding.amount, helper: `${data.receivableSummary.studentOutstanding.count} tələbə · gələcək ödəniş ayrıca göstərilir`, tone: "warning", icon: BadgeDollarSign },
  ];
  const detailRows = selected === "income"
    ? [["Tələbə ödənişləri", data.summary.studentIncome], ["Workshop / Masterclass", data.summary.eventIncome]]
    : selected === "expense"
      ? [["Direct Cost", data.summary.directCost], ["OPEX", data.summary.opex], ["Tədbir xərcləri", data.summary.eventExpense], ["Əməkhaqqı", data.summary.payroll], ...data.costCenterBreakdown.map((item) => [`Xərc mərkəzi · ${item.label}`, item.amount])]
      : selected === "profit"
        ? [["Operating Profit", data.summary.operatingProfit], ["Net Profit", data.summary.netProfit]]
        : selected === "receivables"
          ? [["Real açıq tələbə borcu", data.receivableSummary.studentOutstanding.amount], ["Gecikmiş borc", data.receivableSummary.studentOverdue.amount], ["Gələcək ödəniş", data.receivableSummary.studentFuture.amount], ["Workshop", data.receivableSummary.workshop.amount], ["Masterclass", data.receivableSummary.masterclass.amount]]
          : [];
  const selectedCard = cards.find((card) => card.key === selected);

  return (
    <>
      <div className="finance-primary-kpi-grid" aria-label="Əsas maliyyə göstəriciləri">
        {cards.map((card) => {
          const Icon = card.icon;
          return <button type="button" className={`finance-kpi finance-primary-kpi is-${card.tone}`} onClick={() => setSelected(card.key)} key={card.key}><div className="finance-kpi-top"><span className="finance-kpi-label">{card.label}</span><span className="finance-kpi-icon"><Icon size={13} /></span></div><strong>{card.value}</strong><div className="finance-kpi-footer"><small>{card.helper}</small><span>Detala bax <ArrowRight /></span></div></button>;
        })}
        <button type="button" className="finance-kpi finance-primary-kpi finance-details-kpi" onClick={() => setSelected("details")}><div className="finance-kpi-top"><span className="finance-kpi-label">Ətraflı bax</span><span className="finance-kpi-icon"><Eye size={13} /></span></div><strong>6 KPI</strong><div className="finance-kpi-footer"><small>Gəlirdən xalis pul axınına qədər bütün maliyyə kartları</small><span>Kartları aç <ArrowRight /></span></div></button>
      </div>
      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="finance-dialog finance-kpi-detail-dialog">
          <DialogHeader>
            <DialogTitle>{selected === "details" ? "Ətraflı maliyyə KPI-ları" : selectedCard?.label}</DialogTitle>
            <DialogDescription>{selected === "details" ? "Mövcud maliyyə kartlarının aydın hesablanma qaydası və nəticəsi." : selectedCard?.helper}</DialogDescription>
          </DialogHeader>
          {selected === "details" ? (
            <div className="finance-detailed-kpi-grid">
              {data.kpis.filter((kpi) => kpi.label !== "Receivables").map((kpi, index) => { const Icon = financeKpiIcons[index] ?? BarChart3; return <article className={`finance-kpi is-${kpi.tone}`} key={kpi.label}><div className="finance-kpi-top"><span className="finance-kpi-label">{kpi.label}</span><span className="finance-kpi-icon"><Icon size={12} /></span></div><strong>{kpi.value}</strong><div className="finance-kpi-footer"><small>{kpi.helper}</small></div></article>; })}
            </div>
          ) : (
            <dl className="finance-kpi-breakdown">{detailRows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function cashFlowBucketKey(value: string, grouping: "day" | "week" | "month") {
  if (grouping === "day") return value;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (grouping === "month") return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const weekday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - weekday);
  return date.toISOString().slice(0, 10);
}

function formatCashFlowBucketLabel(value: string, grouping: "day" | "week" | "month") {
  if (grouping === "month") {
    return new Intl.DateTimeFormat("az-AZ", { month: "short", year: "2-digit", timeZone: "UTC" })
      .format(new Date(`${value}T00:00:00.000Z`));
  }
  const label = formatShortDate(value);
  return grouping === "week" ? `${label} həftəsi` : label;
}

function ExpenseBreakdownBarChart({
  slices,
  compact = false,
}: {
  slices: ChartSlice[];
  compact?: boolean;
}) {
  const total = sumChartValues(slices);
  const topShare = total > 0 ? Math.round((slices[0].value / total) * 100) : 0;
  const reduceMotion = useReducedMotion();
  const config = {
    value: { label: "Məbləğ", color: "#5974de" },
  } satisfies ChartConfig;
  const chartHeight = Math.max(compact ? 210 : 250, slices.length * (compact ? 38 : 44));

  return (
    <div className={`finance-expense-bars${compact ? " is-compact" : ""}`}>
      <div className="finance-expense-bars-meta">
        <strong>Top kateqoriyalar</strong>
        <span>{topShare}% ən çox</span>
      </div>
      <ChartContainer
        config={config}
        className="finance-expense-bars-chart"
        initialDimension={{ width: 520, height: chartHeight }}
        style={{ height: chartHeight }}
      >
        <BarChart
          accessibilityLayer
          data={slices}
          layout="vertical"
          margin={{ top: 4, right: 20, bottom: 4, left: 8 }}
        >
          <CartesianGrid horizontal={false} strokeDasharray="3 3" />
          <XAxis
            type="number"
            axisLine={false}
            tickLine={false}
            tickMargin={8}
            tickFormatter={formatCompactAmount}
          />
          <YAxis
            type="category"
            dataKey="label"
            axisLine={false}
            tickLine={false}
            tickMargin={9}
            width={compact ? 108 : 124}
          />
          <ChartTooltip
            cursor={{ fill: "rgb(89 116 222 / 6%)" }}
            content={<ChartTooltipContent hideLabel formatter={(value, _name, item) => (
              <div className="finance-tooltip-value">
                <span>{item.payload?.label}</span>
                <strong>{formatChartAmount(Number(value))}</strong>
              </div>
            )} />}
          />
          <Bar
            dataKey="value"
            fill="var(--color-value)"
            radius={[0, 9, 9, 0]}
            maxBarSize={compact ? 22 : 26}
            isAnimationActive={!reduceMotion}
            animationDuration={850}
          />
        </BarChart>
      </ChartContainer>
    </div>
  );
}

function OverviewWorkspace({ data }: { data: FinanceData }) {
  return (
    <>
      <div className="finance-overview-grid">
        <article className="finance-panel finance-overview-panel is-cashflow">
          <div className="finance-panel-head">
            <div>
              <span>Pul axını</span>
              <h2>Gəlir, xərc və xalis qazanc</h2>
            </div>
          </div>
          <CashFlowChart data={data} />
        </article>

        <article className="finance-panel finance-overview-panel is-distribution">
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
        <PaymentMethodChart data={data} />
      </div>

      <EducationCollectionReconciliation data={data} />

      <RecentFinanceActivity data={data} />
    </>
  );
}

function EducationCollectionReconciliation({ data }: { data: FinanceData }) {
  const report = data.educationCollectionReconciliation;
  return (
    <article className="finance-panel">
      <div className="finance-panel-head">
        <div>
          <span>Vahid ödənilmiş təhsil əməliyyatları mənbəyi</span>
          <h2>Ümumi ödəniş və köhnə ACTIVE-only fərqi</h2>
          <small>
            Ümumi {report.paidEducationTotal} · köhnə ACTIVE-only {report.legacyActiveOnlyTotal} · fərq {report.difference}
          </small>
        </div>
      </div>
      {report.rows.length > 0 ? (
        <div className="finance-table-wrap" data-erp-table-scroll="">
          <table className="finance-table" data-erp-table="">
            <thead>
              <tr>
                <th>Tələbə</th>
                <th>Məbləğ</th>
                <th>Ödəniş tarixi</th>
                <th>Aid olduğu ay</th>
                <th>Tədris statusu</th>
                <th>Ödəniş statusu</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((row) => (
                <tr key={row.id}>
                  <td><strong>{row.studentName}</strong><br /><small>{row.studentCode}</small></td>
                  <td className="finance-money positive">{row.amount}</td>
                  <td>{row.paidAt}</td>
                  <td>{row.paymentMonth}</td>
                  <td><StatusChip tone="neutral">{getAcademicStatusLabel(row.lifecycleStatus)}</StatusChip></td>
                  <td><StatusChip tone="success">{row.status}</StatusChip></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="finance-overview-empty">Ümumi və ACTIVE-only məbləğ arasında fərq yoxdur</div>
      )}
    </article>
  );
}

function getAcademicStatusLabel(value: string) {
  return {
    SLOT_WAITING: "Slot gözləyir",
    ACTIVE: "Aktiv",
    FROZEN: "Dondurulub",
    STOPPED: "Dayandırılıb",
    COMPLETED: "Tamamlayıb",
    DECLINED: "İmtina edib",
  }[value] ?? value;
}

function RecentFinanceActivity({ data }: { data: FinanceData }) {
  const rows = useMemo(() => {
    const payments = data.payments.map((payment) => ({
      id: `payment-${payment.id}`,
      dateKey: payment.dateKey,
      date: payment.paidAt,
      type: "Gəlir",
      description: getIncomeDescription(
        payment.sourceKind,
        payment.studentName,
        payment.sourceLabel,
      ),
      category: getIncomeReportingCategory(payment.sourceKind),
      amount: payment.amount,
      method: payment.method,
      tone: "success" as const,
      status: "Qəbul edildi",
    }));
    const expenses = [...data.expenses, ...data.payrollItems].map((expense) => ({
      id: `expense-${expense.id}`,
      dateKey: expense.dateKey,
      date: expense.expenseDate,
      type: "Xərc",
      description: [expense.vendor, expense.description]
        .filter((value) => value && value !== "-")
        .join(" — ") || expense.category,
      category: expense.reportingCategory,
      amount: `-${expense.amount}`,
      method: expense.method,
      tone: "danger" as const,
      status: "Qeyd edildi",
    }));

    return [...payments, ...expenses]
      .sort((a, b) => b.dateKey.localeCompare(a.dateKey))
      .slice(0, 5);
  }, [data.expenses, data.payments, data.payrollItems]);

  return (
    <article className="finance-panel finance-activity-panel">
      <div className="finance-panel-head finance-activity-head">
        <div>
          <span>Canlı jurnal</span>
          <h2>Son əməliyyatlar</h2>
        </div>
        <Link href={buildFinanceTabHref(data, "payments")}>
          Hamısına bax
          <ArrowRight size={14} />
        </Link>
      </div>
      {rows.length > 0 ? (
        <div className="finance-table-wrap" data-erp-table-scroll="">
          <table className="finance-table finance-activity-table" data-erp-table="" data-erp-sticky-first="">
            <thead>
              <tr>
                <th>Tarix</th>
                <th>Növ</th>
                <th>Təsvir</th>
                <th>Kateqoriya</th>
                <th>Məbləğ</th>
                <th>Ödəniş üsulu</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.date}</td>
                  <td><span className={`finance-movement-type is-${row.tone}`}>{row.type}</span></td>
                  <td><strong className="finance-activity-description">{row.description}</strong></td>
                  <td><span className={`finance-category-chip is-${row.tone}`}>{row.category}</span></td>
                  <td className={`finance-money ${row.tone === "success" ? "positive" : "negative"}`}>{row.amount}</td>
                  <td><span className="payment-method-chip">{row.method}</span></td>
                  <td><StatusChip tone={row.tone}>{row.status}</StatusChip></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="finance-overview-empty">Seçilmiş dövrdə əməliyyat yoxdur</div>
      )}
    </article>
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
  const reduceMotion = useReducedMotion();
  const config = Object.fromEntries(
    slices.map((slice, index) => [`slice${index}`, { label: slice.label, color: slice.color }])
  ) satisfies ChartConfig;

  return (
    <div className={`finance-donut-layout${compact ? " is-compact" : ""}`}>
      <div className="finance-donut">
        <ChartContainer config={config} className="finance-donut-chart" initialDimension={{ width: 156, height: 156 }}>
          <PieChart accessibilityLayer>
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel formatter={(value, _name, item) => (
                <div className="finance-tooltip-value">
                  <span>{item.payload?.label}</span>
                  <strong>{formatChartAmount(Number(value))}</strong>
                </div>
              )} />}
            />
            <Pie
              data={slices}
              dataKey="value"
              nameKey="label"
              innerRadius="70%"
              outerRadius="94%"
              paddingAngle={slices.length > 1 ? 2 : 0}
              cornerRadius={5}
              strokeWidth={0}
              isAnimationActive={!reduceMotion}
              animationDuration={900}
            >
              {slices.map((slice) => <Cell key={slice.label} fill={slice.color} />)}
            </Pie>
          </PieChart>
        </ChartContainer>
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

function formatChartAmount(value: number) {
  const rounded = Math.round(value);
  const formatted = rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${formatted} AZN`;
}

function formatCompactAmount(value: number) {
  const absolute = Math.abs(value);
  if (absolute >= 1000) {
    return `${value < 0 ? "-" : ""}${(absolute / 1000).toLocaleString("az-AZ", { maximumFractionDigits: 1 })}k`;
  }
  return Math.round(value).toLocaleString("az-AZ");
}

function useReducedMotion() {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia("(prefers-reduced-motion: reduce)");
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => true
  );
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
      <div className="finance-table-wrap" data-erp-table-scroll="">
        <table className="finance-table" data-erp-table="" data-erp-sticky-first="">
          <thead>
            <tr>
              <th>Tələbə</th>
              <th>Ödəyən</th>
              <th>Məbləğ</th>
              <th>Tarix</th>
              <th>Aid olduğu ay</th>
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
                      <span>{payment.studentCode} · {payment.sourceKind === "WORKSHOP" ? "Workshop" : "Tələbə"}</span>
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
                    {payment.sourceKind === "WORKSHOP" ? (
                      <Link className="finance-row-action-btn" href={payment.sourceHref as Route}>
                        <Eye size={13} />
                        Tədbirə bax
                      </Link>
                    ) : (
                      <PaymentCrudActions
                        data={data}
                        payment={payment}
                        updateAction={updateAction}
                        deleteAction={deleteAction}
                        onNotify={onNotify}
                      />
                    )}
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
        const result = unwrapActionResult(await action(formData));
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
          <button type="button" className="finance-row-action-btn" disabled={!data.permissions.canCreateExpense}>
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
                <span>Ödəniş növü</span>
                <FormSelect
                  name="scheduleType"
                  defaultValue={payment.scheduleTypeValue}
                  options={studentPaymentScheduleTypeOptions}
                />
              </label>
            </div>
            <label className="form-field">
              <span>Aid olduğu ay</span>
              <Input
                name="billingMonth"
                type="month"
                defaultValue={payment.paymentMonthValue}
                required
              />
            </label>
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
                <Input name="receiptFile" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" />
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

      {data.permissions.canVoidExpense ? <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
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
      </Dialog> : null}
    </div>
  );
}

type ReceivableFilter = "student" | "overdue" | "future" | "workshop" | "masterclass";

function DebtLedger({ data }: { data: FinanceData }) {
  const [filter, setFilter] = useState<ReceivableFilter>(() => {
    if (data.filters.source === "workshop") {
      return data.receivableSummary.workshop.count > 0 ? "workshop" : "masterclass";
    }
    return "student";
  });
  const summaryCards: Array<{
    key: ReceivableFilter;
    label: string;
    value: FinanceData["receivableSummary"]["studentOutstanding"];
    tone: string;
  }> = [
    { key: "student", label: "Qalıq borcu olanlar", value: data.receivableSummary.studentOutstanding, tone: "amber" },
    { key: "overdue", label: "Ödənişi gecikənlər", value: data.receivableSummary.studentOverdue, tone: "danger" },
    { key: "future", label: "Gələcək ödəniş", value: data.receivableSummary.studentFuture, tone: "blue" },
    { key: "workshop", label: "Workshop alacaqları", value: data.receivableSummary.workshop, tone: "mint" },
    { key: "masterclass", label: "Masterclass alacaqları", value: data.receivableSummary.masterclass, tone: "violet" },
  ];
  const debtors = data.debtors.filter((debt) => {
    if (filter === "student") return debt.sourceKind === "STUDENT";
    if (filter === "overdue") return debt.sourceKind === "STUDENT" && debt.receivableState === "OVERDUE";
    if (filter === "future") return debt.sourceKind === "STUDENT" && debt.receivableState === "FUTURE" && debt.isInSelectedPeriod;
    if (filter === "workshop") return debt.sourceKind === "WORKSHOP";
    return debt.sourceKind === "MASTERCLASS";
  });

  return (
    <article className="finance-panel finance-receivables-panel">
      <div className="finance-panel-head">
        <div>
          <span>{data.receivableSummary.periodLabel}</span>
          <h2>Alacaqlar nəzarəti</h2>
          <small>Tələbə, workshop və masterclass ödənişləri ayrı izlənir</small>
        </div>
        <AlertTriangle size={18} />
      </div>
      <div className="finance-receivable-summary" aria-label="Alacaq kateqoriyaları">
        {summaryCards.map((card) => (
          <button type="button" data-active={filter === card.key} data-tone={card.tone} onClick={() => setFilter(card.key)} key={card.key}>
            <span>{card.label}</span>
            <strong>{card.value.amount}</strong>
            <small>{card.value.count} qeyd</small>
          </button>
        ))}
      </div>
      <div className="finance-table-wrap" data-erp-table-scroll="">
        <table className="finance-table finance-debt-table" data-erp-table="" data-erp-sticky-first="">
          <thead>
            <tr>
              <th>Şəxs / mənbə</th>
              <th>Proqram / təlimçi</th>
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
                  <td><StatusChip tone={debt.tone}>{formatDebtStatus(debt)}</StatusChip></td>
                  <td>
                    <div className="finance-row-actions">
                      <Link className="finance-row-action-btn" href={debt.sourceHref as Route}>
                        <Eye size={13} />
                        {debt.sourceKind === "STUDENT" ? "Profil" : "Tədbir"}
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
                  <div className="finance-empty">Seçilmiş kateqoriyada alacaq tapılmadı</div>
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
      <ExpenseCategoryChart breakdown={data.expenseBreakdown} />
      <div className="finance-table-wrap" data-erp-table-scroll="">
        <table className="finance-table" data-erp-table="" data-erp-sticky-first="">
          <thead>
            <tr>
              <th>Kateqoriya</th>
              <th>Xərc mərkəzi</th>
              <th>Məbləğ</th>
              <th>Tarix</th>
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
                      <strong>{expense.reportingCategory}</strong>
                      <span>
                        {expense.sourceKind === "EVENT"
                          ? `${expense.category} · ${expense.workshopEventTitle}`
                          : `${expense.category} · ${getFinancialClassLabel(expense.financialClass)}`}
                      </span>
                      {expense.classificationReviewRequired ? <StatusChip tone="warning">Təsnifat yoxlanmalıdır</StatusChip> : null}
                    </div>
                  </td>
                  <td>
                    <span className="finance-cost-center-chip">
                      {expense.sourceKind === "EVENT" ? "Tədbir" : getCostCenterLabel(expense.costCenter)}
                    </span>
                  </td>
                  <td className="finance-money negative">{expense.amount}</td>
                  <td>{expense.expenseDate}</td>
                  <td><span className="payment-method-chip">{expense.method}</span></td>
                  <td>{expense.receipt}</td>
                  <td>{expense.description}</td>
                  <td>
                    {expense.workshopEventId ? (
                      <Link className="finance-row-action-btn" href={expense.sourceHref as Route}>
                        <Eye size={13} />
                        Tədbirə bax
                      </Link>
                    ) : (
                      <ExpenseCrudActions
                        data={data}
                        expense={expense}
                        updateAction={updateAction}
                        deleteAction={deleteAction}
                        onNotify={onNotify}
                      />
                    )}
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

function ExpenseCategoryChart({
  breakdown,
}: {
  breakdown: FinanceData["expenseBreakdown"];
}) {
  const slices = useMemo<ChartSlice[]>(() => {
    return breakdown
      .filter((slice) => slice.value > 0)
      .slice(0, 7)
      .map((slice, index) => ({
        label: slice.label,
        value: slice.value,
        helper: `${slice.count} qeyd`,
        color: chartPalette[index % chartPalette.length],
      }));
  }, [breakdown]);

  return (
    <section className="finance-expense-category-chart" aria-label="Xərclərin kateqoriya diaqramı">
      <div>
        <span>Kateqoriya bölgüsü</span>
        <strong>Aktiv filtr üzrə xərc strukturu</strong>
      </div>
      {slices.length > 0 ? (
        <ExpenseBreakdownBarChart
          slices={slices}
          compact
        />
      ) : (
        <div className="finance-overview-empty">Diaqram üçün xərc məlumatı yoxdur</div>
      )}
    </section>
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
      <div className="finance-table-wrap" data-erp-table-scroll="">
        <table className="finance-table" data-erp-table="" data-erp-sticky-first="">
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
        const result = unwrapActionResult(await action(formData));
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
    runMutation(new FormData(event.currentTarget), deleteAction, "Maliyyə hərəkəti ləğv edildi");
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
            <input type="hidden" name="staffTarget" value={expense.staffTarget} />
            <input type="hidden" name="salaryMode" value="NONE" />
            <input type="hidden" name="returnTo" value={data.returnTo} />
            <div className="field-grid">
              <label className="form-field">
                <span>Kateqoriya</span>
                <FormSelect
                  name="categoryId"
                  defaultValue={expense.categoryId}
                  options={data.categories
                    .filter((category) => category.isActive && !category.requiresProject && category.transactionType !== "INCOME")
                    .map((category) => ({
                      value: category.id,
                      label: `${category.name} / ${getFinancialClassLabel(category.financialClass)}`,
                    }))}
                  required
                />
              </label>
              <label className="form-field">
                <span>Xərc mərkəzi</span>
                <FormSelect
                  name="costCenter"
                  defaultValue={expense.costCenter || "OPERATIONS"}
                  options={financeCostCenterOptions}
                  required
                />
              </label>
            </div>
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
                <span>Kimə ödənilib</span>
                <Input name="vendor" defaultValue={expense.vendor === "-" ? "" : expense.vendor} maxLength={120} required />
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
                  <Input name="receiptFile" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" />
                </span>
              </label>
            </div>
            <label className="form-field">
              <span>Açıqlama</span>
              <textarea name="description" defaultValue={expense.description === "-" ? "" : expense.description} minLength={3} maxLength={700} required />
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
            Ləğv et
          </button>
        </DialogTrigger>
        <DialogContent className="finance-dialog finance-confirm-dialog">
          <DialogHeader>
            <DialogTitle>Maliyyə hərəkəti ləğv edilsin?</DialogTitle>
            <DialogDescription>
              Qeyd silinməyəcək; audit tarixçəsində saxlanılıb hesabatlardan çıxarılacaq.
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
                Ləğv et
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
  const source = nextValues.source ?? data.filters.source;

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

  if (source !== "all") {
    params.set("source", source);
  }

  const queryString = params.toString();
  return queryString ? `/finance?${queryString}` : "/finance";
}

function buildFinanceTabHref(data: FinanceData, tab: FinanceTab) {
  const query: Record<string, string> = {};

  if (data.filters.query) {
    query.q = data.filters.query;
  }

  if (data.filters.category) {
    query.category = data.filters.category;
  }

  if (data.filters.source !== "all") {
    query.source = data.filters.source;
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

function formatDebtStatus(debt: FinanceData["debtors"][number]) {
  if (debt.sourceKind === "WORKSHOP") {
    return "Workshop";
  }

  if (debt.sourceKind === "MASTERCLASS") {
    return "Masterclass";
  }

  if (debt.receivableState === "OVERDUE") {
    return "Gecikmiş";
  }

  if (debt.receivableState === "FUTURE") {
    return "Gələcək ödəniş";
  }

  return "Qalıq borc";
}

function cleanSelectValue(value: string) {
  return value === EMPTY_SELECT_VALUE ? "" : value;
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
