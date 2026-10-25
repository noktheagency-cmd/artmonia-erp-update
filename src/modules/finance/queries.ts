import { GUEST_DEMO_MARKER } from "@/modules/students/guest-demo-policy";
import { regularInvoiceSql } from "@/modules/students/guest-lesson-sql";
import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/server/db/prisma";
import { requireErpActor, type ErpActor } from "@/server/auth/actor";
import { formFilterString } from "@/modules/shared/form-values";
import {
  addMonths,
  formatAmount,
  formatCount,
  startOfMonth,
  toNumber,
} from "@/modules/shared/format";
import { getStudentPaymentMethodLabel } from "@/modules/students/payment-method";
import {
  buildStudentAdvanceRemainingValueSql,
  buildStudentDueDebtValueSql,
  buildStudentFutureReceivableValueSql,
  buildStudentOldestDebtDueDateSql,
} from "@/modules/students/student-billing-sql";
import {
  calculateFinanceStatement,
  getExpenseReportingCategory,
} from "@/modules/finance/reporting";

type StatusTone = "success" | "warning" | "danger" | "neutral" | "info";
type MovementType = "overview" | "payments" | "debts" | "expenses" | "payroll";
type FinanceSource = "all" | "student" | "workshop";
type ReceivableState = "DUE" | "OVERDUE" | "FUTURE";

export type FinanceFilters = {
  q?: string;
  category?: string;
  type?: string;
  from?: string;
  to?: string;
  source?: string;
};

export type FinanceData = {
  accessMode: "FULL" | "ENTRY_ONLY";
  returnTo: string;
  permissions: {
    canRecordPayment: boolean;
    canCreateExpense: boolean;
    canVoidExpense: boolean;
    canExport: boolean;
  };
  filters: {
    query: string;
    category: string;
    type: MovementType;
    from: string;
    to: string;
    source: FinanceSource;
    activeCount: number;
  };
  filterLabels: {
    category: string;
    type: string;
    period: string;
    source: string;
  };
  summary: {
    income: string;
    guestIncome: string;
    studentIncome: string;
    eventIncome: string;
    expense: string;
    operatingExpense: string;
    coreExpense: string;
    eventExpense: string;
    net: string;
    grossProfit: string;
    operatingProfit: string;
    netProfit: string;
    netCash: string;
    directCost: string;
    opex: string;
    capex: string;
    financingIn: string;
    financingOut: string;
    legacyLiability: string;
    payroll: string;
    debt: string;
    paymentCount: string;
    expenseCount: string;
    debtors: string;
  };
  counts: {
    overview: number;
    payments: number;
    debts: number;
    expenses: number;
    payroll: number;
  };
  previousMonthProfit: { amount: string; periodLabel: string } | null;
  receivableSummary: {
    periodLabel: string;
    studentOutstanding: { count: number; amount: string; amountValue: number };
    studentOverdue: { count: number; amount: string; amountValue: number };
    studentFuture: { count: number; amount: string; amountValue: number };
    workshop: { count: number; amount: string; amountValue: number };
    masterclass: { count: number; amount: string; amountValue: number };
  };
  educationCollectionReconciliation: {
    paidEducationTotal: string;
    legacyActiveOnlyTotal: string;
    difference: string;
    rows: Array<{
      id: string;
      studentName: string;
      studentCode: string;
      amount: string;
      paidAt: string;
      paymentMonth: string;
      lifecycleStatus: string;
      status: string;
    }>;
  };
  kpis: Array<{
    label: string;
    value: string;
    helper: string;
    tone: StatusTone;
  }>;
  expenseBreakdown: Array<{
    label: string;
    value: number;
    amount: string;
    count: number;
    sourceKind: "OPERATIONS" | "EVENT";
  }>;
  costCenterBreakdown: Array<{
    label: string;
    value: number;
    amount: string;
    count: number;
  }>;
  categories: Array<{
    id: string;
    code: string;
    name: string;
    description: string;
    isSystem: boolean;
    isActive: boolean;
    transactionType: string;
    financialClass: string;
    requiresStaff: boolean;
    requiresProject: boolean;
  }>;
  students: Array<{
    id: string;
    label: string;
    name: string;
    code: string;
    phone: string;
    program: string;
    teacher: string;
    balance: string;
    defaultAmount: string;
    defaultPaymentDate: string;
    defaultPaymentMonth: string;
  }>;
  staff: Array<{
    id: string;
    label: string;
    kind: "employee" | "teacher";
    meta: string;
    salaryMode: "STATIC" | "PERCENT";
    staticSalary: string;
    guestLessonSalary?: string;
    salaryPercent: string;
    salaryBase: string;
    calculatedSalary: string;
  }>;
  corporateCustomers: Array<{ id: string; name: string }>;
  payments: Array<{
    isGuest?: boolean;
    isTestData?: boolean;
    sourceKind: "STUDENT" | "WORKSHOP";
    sourceLabel: string;
    sourceHref: string;
    id: string;
    studentId: string;
    studentName: string;
    studentCode: string;
    payerName: string;
    amount: string;
    amountValue: number;
    amountInput: string;
    paidAt: string;
    dateKey: string;
    paidDateValue: string;
    paymentMonth: string;
    paymentMonthValue: string;
    scheduleTypeValue: string;
    methodValue: string;
    method: string;
    receipt: string;
    receiptFilePath: string;
    receiptReference: string;
    note: string;
  }>;
  expenses: Array<{
    workshopEventId: string;
    workshopEventTitle: string;
    sourceHref: string;
    id: string;
    categoryId: string;
    category: string;
    transactionType: string;
    financialClass: string;
    costCenter: string;
    classificationReviewRequired: boolean;
    reportingCategory: string;
    sourceKind: "OPERATIONS" | "EVENT";
    amount: string;
    amountValue: number;
    amountInput: string;
    expenseDate: string;
    dateKey: string;
    expenseDateValue: string;
    methodValue: string;
    method: string;
    vendor: string;
    staffName: string;
    staffTarget: string;
    salaryMode: string;
    salaryFormula: string;
    receipt: string;
    receiptFilePath: string;
    receiptReference: string;
    description: string;
  }>;
  debtors: Array<{
    sourceKind: "STUDENT" | "WORKSHOP" | "MASTERCLASS";
    sourceHref: string;
    id: string;
    studentName: string;
    studentCode: string;
    phone: string;
    program: string;
    teacher: string;
    balance: string;
    balanceValue: number;
    nextDueDate: string;
    overdueDays: string;
    tone: StatusTone;
    receivableState: ReceivableState;
    isInSelectedPeriod: boolean;
  }>;
  payrollItems: Array<{
    id: string;
    categoryId: string;
    category: string;
    transactionType: string;
    financialClass: string;
    costCenter: string;
    classificationReviewRequired: boolean;
    reportingCategory: string;
    sourceKind: "OPERATIONS" | "EVENT";
    amount: string;
    amountValue: number;
    amountInput: string;
    expenseDate: string;
    dateKey: string;
    expenseDateValue: string;
    methodValue: string;
    method: string;
    vendor: string;
    staffName: string;
    staffTarget: string;
    salaryMode: string;
    salaryFormula: string;
    receipt: string;
    receiptFilePath: string;
    receiptReference: string;
    description: string;
  }>;
  alerts: Array<{
    label: string;
    value: string;
    tone: StatusTone;
  }>;
};

type FinanceSummaryRow = {
  income: unknown;
  guestIncome: unknown;
  studentIncome: unknown;
  activeStudentIncome: unknown;
  workshopIncome: unknown;
  paymentCount: unknown;
  expense: unknown;
  operatingExpense: unknown;
  coreExpense: unknown;
  workshopExpense: unknown;
  directCost: unknown;
  opex: unknown;
  capex: unknown;
  financingIn: unknown;
  financingOut: unknown;
  legacyLiability: unknown;
  expenseCount: unknown;
  payrollCount: unknown;
  payroll: unknown;
  debt: unknown;
  debtors: unknown;
};

type CategoryRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isActive: boolean;
  transactionType: string;
  financialClass: string | null;
  requiresStaff: boolean;
  requiresProject: boolean;
};

type ExpenseBreakdownRow = {
  label: string;
  value: unknown;
  count: unknown;
  sourceKind: "OPERATIONS" | "EVENT";
};

type CostCenterBreakdownRow = {
  label: string;
  value: unknown;
  count: unknown;
};

type StudentOptionRow = {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  balanceDue: unknown;
  nextDueDate: Date | string | null;
  monthlyFee: unknown;
  programName: string | null;
  teacherName: string | null;
};

type StaffOptionRow = {
  id: string;
  label: string;
  kind: "employee" | "teacher";
  meta: string;
  salaryMode: "STATIC" | "PERCENT";
  staticSalary: unknown;
  guestLessonSalary: unknown;
  salaryPercent: unknown;
  salaryBase: unknown;
  calculatedSalary: unknown;
};

type PaymentRow = {
  isTestData: boolean;
  receiptPurpose: string;
  id: string;
  studentId: string;
  studentName: string;
  studentCode: string;
  lifecycleStatus: string;
  payerName: string | null;
  amount: unknown;
  paidAt: string;
  dateKey: string;
  paidDateValue: string;
  paymentMonth: string;
  paymentMonthValue: string;
  scheduleType: string;
  method: string;
  receiptFileName: string | null;
  receiptFilePath: string | null;
  receiptReference: string | null;
  note: string | null;
};

type WorkshopPaymentRow = {
  id: string;
  eventId: string;
  eventTitle: string;
  participantName: string;
  payerName: string | null;
  amount: unknown;
  paidAt: string;
  dateKey: string;
  paidDateValue: string;
  method: string;
  receiptFileName: string | null;
  receiptFilePath: string | null;
  receiptReference: string | null;
  note: string | null;
};

type ExpenseRow = {
  id: string;
  categoryId: string;
  category: string;
  transactionType: string;
  financialClass: string;
  costCenter: string | null;
  classificationReviewRequired: boolean;
  amount: unknown;
  expenseDate: string;
  dateKey: string;
  expenseDateValue: string;
  method: string;
  vendor: string | null;
  employeeUserId: string | null;
  teacherId: string | null;
  employeeName: string | null;
  teacherName: string | null;
  salaryMode: string;
  salaryPercent: unknown;
  salaryBaseAmount: unknown;
  salaryCalculatedAmount: unknown;
  receiptFileName: string | null;
  receiptFilePath: string | null;
  receiptReference: string | null;
  description: string | null;
  workshopEventId: string | null;
  workshopEventTitle: string | null;
};

type DebtRow = {
  studentId: string;
  studentName: string;
  studentCode: string;
  phone: string | null;
  balanceDue: unknown;
  nextDueDate: string | null;
  nextDueDateKey: string | null;
  overdueDays: unknown;
  programName: string | null;
  teacherName: string | null;
  receivableState: ReceivableState;
  isInSelectedPeriod: boolean;
};

type WorkshopDebtRow = {
  participantId: string;
  eventId: string;
  eventTitle: string;
  participantName: string;
  phone: string | null;
  balanceDue: unknown;
  eventDate: string;
  overdueDays: unknown;
  instructor: string | null;
  eventType: "WORKSHOP" | "MASTERCLASS";
};

type FinanceReceivableSummaryRow = {
  studentReceivableCount: unknown;
  studentOutstandingCount: unknown;
  studentOutstandingAmount: unknown;
  studentOverdueCount: unknown;
  studentOverdueAmount: unknown;
  studentFutureCount: unknown;
  studentFutureAmount: unknown;
  workshopCount: unknown;
  workshopAmount: unknown;
  masterclassCount: unknown;
  masterclassAmount: unknown;
};

const movementTypes: Array<{ value: MovementType; label: string }> = [
  { value: "overview", label: "Ümumi baxış" },
  { value: "payments", label: "Ödənişlər" },
  { value: "debts", label: "Alacaqlar" },
  { value: "expenses", label: "Xərclər" },
  { value: "payroll", label: "Əməkhaqqı" },
];

export async function getFinanceData(
  input: FinanceFilters = {}
): Promise<FinanceData> {
  const actor = await requireErpActor();
  const financeReadPermissions = ["billing.invoice.read", "billing.payment.read", "billing.expense.read"] as const;
  const canViewFinance = financeReadPermissions.some((permission) => actor.permissions.has(permission));
  const canUseLimitedEntry = actor.permissions.has("billing.entry.create");
  if (!canViewFinance && !canUseLimitedEntry) throw new Error("Missing permission: billing.finance.access");
  const prisma = getPrisma();
  const today = new Date();
  const monthStart = startOfMonth(today);
  const nextMonthStart = addMonths(monthStart, 1);
  const monthEnd = addDays(nextMonthStart, -1);
  if (!canViewFinance) {
    return getLimitedFinanceData({ actor, input, today, monthStart, monthEnd });
  }
  const normalizedFilters = normalizeFinanceFilters(input, monthStart, monthEnd);
  const canReadWorkshopFinance = actor.permissions.has("workshop.finance.read");
  const includeStudentSource = normalizedFilters.source !== "workshop";
  const includeWorkshopSource =
    canReadWorkshopFinance && normalizedFilters.source !== "student";
  const fromDate = normalizedFilters.from
    ? new Date(`${normalizedFilters.from}T00:00:00.000Z`)
    : monthStart;
  const toDate = normalizedFilters.to
    ? new Date(`${normalizedFilters.to}T00:00:00.000Z`)
    : addMonths(nextMonthStart, 0);
  const endDateExclusive = addDays(toDate, 1);
  const activePeriodStart = startOfMonth(fromDate);
  const activePeriodEnd = addMonths(startOfMonth(toDate), 1);
  const defaultFrom = formatDateInput(monthStart);
  const defaultTo = formatDateInput(monthEnd);
  const searchSql = buildSearchSql(normalizedFilters.query);
  const categorySql = normalizedFilters.category
    ? Prisma.sql`and fec.id = ${normalizedFilters.category}::uuid`
    : Prisma.empty;
  const studentSourceSql = includeStudentSource ? Prisma.empty : Prisma.sql`and false`;
  const workshopSourceSql = includeWorkshopSource ? Prisma.empty : Prisma.sql`and false`;
  const expenseSourceSql = !canReadWorkshopFinance || normalizedFilters.source === "student"
    ? Prisma.sql`and fe.workshop_event_id is null`
    : normalizedFilters.source === "workshop"
      ? Prisma.sql`and fe.workshop_event_id is not null`
      : Prisma.empty;
  const needsPayments = normalizedFilters.type === "overview" || normalizedFilters.type === "payments";
  const needsExpenses = normalizedFilters.type === "overview" || normalizedFilters.type === "expenses";
  const needsPayroll = normalizedFilters.type === "overview" || normalizedFilters.type === "payroll";
  const needsDebts = normalizedFilters.type === "overview" || normalizedFilters.type === "debts";
  const expenseModeSql = normalizedFilters.type === "payroll"
    ? Prisma.sql`and fe.salary_mode <> 'NONE'::"erp"."FinanceSalaryMode" and fec.code is distinct from 'OP_MANAGEMENT_COMP'`
    : Prisma.empty;
  const expenseListSalarySql = normalizedFilters.type === "overview"
    ? Prisma.sql`and (fe.salary_mode = 'NONE'::"erp"."FinanceSalaryMode" or fec.code = 'OP_MANAGEMENT_COMP')`
    : Prisma.empty;
  const studentReceivableCtes = Prisma.sql`
    current_enrollment as (
      select
        e.student_id,
        sum(e.monthly_fee) as monthly_fee,
        string_agg(distinct p.name, ', ' order by p.name) as program_name,
        string_agg(distinct t.full_name, ', ' order by t.full_name) filter (where t.full_name is not null) as teacher_name
      from erp.enrollments e
      join erp.programs p on p.id = e.program_id
      left join erp.teachers t on t.id = e.teacher_id
      where e.status in ('ACTIVE'::"erp"."EnrollmentStatus", 'PAUSED'::"erp"."EnrollmentStatus")
      group by e.student_id
    ),
    student_receivable_position as (
      select
        s.id as student_id,
        s.code as student_code,
        c.full_name as student_name,
        c.phone_display as phone,
        ce.program_name,
        ce.teacher_name,
        ${buildStudentDueDebtValueSql({
          studentId: Prisma.sql`s.id`,
          asOfDate: today,
        })} as due_balance,
        ${buildStudentFutureReceivableValueSql({
          studentId: Prisma.sql`s.id`,
          asOfDate: today,
        })} as future_invoice_balance,
        ${buildStudentAdvanceRemainingValueSql({
          studentId: Prisma.sql`s.id`,
        })} as advance_remaining,
        ${buildStudentOldestDebtDueDateSql({
          studentId: Prisma.sql`s.id`,
          asOfDate: today,
        })} as debt_due_date,
        (
          select min(invoice.due_date)
          from erp.invoices invoice
          where invoice.student_id = s.id
            and invoice.status <> 'VOID'::"erp"."InvoiceStatus"
            and invoice.balance_due > 0
            and invoice.due_date > ${today}::date
        ) as future_due_date,
        (
          select greatest(
            coalesce(cs.qualified_at + interval '1 month', ${today}::date + interval '1 day'),
            ${today}::date + interval '1 day'
          )::date
          from erp.course_sales cs
          where cs.student_id = s.id
            and cs.status = 'DEPOSIT'
            and cs.cancelled_at is null
          order by cs.created_at desc
          limit 1
        ) as advance_due_date
      from erp.students s
      join erp.contacts c on c.id = s.contact_id
      left join current_enrollment ce on ce.student_id = s.id
      where true
        and s.is_test_data = false
        ${studentSourceSql}
        ${searchSql.debts}
    ),
    student_receivable_position_with_future as (
      select
        *,
        future_invoice_balance + advance_remaining as future_balance,
        coalesce(
          future_due_date,
          case
            when advance_remaining > 0 then advance_due_date
            else null
          end
        ) as receivable_future_due_date,
        (advance_remaining > 0) as is_advance_receivable
      from student_receivable_position
    ),
    student_receivable_base as (
      select
        student_id, student_code, student_name, phone, program_name, teacher_name,
        due_balance as balance_due, debt_due_date as next_due_date,
        false as is_advance_receivable
      from student_receivable_position_with_future
      where due_balance > 0
      union all
      select
        student_id, student_code, student_name, phone, program_name, teacher_name,
        future_balance as balance_due, receivable_future_due_date as next_due_date,
        is_advance_receivable
      from student_receivable_position_with_future
      where future_balance > 0
    ),
    student_receivables as (
      select * from student_receivable_base where balance_due > 0
    )
  `;

  const previousMonthStart = addMonths(activePeriodStart, -1);
  const summaryQuery = (periodStart: Date, periodEnd: Date) => Prisma.sql`
      with filtered_expenses as (
        select
          fe.amount,
          fe.financial_class,
          fe.transaction_type,
          fe.salary_mode,
          fec.code as category_code,
          fe.workshop_event_id
        from erp.finance_expenses fe
        join erp.finance_expense_categories fec on fec.id = fe.category_id
        left join erp.users eu on eu.id = fe.employee_user_id
        left join erp.teachers t on t.id = fe.teacher_id
        where fe.expense_date >= ${periodStart}
          and fe.expense_date < ${periodEnd}
          and fe.voided_at is null
          ${expenseSourceSql}
          ${categorySql}
          ${searchSql.expenses}
      )
      select
        coalesce((select sum(p.amount) from erp.payments p join erp.students s on s.id=p.student_id join erp.contacts c on c.id=s.contact_id
          where p.receipt_purpose='ONE_OFF' and p.refunded_at is null and not s.is_test_data
            and p.paid_at >= ${periodStart} and p.paid_at < ${periodEnd}
            ${studentSourceSql} ${searchSql.payments}),0) as "guestIncome",
        coalesce((
          select sum(p.amount)
          from erp.payments p
          join erp.students s on s.id = p.student_id
          join erp.contacts c on c.id = s.contact_id
          where p.receipt_purpose <> 'ONE_OFF' and p.refunded_at is null and p.paid_at >= ${periodStart}
            and p.paid_at < ${periodEnd}
            and s.is_test_data = false
            ${studentSourceSql}
            ${searchSql.payments}
        ), 0) + coalesce((
          select sum(wp.amount)
          from erp.workshop_payments wp
          join erp.workshop_events we on we.id = wp.event_id
          join erp.workshop_participants participant on participant.id = wp.participant_id
          where wp.paid_at >= ${periodStart}
            and wp.paid_at < ${periodEnd}
            and wp.voided_at is null
            ${workshopSourceSql}
            ${searchSql.workshopPayments}
        ), 0) as "income",
        coalesce((
          select sum(p.amount)
          from erp.payments p
          join erp.students s on s.id = p.student_id
          join erp.contacts c on c.id = s.contact_id
          where p.receipt_purpose <> 'ONE_OFF' and p.refunded_at is null and p.paid_at >= ${periodStart}
            and p.paid_at < ${periodEnd}
            and s.is_test_data = false
            ${studentSourceSql}
            ${searchSql.payments}
        ), 0) as "studentIncome",
        coalesce((
          select sum(p.amount)
          from erp.payments p
          join erp.students s on s.id = p.student_id
          join erp.contacts c on c.id = s.contact_id
          where p.receipt_purpose <> 'ONE_OFF' and p.refunded_at is null and p.paid_at >= ${periodStart}
            and p.paid_at < ${periodEnd}
            and s.lifecycle_status = 'ACTIVE'::"erp"."StudentLifecycleStatus"
            and s.is_test_data = false
            ${studentSourceSql}
            ${searchSql.payments}
        ), 0) as "activeStudentIncome",
        coalesce((
          select sum(wp.amount)
          from erp.workshop_payments wp
          join erp.workshop_events we on we.id = wp.event_id
          join erp.workshop_participants participant on participant.id = wp.participant_id
          where wp.paid_at >= ${periodStart}
            and wp.paid_at < ${periodEnd}
            and wp.voided_at is null
            ${workshopSourceSql}
            ${searchSql.workshopPayments}
        ), 0) as "workshopIncome",
        coalesce((
          select count(*)::int
          from erp.payments p
          join erp.students s on s.id = p.student_id
          join erp.contacts c on c.id = s.contact_id
          where p.receipt_purpose <> 'ONE_OFF' and p.refunded_at is null and p.paid_at >= ${periodStart}
            and p.paid_at < ${periodEnd}
            and s.is_test_data = false
            ${studentSourceSql}
            ${searchSql.payments}
        ), 0) + coalesce((
          select count(*)::int
          from erp.workshop_payments wp
          join erp.workshop_events we on we.id = wp.event_id
          join erp.workshop_participants participant on participant.id = wp.participant_id
          where wp.paid_at >= ${periodStart}
            and wp.paid_at < ${periodEnd}
            and wp.voided_at is null
            ${workshopSourceSql}
            ${searchSql.workshopPayments}
        ), 0) as "paymentCount",
        coalesce((
          select sum(amount)
          from filtered_expenses
          where financial_class in (
            'DIRECT_COST'::"erp"."FinanceFinancialClass",
            'OPEX'::"erp"."FinanceFinancialClass"
          )
        ), 0) as "expense",
        coalesce((
          select sum(amount)
          from filtered_expenses
          where financial_class = 'OPEX'::"erp"."FinanceFinancialClass"
        ), 0) as "operatingExpense",
        coalesce((
          select sum(amount)
          from filtered_expenses
          where workshop_event_id is null
            and financial_class in (
              'DIRECT_COST'::"erp"."FinanceFinancialClass",
              'OPEX'::"erp"."FinanceFinancialClass"
            )
        ), 0) as "coreExpense",
        coalesce((
          select sum(amount)
          from filtered_expenses
          where workshop_event_id is not null
            and financial_class in (
              'DIRECT_COST'::"erp"."FinanceFinancialClass",
              'OPEX'::"erp"."FinanceFinancialClass"
            )
        ), 0) as "workshopExpense",
        coalesce((
          select sum(amount) from filtered_expenses
          where financial_class = 'DIRECT_COST'::"erp"."FinanceFinancialClass"
        ), 0) as "directCost",
        coalesce((
          select sum(amount) from filtered_expenses
          where financial_class = 'OPEX'::"erp"."FinanceFinancialClass"
        ), 0) as "opex",
        coalesce((
          select sum(amount) from filtered_expenses
          where financial_class = 'CAPEX'::"erp"."FinanceFinancialClass"
        ), 0) as "capex",
        coalesce((
          select sum(amount) from filtered_expenses
          where transaction_type = 'FINANCING_IN'::"erp"."FinanceTransactionType"
        ), 0) as "financingIn",
        coalesce((
          select sum(amount) from filtered_expenses
          where transaction_type = 'FINANCING_OUT'::"erp"."FinanceTransactionType"
            and financial_class = 'FINANCING'::"erp"."FinanceFinancialClass"
        ), 0) as "financingOut",
        coalesce((
          select sum(amount) from filtered_expenses
          where financial_class = 'LEGACY_LIABILITY'::"erp"."FinanceFinancialClass"
        ), 0) as "legacyLiability",
        coalesce((
          select count(*)::int from filtered_expenses
        ), 0) as "expenseCount",
        coalesce((
          select count(*)::int from filtered_expenses
          where salary_mode <> 'NONE'::"erp"."FinanceSalaryMode"
            and category_code is distinct from 'OP_MANAGEMENT_COMP'
        ), 0) as "payrollCount",
        coalesce((
          select sum(amount) from filtered_expenses
          where salary_mode <> 'NONE'::"erp"."FinanceSalaryMode"
            and category_code is distinct from 'OP_MANAGEMENT_COMP'
        ), 0) as "payroll",
        0 as "debt",
        0 as "debtors"
    `;
  const [
    summaryRows,
    previousMonthRows,
    receivableSummaryRows,
    expenseBreakdownRows,
    costCenterBreakdownRows,
    categoryRows,
    studentRows,
    staffRows,
    paymentRows,
    workshopPaymentRows,
    expenseRows,
    payrollRows,
    debtRows,
    workshopDebtRows,
    corporateCustomerRows,
  ] = await Promise.all([
    prisma.$queryRaw<FinanceSummaryRow[]>(summaryQuery(fromDate, endDateExclusive)),
    prisma.$queryRaw<FinanceSummaryRow[]>(summaryQuery(previousMonthStart, activePeriodStart)),
    prisma.$queryRaw<FinanceReceivableSummaryRow[]>(Prisma.sql`
      with ${studentReceivableCtes},
      event_receivables as (
        select
          we.event_type::text as event_type,
          greatest(0, participant.list_price - participant.discount_amount - coalesce(paid.total, 0)) as balance_due
        from erp.workshop_participants participant
        join erp.workshop_events we on we.id = participant.event_id
        left join lateral (
          select sum(wp.amount) as total
          from erp.workshop_payments wp
          where wp.participant_id = participant.id and wp.voided_at is null
        ) paid on true
        where participant.cancelled_at is null
          and participant.is_gift = false
          and we.event_date >= ${fromDate}::date
          and we.event_date < ${endDateExclusive}::date
          and participant.list_price - participant.discount_amount - coalesce(paid.total, 0) > 0
          ${workshopSourceSql}
          ${searchSql.workshopDebts}
      )
      select
        (select count(*)::int from student_receivables) as "studentReceivableCount",
        (select count(*)::int from student_receivables where next_due_date <= ${today}::date) as "studentOutstandingCount",
        coalesce((select sum(balance_due) from student_receivables where next_due_date <= ${today}::date), 0) as "studentOutstandingAmount",
        (select count(*)::int from student_receivables where next_due_date < ${today}::date) as "studentOverdueCount",
        coalesce((select sum(balance_due) from student_receivables where next_due_date < ${today}::date), 0) as "studentOverdueAmount",
        (select count(*)::int from student_receivables where next_due_date > ${today}::date and ((next_due_date >= ${fromDate}::date and next_due_date < ${endDateExclusive}::date) or is_advance_receivable)) as "studentFutureCount",
        coalesce((select sum(balance_due) from student_receivables where next_due_date > ${today}::date and ((next_due_date >= ${fromDate}::date and next_due_date < ${endDateExclusive}::date) or is_advance_receivable)), 0) as "studentFutureAmount",
        count(*) filter (where event_type = 'WORKSHOP')::int as "workshopCount",
        coalesce(sum(balance_due) filter (where event_type = 'WORKSHOP'), 0) as "workshopAmount",
        count(*) filter (where event_type = 'MASTERCLASS')::int as "masterclassCount",
        coalesce(sum(balance_due) filter (where event_type = 'MASTERCLASS'), 0) as "masterclassAmount"
      from event_receivables
    `),
    needsExpenses || needsPayroll ? prisma.$queryRaw<ExpenseBreakdownRow[]>(Prisma.sql`
      select
        case
          when fe.workshop_event_id is not null then 'Tədbirlər'
          else fec.name
        end as "label",
        sum(fe.amount) as "value",
        count(*)::int as "count",
        case
          when fe.workshop_event_id is not null then 'EVENT'
          else 'OPERATIONS'
        end as "sourceKind"
      from erp.finance_expenses fe
      join erp.finance_expense_categories fec on fec.id = fe.category_id
      left join erp.users eu on eu.id = fe.employee_user_id
      left join erp.teachers t on t.id = fe.teacher_id
      where fe.expense_date >= ${fromDate}
        and fe.expense_date < ${endDateExclusive}
        and fe.voided_at is null
        ${expenseSourceSql}
        ${expenseModeSql}
        ${categorySql}
        ${searchSql.expenses}
      group by
        case when fe.workshop_event_id is not null then 'Tədbirlər' else fec.name end,
        case when fe.workshop_event_id is not null then 'EVENT' else 'OPERATIONS' end
      order by sum(fe.amount) desc
    `) : Promise.resolve([] as ExpenseBreakdownRow[]),
    needsExpenses || needsPayroll ? prisma.$queryRaw<CostCenterBreakdownRow[]>(Prisma.sql`
      select
        case
          when fe.workshop_event_id is not null then 'Tədbirlər'
          when fe.cost_center is null then 'Təyin edilməyib'
          else fe.cost_center::text
        end as "label",
        sum(fe.amount) as "value",
        count(*) as "count"
      from erp.finance_expenses fe
      join erp.finance_expense_categories fec on fec.id = fe.category_id
      left join erp.users eu on eu.id = fe.employee_user_id
      left join erp.teachers t on t.id = fe.teacher_id
      where fe.expense_date >= ${fromDate}
        and fe.expense_date < ${endDateExclusive}
        and fe.voided_at is null
        and fe.financial_class in (
          'DIRECT_COST'::"erp"."FinanceFinancialClass",
          'OPEX'::"erp"."FinanceFinancialClass"
        )
        ${expenseSourceSql}
        ${expenseModeSql}
        ${categorySql}
        ${searchSql.expenses}
      group by
        case
          when fe.workshop_event_id is not null then 'Tədbirlər'
          when fe.cost_center is null then 'Təyin edilməyib'
          else fe.cost_center::text
        end
      order by sum(fe.amount) desc
    `) : Promise.resolve([] as CostCenterBreakdownRow[]),
    prisma.$queryRaw<CategoryRow[]>(Prisma.sql`
      select
        fec.id::text as "id",
        fec.code,
        fec.name,
        fec.description,
        fec.is_system as "isSystem",
        fec.is_active as "isActive",
        fec.transaction_type::text as "transactionType",
        fec.financial_class::text as "financialClass",
        fec.requires_staff as "requiresStaff",
        fec.requires_project as "requiresProject"
      from erp.finance_expense_categories fec
      order by fec.is_system desc, fec.name asc
    `),
    prisma.$queryRaw<StudentOptionRow[]>(Prisma.sql`
      select
        s.id::text as "id",
        s.code,
        c.full_name as "name",
        c.phone_display as "phone",
        coalesce(inv.balance_due, 0) as "balanceDue",
        inv.next_due_date as "nextDueDate",
        ae.monthly_fee as "monthlyFee",
        ae.program_name as "programName",
        ae.teacher_name as "teacherName"
      from erp.students s
      join erp.contacts c on c.id = s.contact_id
      left join lateral (
        select
          coalesce(sum(i.balance_due), 0) as balance_due,
          min(i.due_date) filter (where i.balance_due > 0) as next_due_date
        from erp.invoices i
        where i.student_id = s.id
          and i.status <> 'VOID'::"erp"."InvoiceStatus" and ${regularInvoiceSql(Prisma.sql`i.id`)}
      ) inv on true
      left join lateral (
        select
          e.monthly_fee,
          p.name as program_name,
          t.full_name as teacher_name
        from erp.enrollments e
        join erp.programs p on p.id = e.program_id
        left join erp.teachers t on t.id = e.teacher_id
        where e.student_id = s.id
        order by e.start_date desc, e.created_at desc
        limit 1
      ) ae on true
      where s.lifecycle_status <> 'DECLINED'::"erp"."StudentLifecycleStatus"
        and s.is_test_data = false
      order by c.full_name asc, s.code asc
      limit 140
    `),
    prisma.$queryRaw<StaffOptionRow[]>(Prisma.sql`
      select
        concat('user:', u.id::text) as "id",
        he.full_name as "label",
        'employee' as "kind",
        concat(he.position, ' · ', he.department) as "meta",
        he.salary_mode::text as "salaryMode",
        he.salary_amount as "staticSalary",
        0::numeric as "guestLessonSalary",
        coalesce(he.salary_percent, 0) as "salaryPercent",
        case when he.salary_mode = 'STATIC'::"erp"."FinanceSalaryMode" then he.salary_amount else coalesce(last_salary.salary_base_amount, 0) end as "salaryBase",
        case when he.salary_mode = 'STATIC'::"erp"."FinanceSalaryMode" then he.salary_amount else round(coalesce(last_salary.salary_base_amount, 0) * coalesce(he.salary_percent, 0) / 100, 2) end as "calculatedSalary"
      from erp.hr_employees he
      join erp.users u on u.id = he.user_id
      left join lateral (
        select
          fe.salary_base_amount
        from erp.finance_expenses fe
        where fe.employee_user_id = u.id
        order by fe.expense_date desc, fe.created_at desc
        limit 1
      ) last_salary on true
      where u.is_active = true and he.status <> 'INACTIVE'::"erp"."HrEmployeeStatus"
        and not exists (
          select 1 from erp.teachers linked_teacher
          where linked_teacher.id = he.teacher_id or linked_teacher.user_id = u.id
        )

      union all

      select
        concat('teacher:', t.id::text) as "id",
        t.full_name as "label",
        'teacher' as "kind",
        coalesce(t.phone, 'Müəllim') as "meta",
        case when he.salary_mode = 'STATIC' then 'STATIC' else 'PERCENT' end as "salaryMode",
        case when he.salary_mode = 'STATIC' then he.salary_amount else 0 end as "staticSalary",
        coalesce(guest.payout_amount, 0) as "guestLessonSalary",
        case when he.salary_mode = 'STATIC' then 0 else coalesce(rule.salary_percent, last_salary.salary_percent, 0) end as "salaryPercent",
        case when he.salary_mode = 'STATIC' then he.salary_amount else coalesce(payout.eligible_revenue, last_salary.salary_base_amount, 0) end as "salaryBase",
        case when he.salary_mode = 'STATIC' then he.salary_amount + coalesce(guest.payout_amount, 0) else coalesce(payout.payout_amount, last_salary.salary_calculated_amount, 0) end as "calculatedSalary"
      from erp.teachers t
      left join lateral (
        select employee.salary_mode, employee.salary_amount
        from erp.hr_employees employee
        where employee.teacher_id = t.id
          or (employee.teacher_id is null and employee.user_id = t.user_id)
        order by (employee.teacher_id = t.id) desc nulls last
        limit 1
      ) he on true
      left join lateral (
        select tcr.salary_percent
        from erp.teacher_contract_rules tcr
        where tcr.teacher_id = t.id
          and tcr.valid_from <= ${activePeriodStart}
          and (tcr.valid_to is null or tcr.valid_to >= ${activePeriodStart})
        order by tcr.valid_from desc, tcr.created_at desc
        limit 1
      ) rule on true
      left join lateral (
        select tp.eligible_revenue, tp.payout_amount
        from erp.teacher_payouts tp
        where tp.teacher_id = t.id
          and tp.period_month = ${activePeriodStart}
        order by tp.created_at desc
        limit 1
      ) payout on true
      left join lateral (
        select sum(line.payout_amount) as payout_amount from erp.teacher_payout_lines line
        join erp.teacher_payouts parent on parent.id=line.payout_id
        join erp.single_lessons lesson on lesson.payment_id=line.payment_id
        where parent.teacher_id=t.id and parent.period_month=${activePeriodStart}
          and line.enrollment_id is null and lesson.teacher_id=t.id
      ) guest on true
      left join lateral (
        select
          fe.salary_percent,
          fe.salary_base_amount,
          coalesce(fe.salary_calculated_amount, fe.amount) as salary_calculated_amount
        from erp.finance_expenses fe
        where fe.teacher_id = t.id
          and fe.salary_mode = 'PERCENT'::"erp"."FinanceSalaryMode"
        order by fe.expense_date desc, fe.created_at desc
        limit 1
      ) last_salary on true
      where t.is_active = true
      order by "label" asc
    `),
    needsPayments ? prisma.$queryRaw<PaymentRow[]>(Prisma.sql`
      select
        p.id::text as "id",
        s.id::text as "studentId",
        c.full_name as "studentName",
        s.code as "studentCode",
        s.lifecycle_status::text as "lifecycleStatus",
        p.payer_name as "payerName",
        p.receipt_purpose as "receiptPurpose",
        s.is_test_data as "isTestData",
        p.amount,
        to_char(p.paid_at, 'DD.MM.YYYY') as "paidAt",
        to_char(p.paid_at, 'YYYY-MM-DD') as "dateKey",
        to_char(p.paid_at, 'YYYY-MM-DD') as "paidDateValue",
        case
          when p.schedule_type = 'ONE_TIME'::"erp"."PaymentScheduleType" then 'Birdəfəlik'
          else to_char(p.payment_month, 'MM.YYYY')
        end as "paymentMonth",
        to_char(p.payment_month, 'YYYY-MM') as "paymentMonthValue",
        p.schedule_type::text as "scheduleType",
        p.method::text as "method",
        p.receipt_file_name as "receiptFileName",
        p.receipt_file_path as "receiptFilePath",
        p.receipt_reference as "receiptReference",
        p.note
      from erp.payments p
      join erp.students s on s.id = p.student_id
      join erp.contacts c on c.id = s.contact_id
      where p.paid_at >= ${fromDate}
        and p.paid_at < ${endDateExclusive}
        and (s.is_test_data = false or (
          s.is_test_data and s.notes like ${GUEST_DEMO_MARKER + "%"} and p.receipt_purpose='ONE_OFF'
          and not exists(select 1 from erp.enrollments demo_enrollment where demo_enrollment.student_id=s.id)
        ))
        ${studentSourceSql}
        ${searchSql.payments}
      order by p.paid_at desc, p.created_at desc
    `) : Promise.resolve([] as PaymentRow[]),
    needsPayments ? prisma.$queryRaw<WorkshopPaymentRow[]>(Prisma.sql`
      select
        wp.id::text as "id",
        we.id::text as "eventId",
        we.title as "eventTitle",
        participant.full_name as "participantName",
        wp.payer_name as "payerName",
        wp.amount,
        to_char(wp.paid_at, 'DD.MM.YYYY') as "paidAt",
        to_char(wp.paid_at, 'YYYY-MM-DD') as "dateKey",
        to_char(wp.paid_at, 'YYYY-MM-DD') as "paidDateValue",
        wp.method::text as "method",
        wp.receipt_file_name as "receiptFileName",
        wp.receipt_file_path as "receiptFilePath",
        wp.receipt_reference as "receiptReference",
        wp.note
      from erp.workshop_payments wp
      join erp.workshop_events we on we.id = wp.event_id
      join erp.workshop_participants participant on participant.id = wp.participant_id
      where wp.paid_at >= ${fromDate}
        and wp.paid_at < ${endDateExclusive}
        and wp.voided_at is null
        ${workshopSourceSql}
        ${searchSql.workshopPayments}
      order by wp.paid_at desc, wp.created_at desc
    `) : Promise.resolve([] as WorkshopPaymentRow[]),
    needsExpenses ? prisma.$queryRaw<ExpenseRow[]>(Prisma.sql`
      select
        fe.id::text as "id",
        fec.id::text as "categoryId",
        fec.name as "category",
        fe.transaction_type::text as "transactionType",
        fe.financial_class::text as "financialClass",
        fe.cost_center::text as "costCenter",
        fe.classification_review_required as "classificationReviewRequired",
        fe.amount,
        to_char(fe.expense_date, 'DD.MM.YYYY') as "expenseDate",
        to_char(fe.expense_date, 'YYYY-MM-DD') as "dateKey",
        to_char(fe.expense_date, 'YYYY-MM-DD') as "expenseDateValue",
        fe.method::text as "method",
        fe.vendor,
        fe.employee_user_id::text as "employeeUserId",
        fe.teacher_id::text as "teacherId",
        eu.full_name as "employeeName",
        t.full_name as "teacherName",
        fe.salary_mode::text as "salaryMode",
        fe.salary_percent as "salaryPercent",
        fe.salary_base_amount as "salaryBaseAmount",
        fe.salary_calculated_amount as "salaryCalculatedAmount",
        fe.receipt_file_name as "receiptFileName",
        fe.receipt_file_path as "receiptFilePath",
        fe.receipt_reference as "receiptReference",
        fe.description,
        fe.workshop_event_id::text as "workshopEventId",
        we.title as "workshopEventTitle"
      from erp.finance_expenses fe
      join erp.finance_expense_categories fec on fec.id = fe.category_id
      left join erp.users eu on eu.id = fe.employee_user_id
      left join erp.teachers t on t.id = fe.teacher_id
      left join erp.workshop_events we on we.id = fe.workshop_event_id
      where fe.expense_date >= ${fromDate}
        and fe.expense_date < ${endDateExclusive}
        and fe.voided_at is null
        ${expenseListSalarySql}
        ${expenseSourceSql}
        ${categorySql}
        ${searchSql.expenses}
      order by fe.expense_date desc, fe.created_at desc
    `) : Promise.resolve([] as ExpenseRow[]),
    needsPayroll ? prisma.$queryRaw<ExpenseRow[]>(Prisma.sql`
      select
        fe.id::text as "id",
        fec.id::text as "categoryId",
        fec.name as "category",
        fe.transaction_type::text as "transactionType",
        fe.financial_class::text as "financialClass",
        fe.cost_center::text as "costCenter",
        fe.classification_review_required as "classificationReviewRequired",
        fe.amount,
        to_char(fe.expense_date, 'DD.MM.YYYY') as "expenseDate",
        to_char(fe.expense_date, 'YYYY-MM-DD') as "dateKey",
        to_char(fe.expense_date, 'YYYY-MM-DD') as "expenseDateValue",
        fe.method::text as "method",
        fe.vendor,
        fe.employee_user_id::text as "employeeUserId",
        fe.teacher_id::text as "teacherId",
        eu.full_name as "employeeName",
        t.full_name as "teacherName",
        fe.salary_mode::text as "salaryMode",
        fe.salary_percent as "salaryPercent",
        fe.salary_base_amount as "salaryBaseAmount",
        fe.salary_calculated_amount as "salaryCalculatedAmount",
        fe.receipt_file_name as "receiptFileName",
        fe.receipt_file_path as "receiptFilePath",
        fe.receipt_reference as "receiptReference",
        fe.description,
        fe.workshop_event_id::text as "workshopEventId",
        we.title as "workshopEventTitle"
      from erp.finance_expenses fe
      join erp.finance_expense_categories fec on fec.id = fe.category_id
      left join erp.users eu on eu.id = fe.employee_user_id
      left join erp.teachers t on t.id = fe.teacher_id
      left join erp.workshop_events we on we.id = fe.workshop_event_id
      where fe.expense_date >= ${fromDate}
        and fe.expense_date < ${endDateExclusive}
        and fe.voided_at is null
        and fe.salary_mode <> 'NONE'::"erp"."FinanceSalaryMode" and fec.code is distinct from 'OP_MANAGEMENT_COMP'
        ${expenseSourceSql}
        ${categorySql}
        ${searchSql.expenses}
      order by fe.expense_date desc, fe.created_at desc
    `) : Promise.resolve([] as ExpenseRow[]),
    needsDebts ? prisma.$queryRaw<DebtRow[]>(Prisma.sql`
      with ${studentReceivableCtes}
      select
        student_id::text as "studentId",
        student_name as "studentName",
        student_code as "studentCode",
        phone,
        balance_due as "balanceDue",
        to_char(next_due_date, 'DD.MM.YYYY') as "nextDueDate",
        to_char(next_due_date, 'YYYY-MM-DD') as "nextDueDateKey",
        greatest(0, (${today}::date - next_due_date)::int) as "overdueDays",
        program_name as "programName",
        teacher_name as "teacherName",
        case
          when next_due_date < ${today}::date then 'OVERDUE'
          when next_due_date > ${today}::date then 'FUTURE'
          else 'DUE'
        end as "receivableState",
        coalesce((  next_due_date >= ${fromDate}::date and next_due_date < ${endDateExclusive}::date ) or is_advance_receivable, false) as "isInSelectedPeriod"
      from student_receivables
      order by next_due_date asc nulls first, balance_due desc
    `) : Promise.resolve([] as DebtRow[]),
    needsDebts ? prisma.$queryRaw<WorkshopDebtRow[]>(Prisma.sql`
      select
        participant.id::text as "participantId",
        we.id::text as "eventId",
        we.title as "eventTitle",
        participant.full_name as "participantName",
        participant.phone,
        greatest(0, participant.list_price - participant.discount_amount - coalesce(paid.total, 0)) as "balanceDue",
        to_char(we.event_date, 'DD.MM.YYYY') as "eventDate",
        greatest(0, (current_date - we.event_date)::int) as "overdueDays",
        we.instructor,
        we.event_type::text as "eventType"
      from erp.workshop_participants participant
      join erp.workshop_events we on we.id = participant.event_id
      left join lateral (
        select sum(wp.amount) as total
        from erp.workshop_payments wp
        where wp.participant_id = participant.id and wp.voided_at is null
      ) paid on true
      where participant.cancelled_at is null
        and participant.is_gift = false
        and we.event_date >= ${fromDate}::date
        and we.event_date < ${endDateExclusive}::date
        and participant.list_price - participant.discount_amount - coalesce(paid.total, 0) > 0
        ${workshopSourceSql}
        ${searchSql.workshopDebts}
      order by we.event_date asc, "balanceDue" desc
    `) : Promise.resolve([] as WorkshopDebtRow[]),
    prisma.hrCorporateCustomer.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      take: 500,
      select: { id: true, name: true },
    }),
  ]);

  const summary = summaryRows[0] ?? {
    income: 0,
    guestIncome: 0,
    studentIncome: 0,
    workshopIncome: 0,
    paymentCount: 0,
    expense: 0,
    operatingExpense: 0,
    coreExpense: 0,
    workshopExpense: 0,
    directCost: 0,
    opex: 0,
    capex: 0,
    financingIn: 0,
    financingOut: 0,
    legacyLiability: 0,
    expenseCount: 0,
    payrollCount: 0,
    payroll: 0,
    debt: 0,
    debtors: 0,
  };
  const income = toNumber(summary.income);
  const studentIncome = toNumber(summary.studentIncome);
  const eventIncome = toNumber(summary.workshopIncome);
  const expense = toNumber(summary.expense);
  const operatingExpense = toNumber(summary.operatingExpense);
  const coreExpense = toNumber(summary.coreExpense);
  const eventExpense = toNumber(summary.workshopExpense);
  const directCost = toNumber(summary.directCost);
  const opex = toNumber(summary.opex);
  const capex = toNumber(summary.capex);
  const financingIn = toNumber(summary.financingIn);
  const financingOut = toNumber(summary.financingOut);
  const legacyLiability = toNumber(summary.legacyLiability);
  const payroll = toNumber(summary.payroll);
  const receivableSummary = receivableSummaryRows[0] ?? {
    studentReceivableCount: 0,
    studentOutstandingCount: 0,
    studentOutstandingAmount: 0,
    studentOverdueCount: 0,
    studentOverdueAmount: 0,
    studentFutureCount: 0,
    studentFutureAmount: 0,
    workshopCount: 0,
    workshopAmount: 0,
    masterclassCount: 0,
    masterclassAmount: 0,
  };
  const studentOutstandingAmount = toNumber(receivableSummary.studentOutstandingAmount);
  const workshopReceivableAmount = toNumber(receivableSummary.workshopAmount);
  const masterclassReceivableAmount = toNumber(receivableSummary.masterclassAmount);
  const debt = studentOutstandingAmount + workshopReceivableAmount + masterclassReceivableAmount;
  const debtorCount =
    toNumber(receivableSummary.studentOutstandingCount) +
    toNumber(receivableSummary.workshopCount) +
    toNumber(receivableSummary.masterclassCount);
  const paymentCountValue = toNumber(summary.paymentCount);
  const expenseCountValue = toNumber(summary.expenseCount);
  const payrollCountValue = toNumber(summary.payrollCount);
  const debtCountValue =
    toNumber(receivableSummary.studentReceivableCount) +
    toNumber(receivableSummary.workshopCount) +
    toNumber(receivableSummary.masterclassCount);
  const counts = {
    payments: paymentCountValue,
    debts: debtCountValue,
    expenses: expenseCountValue,
    payroll: payrollCountValue,
    overview: paymentCountValue + (expenseCountValue - payrollCountValue) + debtCountValue,
  };
  const { grossProfit, operatingProfit, netProfit, netCash } = calculateFinanceStatement({
    operatingIncome: income,
    directCost,
    opex,
    capex,
    financingIn,
    financingOut,
    legacyLiability,
  });
  const previousSummary = previousMonthRows[0];
  const previousMonthProfit = calculateFinanceStatement({
    operatingIncome: toNumber(previousSummary?.income),
    directCost: toNumber(previousSummary?.directCost),
    opex: toNumber(previousSummary?.opex),
    capex: toNumber(previousSummary?.capex),
    financingIn: toNumber(previousSummary?.financingIn),
    financingOut: toNumber(previousSummary?.financingOut),
    legacyLiability: toNumber(previousSummary?.legacyLiability),
  }).netProfit;
  const grossMargin = income > 0 ? (grossProfit / income) * 100 : 0;
  const net = netProfit;
  const expenses = expenseRows.map(mapExpenseRow);
  const payrollItems = payrollRows.map(mapExpenseRow);
  const categoryLabel =
    formatFinanceCategoryName(categoryRows.find((category) => category.id === normalizedFilters.category)?.name ?? "") ||
    "Bütün kateqoriyalar";
  const activeCount = [
    normalizedFilters.query,
    normalizedFilters.category,
    normalizedFilters.type !== "overview" ? normalizedFilters.type : "",
    normalizedFilters.source !== "all" ? normalizedFilters.source : "",
    normalizedFilters.from !== defaultFrom ? normalizedFilters.from : "",
    normalizedFilters.to !== defaultTo ? normalizedFilters.to : "",
  ].filter(Boolean).length;
  const periodLabel =
    normalizedFilters.from !== defaultFrom || normalizedFilters.to !== defaultTo
      ? `${formatDisplayDateInput(normalizedFilters.from) || "..."} - ${formatDisplayDateInput(normalizedFilters.to) || "..."}`
      : "Cari ay";
  const activeStudentIncome = toNumber(summary.activeStudentIncome);
  const educationCollectionDifference = studentIncome - activeStudentIncome;

  return {
    previousMonthProfit: {
      amount: formatAmount(previousMonthProfit),
      periodLabel: new Intl.DateTimeFormat("az-AZ", { month: "long", year: "numeric", timeZone: "UTC" }).format(previousMonthStart),
    },
    accessMode: "FULL",
    returnTo: buildFinanceUrl(normalizedFilters),
    permissions: {
      canRecordPayment: actor.permissions.has("billing.payment.create") || actor.permissions.has("billing.entry.create"),
      canCreateExpense: actor.permissions.has("billing.expense.create") || actor.permissions.has("billing.entry.create"),
      canVoidExpense: actor.permissions.has("billing.expense.void"),
      canExport: actor.permissions.has("report.export"),
    },
    filters: {
      ...normalizedFilters,
      activeCount,
    },
    filterLabels: {
      category: categoryLabel,
      type: movementTypes.find((item) => item.value === normalizedFilters.type)?.label ?? "Ümumi baxış",
      period: periodLabel,
      source:
        normalizedFilters.source === "student"
          ? "Tələbə ödənişləri"
          : normalizedFilters.source === "workshop"
            ? "Tədbirlər (Workshop / Masterclass)"
            : "Bütün mənbələr",
    },
    summary: {
      income: formatAmount(income),
      guestIncome: formatAmount(summary.guestIncome),
      studentIncome: formatAmount(studentIncome),
      eventIncome: formatAmount(eventIncome),
      expense: formatAmount(expense),
      operatingExpense: formatAmount(operatingExpense),
      coreExpense: formatAmount(coreExpense),
      eventExpense: formatAmount(eventExpense),
      net: formatAmount(net),
      grossProfit: formatAmount(grossProfit),
      operatingProfit: formatAmount(operatingProfit),
      netProfit: formatAmount(netProfit),
      netCash: formatAmount(netCash),
      directCost: formatAmount(directCost),
      opex: formatAmount(opex),
      capex: formatAmount(capex),
      financingIn: formatAmount(financingIn),
      financingOut: formatAmount(financingOut),
      legacyLiability: formatAmount(legacyLiability),
      payroll: formatAmount(payroll),
      debt: formatAmount(debt),
      paymentCount: formatCount(paymentCountValue),
      expenseCount: formatCount(expenseCountValue),
      debtors: formatCount(debtorCount),
    },
    counts,
    receivableSummary: {
      periodLabel,
      studentOutstanding: {
        count: toNumber(receivableSummary.studentOutstandingCount),
        amount: formatAmount(studentOutstandingAmount),
        amountValue: studentOutstandingAmount,
      },
      studentOverdue: {
        count: toNumber(receivableSummary.studentOverdueCount),
        amount: formatAmount(receivableSummary.studentOverdueAmount),
        amountValue: toNumber(receivableSummary.studentOverdueAmount),
      },
      studentFuture: {
        count: toNumber(receivableSummary.studentFutureCount),
        amount: formatAmount(receivableSummary.studentFutureAmount),
        amountValue: toNumber(receivableSummary.studentFutureAmount),
      },
      workshop: {
        count: toNumber(receivableSummary.workshopCount),
        amount: formatAmount(workshopReceivableAmount),
        amountValue: workshopReceivableAmount,
      },
      masterclass: {
        count: toNumber(receivableSummary.masterclassCount),
        amount: formatAmount(masterclassReceivableAmount),
        amountValue: masterclassReceivableAmount,
      },
    },
    educationCollectionReconciliation: {
      paidEducationTotal: formatAmount(studentIncome),
      legacyActiveOnlyTotal: formatAmount(activeStudentIncome),
      difference: formatAmount(educationCollectionDifference),
      rows: paymentRows
        .filter((payment) => payment.lifecycleStatus !== "ACTIVE" && payment.receiptPurpose !== "ONE_OFF")
        .map((payment) => ({
          id: payment.id,
          studentName: payment.studentName,
          studentCode: payment.studentCode,
          amount: formatAmount(payment.amount),
          paidAt: payment.paidAt,
          paymentMonth: payment.receiptPurpose === "ONE_OFF" ? "Qonaq dərs" : payment.paymentMonth,
          lifecycleStatus: payment.lifecycleStatus,
          status: "Ödənilib",
        })),
    },
    kpis: [
      {
        label: "Revenue",
        value: formatAmount(income),
        helper: `Tuition ${formatAmount(studentIncome)} · Events ${formatAmount(eventIncome)}`,
        tone: "success",
      },
      {
        label: "Gross Profit",
        value: formatAmount(grossProfit),
        helper: `Revenue − direct cost ${formatAmount(directCost)}`,
        tone: grossProfit >= 0 ? "success" : "danger",
      },
      {
        label: "Gross Margin",
        value: `${grossMargin.toLocaleString("az-AZ", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`,
        helper: "Gross Profit / Revenue",
        tone: grossMargin >= 0 ? "success" : "danger",
      },
      {
        label: "Operating Profit",
        value: formatAmount(operatingProfit),
        helper: `OPEX ${formatAmount(opex)} · Event expense ${formatAmount(eventExpense)}`,
        tone: expense > income ? "danger" : "neutral",
      },
      {
        label: "Net Profit",
        value: formatAmount(netProfit),
        helper: "Operating Profit − vergi, faiz və digər qeyri-əməliyyat maddələri",
        tone: netProfit >= 0 ? "success" : "danger",
      },
      {
        label: "Net Cash Flow",
        value: formatAmount(netCash),
        helper: `CAPEX ${formatAmount(capex)} · Net financing ${formatAmount(financingIn - financingOut - legacyLiability)}`,
        tone: netCash >= 0 ? "success" : "danger",
      },
      {
        label: "Receivables",
        value: formatAmount(debt),
        helper: `${formatCount(debtorCount)} open records`,
        tone: debt > 0 ? "warning" : "success",
      },
    ],
    expenseBreakdown: expenseBreakdownRows.map((item) => {
      const value = toNumber(item.value);
      return {
        label: item.sourceKind === "EVENT" ? "Tədbirlər" : formatFinanceCategoryName(item.label),
        value,
        amount: formatAmount(value),
        count: toNumber(item.count),
        sourceKind: item.sourceKind,
      };
    }),
    costCenterBreakdown: costCenterBreakdownRows.map((item) => {
      const value = toNumber(item.value);
      return {
        label: item.label === "Tədbirlər" || item.label === "Təyin edilməyib"
          ? item.label
          : getFinanceCostCenterLabel(item.label),
        value,
        amount: formatAmount(value),
        count: toNumber(item.count),
      };
    }),
    categories: categoryRows.map((category) => ({
      id: category.id,
      code: category.code,
      name: formatFinanceCategoryName(category.name),
      description: category.description ?? "",
      isSystem: category.isSystem,
      isActive: category.isActive,
      transactionType: category.transactionType,
      financialClass: category.financialClass ?? "",
      requiresStaff: category.requiresStaff,
      requiresProject: category.requiresProject,
    })),
    students: studentRows.map((student) => {
      const balance = toNumber(student.balanceDue);
      const fallbackAmount = balance > 0 ? balance : toNumber(student.monthlyFee);

      return {
        id: student.id,
        label: `${student.name} / ${student.code} / ${formatAmount(balance)}`,
        name: student.name,
        code: student.code,
        phone: student.phone ?? "-",
        program: student.programName ?? "Proqram yoxdur",
        teacher: student.teacherName ?? "Müəllim təyin edilməyib",
        balance: formatAmount(balance),
        defaultAmount: formatDecimalInput(fallbackAmount),
        defaultPaymentDate: formatDateInput(today),
        defaultPaymentMonth: formatDateInput(
          student.nextDueDate ? new Date(student.nextDueDate) : today,
        ).slice(0, 7),
      };
    }),
    staff: staffRows.map((staff) => ({
      id: staff.id,
      label: staff.label,
      kind: staff.kind,
      meta: staff.meta,
      salaryMode: staff.salaryMode,
      staticSalary: formatDecimalInput(staff.staticSalary),
      guestLessonSalary: formatDecimalInput(staff.guestLessonSalary),
      salaryPercent: formatDecimalInput(staff.salaryPercent),
      salaryBase: formatDecimalInput(staff.salaryBase),
      calculatedSalary: formatDecimalInput(staff.calculatedSalary),
    })),
    corporateCustomers: corporateCustomerRows,
    payments: [
      ...paymentRows.map((payment) => ({
      sourceKind: "STUDENT" as const,
      isGuest: payment.receiptPurpose === "ONE_OFF",
      isTestData: payment.isTestData,
      sourceLabel: payment.receiptPurpose === "ONE_OFF" ? "Qonaq dərs" : "Tələbə ödənişi",
      sourceHref: payment.receiptPurpose === "ONE_OFF" ? `/students/single-lessons?student=${payment.studentId}` : `/students/${payment.studentId}`,
      id: payment.id,
      studentId: payment.studentId,
      studentName: payment.studentName,
      studentCode: payment.studentCode,
      payerName: payment.payerName ?? payment.studentName,
      amount: formatAmount(payment.amount),
      amountValue: toNumber(payment.amount),
      amountInput: formatDecimalInput(payment.amount),
      paidAt: payment.paidAt,
      dateKey: payment.dateKey,
      paidDateValue: payment.paidDateValue,
      paymentMonth: payment.paymentMonth,
      paymentMonthValue: payment.paymentMonthValue,
      scheduleTypeValue: payment.scheduleType,
      methodValue: payment.method,
      method: getStudentPaymentMethodLabel(payment.method),
      receipt: payment.receiptReference ?? payment.receiptFileName ?? "-",
      receiptFilePath: payment.receiptFilePath ?? "",
      receiptReference: payment.receiptReference ?? "",
      note: payment.note ?? "-",
      })),
      ...workshopPaymentRows.map((payment) => ({
        sourceKind: "WORKSHOP" as const,
        sourceLabel: payment.eventTitle,
        sourceHref: `/workshops/${payment.eventId}?tab=payments`,
        id: payment.id,
        studentId: "",
        studentName: payment.participantName,
        studentCode: payment.eventTitle,
        payerName: payment.payerName ?? payment.participantName,
        amount: formatAmount(payment.amount),
        amountValue: toNumber(payment.amount),
        amountInput: formatDecimalInput(payment.amount),
        paidAt: payment.paidAt,
        dateKey: payment.dateKey,
        paidDateValue: payment.paidDateValue,
        paymentMonth: "Tədbirlər (Workshop / Masterclass)",
        paymentMonthValue: "",
        scheduleTypeValue: "ONE_TIME",
        methodValue: payment.method,
        method: getStudentPaymentMethodLabel(payment.method),
        receipt: payment.receiptReference ?? payment.receiptFileName ?? "-",
        receiptFilePath: payment.receiptFilePath ?? "",
        receiptReference: payment.receiptReference ?? "",
        note: payment.note ?? "-",
      })),
    ].sort((left, right) => right.dateKey.localeCompare(left.dateKey)),
    expenses,
    debtors: [
      ...debtRows.map((debtRow) => {
      const overdueDays = toNumber(debtRow.overdueDays);

      return {
        sourceKind: "STUDENT" as const,
        sourceHref: `/students/${debtRow.studentId}`,
        id: `${debtRow.studentId}:${debtRow.receivableState}`,
        studentName: debtRow.studentName,
        studentCode: debtRow.studentCode,
        phone: debtRow.phone ?? "-",
        program: debtRow.programName ?? "Proqram yoxdur",
        teacher: debtRow.teacherName ?? "Müəllim təyin edilməyib",
        balance: formatAmount(debtRow.balanceDue),
        balanceValue: toNumber(debtRow.balanceDue),
        nextDueDate: debtRow.nextDueDate ?? "-",
        overdueDays:
          debtRow.receivableState === "OVERDUE"
            ? `${formatCount(overdueDays)} gün gecikir`
            : debtRow.receivableState === "FUTURE"
              ? "Planlaşdırılıb"
              : debtRow.nextDueDate
                ? "Bu gün"
                : "Tarix təyin edilməyib",
        tone: debtRow.receivableState === "OVERDUE" ? getDebtTone(overdueDays) : "info" as const,
        receivableState: debtRow.receivableState,
        isInSelectedPeriod: debtRow.isInSelectedPeriod,
      };
      }),
      ...workshopDebtRows.map((debtRow) => {
        const overdueDays = toNumber(debtRow.overdueDays);
        return {
          sourceKind: debtRow.eventType,
          sourceHref: `/workshops/${debtRow.eventId}?tab=participants`,
          id: debtRow.participantId,
          studentName: debtRow.participantName,
          studentCode: debtRow.eventTitle,
          phone: debtRow.phone ?? "-",
          program: debtRow.eventType === "MASTERCLASS" ? "Masterclass" : "Workshop",
          teacher: debtRow.instructor ?? "Təlimçi təyin edilməyib",
          balance: formatAmount(debtRow.balanceDue),
          balanceValue: toNumber(debtRow.balanceDue),
          nextDueDate: debtRow.eventDate,
          overdueDays: overdueDays > 0 ? `${formatCount(overdueDays)} gün gecikir` : "Gecikmə yoxdur",
          tone: getDebtTone(overdueDays),
          receivableState: overdueDays > 0 ? "OVERDUE" as const : "FUTURE" as const,
          isInSelectedPeriod: true,
        };
      }),
    ],
    payrollItems,
    alerts: [
      {
        label: "Alacaq nəzarəti",
        value: debt > 0 ? `${formatAmount(debt)} alacaq qalır` : "Alacaq yoxdur",
        tone: debt > 0 ? "warning" : "success",
      },
      {
        label: "Əməkhaqqı hazırlığı",
        value: payroll > 0 ? `${formatAmount(payroll)} ayrılıb` : "Əməkhaqqı xərci yoxdur",
        tone: payroll > 0 ? "info" : "neutral",
      },
      {
        label: "Pul axını",
        value: net >= 0 ? "Müsbət balans" : "Xərc riski",
        tone: net >= 0 ? "success" : "danger",
      },
    ],
  };
}

function normalizeFinanceFilters(input: FinanceFilters, monthStart: Date, monthEnd: Date) {
  const type = normalizeMovementType(input.type);
  const from = normalizeDateInput(input.from) ?? formatDateInput(monthStart);
  const to = normalizeDateInput(input.to) ?? formatDateInput(monthEnd);

  return {
    query: formFilterString(input.q),
    category: formFilterString(input.category),
    type,
    from,
    to,
    source: normalizeFinanceSource(input.source),
  };
}

function normalizeFinanceSource(value: string | undefined): FinanceSource {
  const normalized = formFilterString(value);
  return normalized === "student" || normalized === "workshop" ? normalized : "all";
}

function normalizeMovementType(value: string | undefined): MovementType {
  const normalized = formFilterString(value);
  if (normalized === "all") {
    return "overview";
  }

  return movementTypes.some((item) => item.value === normalized)
    ? (normalized as MovementType)
    : "overview";
}

function buildSearchSql(query: string) {
  if (!query) {
    return {
      payments: Prisma.empty,
      expenses: Prisma.empty,
      debts: Prisma.empty,
      workshopPayments: Prisma.empty,
      workshopDebts: Prisma.empty,
    };
  }

  const pattern = `%${query}%`;

  return {
    payments: Prisma.sql`and (
      c.full_name ilike ${pattern}
      or s.code ilike ${pattern}
      or coalesce(p.payer_name, '') ilike ${pattern}
      or coalesce(p.note, '') ilike ${pattern}
      or coalesce(p.receipt_reference, '') ilike ${pattern}
    )`,
    expenses: Prisma.sql`and (
      fec.name ilike ${pattern}
      or coalesce(fe.vendor, '') ilike ${pattern}
      or coalesce(fe.description, '') ilike ${pattern}
      or coalesce(fe.receipt_reference, '') ilike ${pattern}
      or coalesce(eu.full_name, '') ilike ${pattern}
      or coalesce(t.full_name, '') ilike ${pattern}
    )`,
    debts: Prisma.sql`and (
      c.full_name ilike ${pattern}
      or s.code ilike ${pattern}
      or coalesce(c.phone_display, '') ilike ${pattern}
    )`,
    workshopPayments: Prisma.sql`and (
      we.title ilike ${pattern}
      or participant.full_name ilike ${pattern}
      or coalesce(wp.payer_name, '') ilike ${pattern}
      or coalesce(wp.note, '') ilike ${pattern}
      or coalesce(wp.receipt_reference, '') ilike ${pattern}
    )`,
    workshopDebts: Prisma.sql`and (
      we.title ilike ${pattern}
      or participant.full_name ilike ${pattern}
      or coalesce(participant.phone, '') ilike ${pattern}
    )`,
  };
}

function buildFinanceUrl(filters: {
  query: string;
  category: string;
  type: MovementType;
  from: string;
  to: string;
  source: FinanceSource;
}) {
  const params = new URLSearchParams();

  if (filters.query) {
    params.set("q", filters.query);
  }

  if (filters.category) {
    params.set("category", filters.category);
  }

  if (filters.type !== "overview") {
    params.set("type", filters.type);
  }

  if (filters.from) {
    params.set("from", filters.from);
  }

  if (filters.to) {
    params.set("to", filters.to);
  }

  if (filters.source !== "all") {
    params.set("source", filters.source);
  }

  return params.size > 0 ? `/finance?${params.toString()}` : "/finance";
}

function normalizeDateInput(value: string | undefined) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return trimmed;
  }

  const azMatch = trimmed.match(/^(\d{2})[./](\d{2})[./](\d{4})$/);
  if (azMatch) {
    const [, day, month, year] = azMatch;
    return `${year}-${month}-${day}`;
  }

  return null;
}

function formatDateInput(value: Date) {
  return [
    value.getUTCFullYear().toString(),
    (value.getUTCMonth() + 1).toString().padStart(2, "0"),
    value.getUTCDate().toString().padStart(2, "0"),
  ].join("-");
}

function formatDisplayDateInput(value: string) {
  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!isoMatch) {
    return value;
  }

  const [, year, month, day] = isoMatch;
  return `${day}.${month}.${year}`;
}

function formatDecimalInput(value: unknown) {
  const amount = toNumber(value);
  return amount > 0 ? amount.toFixed(2) : "";
}

function formatSalaryMode(value: string) {
  if (value === "STATIC") {
    return "Sabit";
  }

  if (value === "PERCENT") {
    return "Faiz";
  }

  return "-";
}

function formatSalaryFormula(expense: ExpenseRow) {
  if (expense.salaryMode === "STATIC") {
    return expense.salaryCalculatedAmount
      ? `${formatAmount(expense.salaryCalculatedAmount)} sabit`
      : "Sabit";
  }

  if (expense.salaryMode === "PERCENT") {
    return `${formatDecimalInput(expense.salaryBaseAmount) || "0"} x ${formatDecimalInput(
      expense.salaryPercent
    ) || "0"}% = ${formatAmount(expense.salaryCalculatedAmount)}`;
  }

  return "-";
}

function mapExpenseRow(expenseRow: ExpenseRow) {
  const category = formatFinanceCategoryName(expenseRow.category);

  return {
    workshopEventId: expenseRow.workshopEventId ?? "",
    workshopEventTitle: expenseRow.workshopEventTitle ?? "",
    sourceHref: expenseRow.workshopEventId
      ? `/workshops/${expenseRow.workshopEventId}?tab=expenses`
      : "",
    id: expenseRow.id,
    categoryId: expenseRow.categoryId,
    category,
    transactionType: expenseRow.transactionType,
    financialClass: expenseRow.financialClass,
    costCenter: expenseRow.costCenter ?? "",
    classificationReviewRequired: expenseRow.classificationReviewRequired,
    reportingCategory: getExpenseReportingCategory(expenseRow.workshopEventId, category),
    sourceKind: expenseRow.workshopEventId ? "EVENT" as const : "OPERATIONS" as const,
    amount: formatAmount(expenseRow.amount),
    amountValue: toNumber(expenseRow.amount),
    amountInput: formatDecimalInput(expenseRow.amount),
    expenseDate: expenseRow.expenseDate,
    dateKey: expenseRow.dateKey,
    expenseDateValue: expenseRow.expenseDateValue,
    methodValue: expenseRow.method,
    method: getStudentPaymentMethodLabel(expenseRow.method),
    vendor: expenseRow.vendor ?? "-",
    staffName: expenseRow.teacherName ?? expenseRow.employeeName ?? "-",
    staffTarget: expenseRow.teacherId
      ? `teacher:${expenseRow.teacherId}`
      : expenseRow.employeeUserId
        ? `user:${expenseRow.employeeUserId}`
        : "",
    salaryMode: formatSalaryMode(expenseRow.salaryMode),
    salaryFormula: formatSalaryFormula(expenseRow),
    receipt: expenseRow.receiptReference ?? expenseRow.receiptFileName ?? "-",
    receiptFilePath: expenseRow.receiptFilePath ?? "",
    receiptReference: expenseRow.receiptReference ?? "",
    description: expenseRow.description ?? "-",
  };
}

async function getLimitedFinanceData({
  actor,
  input,
  today,
  monthStart,
  monthEnd,
}: {
  actor: ErpActor;
  input: FinanceFilters;
  today: Date;
  monthStart: Date;
  monthEnd: Date;
}): Promise<FinanceData> {
  const prisma = getPrisma();
  const normalizedFilters = normalizeFinanceFilters(input, monthStart, monthEnd);
  const [categories, students, corporateCustomers] = await Promise.all([
    prisma.financeExpenseCategory.findMany({
      where: {
        isActive: true,
        requiresStaff: false,
        requiresProject: false,
        transactionType: { not: "INCOME" },
      },
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
      take: 300,
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        isSystem: true,
        isActive: true,
        transactionType: true,
        financialClass: true,
        requiresStaff: true,
        requiresProject: true,
      },
    }),
    prisma.student.findMany({
      where: { lifecycleStatus: { in: ["SLOT_WAITING", "ACTIVE"] } },
      orderBy: { contact: { fullName: "asc" } },
      take: 200,
      select: {
        id: true,
        code: true,
        contact: { select: { fullName: true, phoneDisplay: true } },
        invoices: {
          where: { status: { not: "VOID" }, balanceDue: { gt: 0 } },
          orderBy: [{ dueDate: "asc" }],
          select: { balanceDue: true, dueDate: true },
        },
        enrollments: {
          orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
          take: 1,
          select: {
            monthlyFee: true,
            program: { select: { name: true } },
            teacher: { select: { fullName: true } },
          },
        },
      },
    }),
    prisma.hrCorporateCustomer.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      take: 500,
      select: { id: true, name: true },
    }),
  ]);

  const emptyAmount = "—";
  return {
    previousMonthProfit: null,
    accessMode: "ENTRY_ONLY",
    returnTo: "/finance",
    permissions: {
      canRecordPayment: actor.permissions.has("billing.entry.create"),
      canCreateExpense: actor.permissions.has("billing.entry.create"),
      canVoidExpense: false,
      canExport: false,
    },
    filters: { ...normalizedFilters, type: "overview", activeCount: 0 },
    filterLabels: { category: "", type: "", period: "Cari ay", source: "" },
    summary: {
      income: emptyAmount, guestIncome: emptyAmount, studentIncome: emptyAmount, eventIncome: emptyAmount,
      expense: emptyAmount, operatingExpense: emptyAmount, coreExpense: emptyAmount, eventExpense: emptyAmount,
      net: emptyAmount, grossProfit: emptyAmount, operatingProfit: emptyAmount, netProfit: emptyAmount,
      netCash: emptyAmount, directCost: emptyAmount, opex: emptyAmount, capex: emptyAmount,
      financingIn: emptyAmount, financingOut: emptyAmount, legacyLiability: emptyAmount,
      payroll: emptyAmount, debt: emptyAmount, paymentCount: "0", expenseCount: "0", debtors: "0",
    },
    counts: { overview: 0, payments: 0, debts: 0, expenses: 0, payroll: 0 },
    receivableSummary: {
      periodLabel: "Cari ay",
      studentOutstanding: { count: 0, amount: emptyAmount, amountValue: 0 },
      studentOverdue: { count: 0, amount: emptyAmount, amountValue: 0 },
      studentFuture: { count: 0, amount: emptyAmount, amountValue: 0 },
      workshop: { count: 0, amount: emptyAmount, amountValue: 0 },
      masterclass: { count: 0, amount: emptyAmount, amountValue: 0 },
    },
    educationCollectionReconciliation: {
      paidEducationTotal: emptyAmount,
      legacyActiveOnlyTotal: emptyAmount,
      difference: emptyAmount,
      rows: [],
    },
    kpis: [],
    expenseBreakdown: [],
    costCenterBreakdown: [],
    categories: categories.map((category) => ({
      ...category,
      name: formatFinanceCategoryName(category.name),
      description: category.description ?? "",
      transactionType: category.transactionType,
      financialClass: category.financialClass ?? "",
    })),
    students: students.map((student) => {
      const enrollment = student.enrollments[0];
      const balance = student.invoices.reduce((total, invoice) => total + toNumber(invoice.balanceDue), 0);
      const fallbackAmount = balance > 0 ? balance : toNumber(enrollment?.monthlyFee);
      return {
        id: student.id,
        label: `${student.contact.fullName} / ${student.code}${balance > 0 ? ` / ${formatAmount(balance)}` : ""}`,
        name: student.contact.fullName,
        code: student.code,
        phone: student.contact.phoneDisplay ?? "-",
        program: enrollment?.program.name ?? "Proqram yoxdur",
        teacher: enrollment?.teacher?.fullName ?? "Müəllim təyin edilməyib",
        balance: balance > 0 ? formatAmount(balance) : "Açıq borc yoxdur",
        defaultAmount: formatDecimalInput(fallbackAmount),
        defaultPaymentDate: formatDateInput(today),
        defaultPaymentMonth: formatDateInput(
          student.invoices[0]?.dueDate ?? today,
        ).slice(0, 7),
      };
    }),
    staff: [],
    corporateCustomers,
    payments: [],
    expenses: [],
    debtors: [],
    payrollItems: [],
    alerts: [],
  };
}

function formatFinanceCategoryName(value: string) {
  const normalized = normalizeFinanceKeyword(value);

  if (
    normalized === "maas" ||
    normalized === "maaş" ||
    normalized === "emekhaqqi" ||
    normalized === "əməkhaqqı" ||
    normalized === "emek haqqi" ||
    normalized === "əmək haqqı"
  ) {
    return "Əməkhaqqı";
  }

  if (normalized === "icare" || normalized === "kiraye") {
    return "İcarə";
  }

  if (normalized === "temir") {
    return "Təmir";
  }

  if (normalized === "diger" || normalized === "digər") {
    return "Digər";
  }

  return value;
}

function getFinanceCostCenterLabel(value: string) {
  return {
    TEACHING: "Tədris",
    SALES: "Satış",
    MARKETING: "Marketinq",
    OPERATIONS: "Əməliyyat",
    MANAGEMENT: "Rəhbərlik",
  }[value] ?? "Təyin edilməyib";
}

function normalizeFinanceKeyword(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFC");
}

function getDebtTone(overdueDays: number): StatusTone {
  if (overdueDays >= 30) {
    return "danger";
  }

  if (overdueDays > 0) {
    return "warning";
  }

  return "info";
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}
