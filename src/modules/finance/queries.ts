import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/server/db/prisma";
import { requireErpActor } from "@/server/auth/actor";
import { formFilterString } from "@/modules/shared/form-values";
import {
  addMonths,
  formatAmount,
  formatCount,
  startOfMonth,
  toNumber,
} from "@/modules/shared/format";
import { getStudentPaymentMethodLabel } from "@/modules/students/payment-method";

type StatusTone = "success" | "warning" | "danger" | "neutral" | "info";
type MovementType = "overview" | "payments" | "debts" | "expenses" | "payroll";

export type FinanceFilters = {
  q?: string;
  category?: string;
  type?: string;
  from?: string;
  to?: string;
};

export type FinanceData = {
  returnTo: string;
  permissions: {
    canRecordPayment: boolean;
    canCreateExpense: boolean;
    canExport: boolean;
  };
  filters: {
    query: string;
    category: string;
    type: MovementType;
    from: string;
    to: string;
    activeCount: number;
  };
  filterLabels: {
    category: string;
    type: string;
    period: string;
  };
  summary: {
    income: string;
    expense: string;
    net: string;
    payroll: string;
    debt: string;
    paymentCount: string;
    expenseCount: string;
    debtors: string;
  };
  kpis: Array<{
    label: string;
    value: string;
    helper: string;
    tone: StatusTone;
  }>;
  categories: Array<{
    id: string;
    name: string;
    description: string;
    isSystem: boolean;
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
    salaryPercent: string;
    salaryBase: string;
    calculatedSalary: string;
  }>;
  payments: Array<{
    id: string;
    studentName: string;
    studentCode: string;
    payerName: string;
    amount: string;
    paidAt: string;
    paymentMonth: string;
    method: string;
    receipt: string;
    note: string;
  }>;
  expenses: Array<{
    id: string;
    category: string;
    amount: string;
    expenseDate: string;
    method: string;
    vendor: string;
    staffName: string;
    salaryMode: string;
    salaryFormula: string;
    receipt: string;
    description: string;
  }>;
  debtors: Array<{
    id: string;
    studentName: string;
    studentCode: string;
    phone: string;
    program: string;
    teacher: string;
    balance: string;
    nextDueDate: string;
    overdueDays: string;
    tone: StatusTone;
  }>;
  payrollItems: Array<{
    id: string;
    category: string;
    amount: string;
    expenseDate: string;
    method: string;
    vendor: string;
    staffName: string;
    salaryMode: string;
    salaryFormula: string;
    receipt: string;
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
  paymentCount: unknown;
  expense: unknown;
  expenseCount: unknown;
  payroll: unknown;
  debt: unknown;
  debtors: unknown;
};

type CategoryRow = {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
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
  salaryPercent: unknown;
  salaryBase: unknown;
  calculatedSalary: unknown;
};

type PaymentRow = {
  id: string;
  studentName: string;
  studentCode: string;
  payerName: string | null;
  amount: unknown;
  paidAt: string;
  paymentMonth: string;
  method: string;
  receiptFileName: string | null;
  receiptReference: string | null;
  note: string | null;
};

type ExpenseRow = {
  id: string;
  category: string;
  amount: unknown;
  expenseDate: string;
  method: string;
  vendor: string | null;
  employeeName: string | null;
  teacherName: string | null;
  salaryMode: string;
  salaryPercent: unknown;
  salaryBaseAmount: unknown;
  salaryCalculatedAmount: unknown;
  receiptFileName: string | null;
  receiptReference: string | null;
  description: string | null;
};

type DebtRow = {
  studentId: string;
  studentName: string;
  studentCode: string;
  phone: string | null;
  balanceDue: unknown;
  nextDueDate: string | null;
  overdueDays: unknown;
  programName: string | null;
  teacherName: string | null;
};

const movementTypes: Array<{ value: MovementType; label: string }> = [
  { value: "overview", label: "Umumi statistika" },
  { value: "payments", label: "Odenisler" },
  { value: "debts", label: "Borclar" },
  { value: "expenses", label: "Xercler" },
  { value: "payroll", label: "Maaslar" },
];

export async function getFinanceData(
  input: FinanceFilters = {}
): Promise<FinanceData> {
  const actor = await requireErpActor("billing.payment.read");
  const prisma = getPrisma();
  const today = new Date();
  const monthStart = startOfMonth(today);
  const nextMonthStart = addMonths(monthStart, 1);
  const normalizedFilters = normalizeFinanceFilters(input, monthStart, today);
  const fromDate = normalizedFilters.from
    ? new Date(`${normalizedFilters.from}T00:00:00.000Z`)
    : monthStart;
  const toDate = normalizedFilters.to
    ? new Date(`${normalizedFilters.to}T00:00:00.000Z`)
    : addMonths(nextMonthStart, 0);
  const endDateExclusive = addDays(toDate, 1);
  const searchSql = buildSearchSql(normalizedFilters.query);
  const categorySql = normalizedFilters.category
    ? Prisma.sql`and fec.id = ${normalizedFilters.category}::uuid`
    : Prisma.empty;

  const [
    summaryRows,
    categoryRows,
    studentRows,
    staffRows,
    paymentRows,
    expenseRows,
    payrollRows,
    debtRows,
  ] = await Promise.all([
    prisma.$queryRaw<FinanceSummaryRow[]>(Prisma.sql`
      select
        coalesce((
          select sum(p.amount)
          from erp.payments p
          where p.paid_at >= ${monthStart}
            and p.paid_at < ${nextMonthStart}
        ), 0) as "income",
        coalesce((
          select count(*)::int
          from erp.payments p
          where p.paid_at >= ${monthStart}
            and p.paid_at < ${nextMonthStart}
        ), 0) as "paymentCount",
        coalesce((
          select sum(fe.amount)
          from erp.finance_expenses fe
          where fe.expense_date >= ${monthStart}
            and fe.expense_date < ${nextMonthStart}
        ), 0) as "expense",
        coalesce((
          select count(*)::int
          from erp.finance_expenses fe
          where fe.expense_date >= ${monthStart}
            and fe.expense_date < ${nextMonthStart}
        ), 0) as "expenseCount",
        coalesce((
          select sum(fe.amount)
          from erp.finance_expenses fe
          where fe.expense_date >= ${monthStart}
            and fe.expense_date < ${nextMonthStart}
            and fe.salary_mode <> 'NONE'::"erp"."FinanceSalaryMode"
        ), 0) as "payroll",
        coalesce((
          select sum(i.balance_due)
          from erp.invoices i
          where i.balance_due > 0
            and i.status <> 'VOID'::"erp"."InvoiceStatus"
        ), 0) as "debt",
        coalesce((
          select count(distinct i.student_id)::int
          from erp.invoices i
          where i.balance_due > 0
            and i.status <> 'VOID'::"erp"."InvoiceStatus"
        ), 0) as "debtors"
    `),
    prisma.$queryRaw<CategoryRow[]>(Prisma.sql`
      select
        fec.id::text as "id",
        fec.name,
        fec.description,
        fec.is_system as "isSystem"
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
          and i.status <> 'VOID'::"erp"."InvoiceStatus"
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
      order by c.full_name asc, s.code asc
      limit 140
    `),
    prisma.$queryRaw<StaffOptionRow[]>(Prisma.sql`
      select
        concat('user:', u.id::text) as "id",
        u.full_name as "label",
        'employee' as "kind",
        coalesce(u.email, 'ERP user') as "meta",
        'STATIC' as "salaryMode",
        coalesce(last_salary.salary_amount, 0) as "staticSalary",
        0 as "salaryPercent",
        coalesce(last_salary.salary_amount, 0) as "salaryBase",
        coalesce(last_salary.salary_amount, 0) as "calculatedSalary"
      from erp.users u
      left join lateral (
        select
          coalesce(fe.salary_calculated_amount, fe.amount) as salary_amount
        from erp.finance_expenses fe
        where fe.employee_user_id = u.id
          and fe.salary_mode = 'STATIC'::"erp"."FinanceSalaryMode"
        order by fe.expense_date desc, fe.created_at desc
        limit 1
      ) last_salary on true
      where u.is_active = true

      union all

      select
        concat('teacher:', t.id::text) as "id",
        t.full_name as "label",
        'teacher' as "kind",
        coalesce(t.phone, 'Muellim') as "meta",
        'PERCENT' as "salaryMode",
        0 as "staticSalary",
        coalesce(rule.salary_percent, last_salary.salary_percent, 0) as "salaryPercent",
        coalesce(payout.eligible_revenue, last_salary.salary_base_amount, 0) as "salaryBase",
        coalesce(payout.payout_amount, last_salary.salary_calculated_amount, 0) as "calculatedSalary"
      from erp.teachers t
      left join lateral (
        select tcr.salary_percent
        from erp.teacher_contract_rules tcr
        where tcr.teacher_id = t.id
          and tcr.valid_from <= ${monthStart}
          and (tcr.valid_to is null or tcr.valid_to >= ${monthStart})
        order by tcr.valid_from desc, tcr.created_at desc
        limit 1
      ) rule on true
      left join lateral (
        select tp.eligible_revenue, tp.payout_amount
        from erp.teacher_payouts tp
        where tp.teacher_id = t.id
          and tp.period_month = ${monthStart}
        order by tp.created_at desc
        limit 1
      ) payout on true
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
    prisma.$queryRaw<PaymentRow[]>(Prisma.sql`
      select
        p.id::text as "id",
        c.full_name as "studentName",
        s.code as "studentCode",
        p.payer_name as "payerName",
        p.amount,
        to_char(p.paid_at, 'DD.MM.YYYY') as "paidAt",
        to_char(p.payment_month, 'YYYY-MM') as "paymentMonth",
        p.method::text as "method",
        p.receipt_file_name as "receiptFileName",
        p.receipt_reference as "receiptReference",
        p.note
      from erp.payments p
      join erp.students s on s.id = p.student_id
      join erp.contacts c on c.id = s.contact_id
      where p.paid_at >= ${fromDate}
        and p.paid_at < ${endDateExclusive}
        ${searchSql.payments}
      order by p.paid_at desc, p.created_at desc
      limit 70
    `),
    prisma.$queryRaw<ExpenseRow[]>(Prisma.sql`
      select
        fe.id::text as "id",
        fec.name as "category",
        fe.amount,
        to_char(fe.expense_date, 'DD.MM.YYYY') as "expenseDate",
        fe.method::text as "method",
        fe.vendor,
        eu.full_name as "employeeName",
        t.full_name as "teacherName",
        fe.salary_mode::text as "salaryMode",
        fe.salary_percent as "salaryPercent",
        fe.salary_base_amount as "salaryBaseAmount",
        fe.salary_calculated_amount as "salaryCalculatedAmount",
        fe.receipt_file_name as "receiptFileName",
        fe.receipt_reference as "receiptReference",
        fe.description
      from erp.finance_expenses fe
      join erp.finance_expense_categories fec on fec.id = fe.category_id
      left join erp.users eu on eu.id = fe.employee_user_id
      left join erp.teachers t on t.id = fe.teacher_id
      where fe.expense_date >= ${fromDate}
        and fe.expense_date < ${endDateExclusive}
        and fe.salary_mode = 'NONE'::"erp"."FinanceSalaryMode"
        ${categorySql}
        ${searchSql.expenses}
      order by fe.expense_date desc, fe.created_at desc
      limit 70
    `),
    prisma.$queryRaw<ExpenseRow[]>(Prisma.sql`
      select
        fe.id::text as "id",
        fec.name as "category",
        fe.amount,
        to_char(fe.expense_date, 'DD.MM.YYYY') as "expenseDate",
        fe.method::text as "method",
        fe.vendor,
        eu.full_name as "employeeName",
        t.full_name as "teacherName",
        fe.salary_mode::text as "salaryMode",
        fe.salary_percent as "salaryPercent",
        fe.salary_base_amount as "salaryBaseAmount",
        fe.salary_calculated_amount as "salaryCalculatedAmount",
        fe.receipt_file_name as "receiptFileName",
        fe.receipt_reference as "receiptReference",
        fe.description
      from erp.finance_expenses fe
      join erp.finance_expense_categories fec on fec.id = fe.category_id
      left join erp.users eu on eu.id = fe.employee_user_id
      left join erp.teachers t on t.id = fe.teacher_id
      where fe.expense_date >= ${fromDate}
        and fe.expense_date < ${endDateExclusive}
        and fe.salary_mode <> 'NONE'::"erp"."FinanceSalaryMode"
        ${categorySql}
        ${searchSql.expenses}
      order by fe.expense_date desc, fe.created_at desc
      limit 70
    `),
    prisma.$queryRaw<DebtRow[]>(Prisma.sql`
      select
        s.id::text as "studentId",
        c.full_name as "studentName",
        s.code as "studentCode",
        c.phone_display as "phone",
        coalesce(sum(i.balance_due), 0) as "balanceDue",
        to_char(min(i.due_date), 'DD.MM.YYYY') as "nextDueDate",
        greatest(0, (current_date - min(i.due_date))::int) as "overdueDays",
        ae.program_name as "programName",
        ae.teacher_name as "teacherName"
      from erp.invoices i
      join erp.students s on s.id = i.student_id
      join erp.contacts c on c.id = s.contact_id
      left join lateral (
        select
          p.name as program_name,
          t.full_name as teacher_name
        from erp.enrollments e
        join erp.programs p on p.id = e.program_id
        left join erp.teachers t on t.id = e.teacher_id
        where e.student_id = s.id
        order by
          case when e.status = 'ACTIVE'::"erp"."EnrollmentStatus" then 0 else 1 end,
          e.start_date desc,
          e.created_at desc
        limit 1
      ) ae on true
      where i.balance_due > 0
        and i.status <> 'VOID'::"erp"."InvoiceStatus"
        ${searchSql.debts}
      group by s.id, s.code, c.full_name, c.phone_display, ae.program_name, ae.teacher_name
      order by min(i.due_date) asc, coalesce(sum(i.balance_due), 0) desc
      limit 70
    `),
  ]);

  const summary = summaryRows[0] ?? {
    income: 0,
    paymentCount: 0,
    expense: 0,
    expenseCount: 0,
    payroll: 0,
    debt: 0,
    debtors: 0,
  };
  const income = toNumber(summary.income);
  const expense = toNumber(summary.expense);
  const payroll = toNumber(summary.payroll);
  const debt = toNumber(summary.debt);
  const net = income - expense;
  const expenses = expenseRows.map(mapExpenseRow);
  const payrollItems = payrollRows.map(mapExpenseRow);
  const categoryLabel =
    categoryRows.find((category) => category.id === normalizedFilters.category)?.name ??
    "Butun kateqoriyalar";
  const activeCount = [
    normalizedFilters.query,
    normalizedFilters.category,
    normalizedFilters.type !== "overview" ? normalizedFilters.type : "",
    normalizedFilters.from,
    normalizedFilters.to,
  ].filter(Boolean).length;

  return {
    returnTo: buildFinanceUrl(normalizedFilters),
    permissions: {
      canRecordPayment: actor.permissions.has("billing.payment.create"),
      canCreateExpense: actor.permissions.has("billing.expense.create"),
      canExport: actor.permissions.has("report.export"),
    },
    filters: {
      ...normalizedFilters,
      activeCount,
    },
    filterLabels: {
      category: categoryLabel,
      type: movementTypes.find((item) => item.value === normalizedFilters.type)?.label ?? "Umumi statistika",
      period:
        normalizedFilters.from || normalizedFilters.to
          ? `${normalizedFilters.from || "..."} - ${normalizedFilters.to || "..."}`
          : "Cari ay",
    },
    summary: {
      income: formatAmount(income),
      expense: formatAmount(expense),
      net: formatAmount(net),
      payroll: formatAmount(payroll),
      debt: formatAmount(debt),
      paymentCount: formatCount(toNumber(summary.paymentCount)),
      expenseCount: formatCount(toNumber(summary.expenseCount)),
      debtors: formatCount(toNumber(summary.debtors)),
    },
    kpis: [
      {
        label: "Daxil olan odenis",
        value: formatAmount(income),
        helper: `${formatCount(toNumber(summary.paymentCount))} qebul emeliyyati`,
        tone: "success",
      },
      {
        label: "Xercler",
        value: formatAmount(expense),
        helper: `${formatCount(toNumber(summary.expenseCount))} xerc qeydi`,
        tone: expense > income ? "danger" : "neutral",
      },
      {
        label: "Net netice",
        value: formatAmount(net),
        helper: net >= 0 ? "Gelir xercden yuxaridir" : "Xerc gelirden yuxaridir",
        tone: net >= 0 ? "success" : "danger",
      },
      {
        label: "Maas fondu",
        value: formatAmount(payroll),
        helper: "Statik ve faizli maas xerc snapshot-i",
        tone: "info",
      },
      {
        label: "Aciq borc",
        value: formatAmount(debt),
        helper: `${formatCount(toNumber(summary.debtors))} telebe uzre balans`,
        tone: debt > 0 ? "warning" : "success",
      },
    ],
    categories: categoryRows.map((category) => ({
      id: category.id,
      name: category.name,
      description: category.description ?? "",
      isSystem: category.isSystem,
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
        teacher: student.teacherName ?? "Muellim teyin edilmeyib",
        balance: formatAmount(balance),
        defaultAmount: formatDecimalInput(fallbackAmount),
        defaultPaymentDate: formatDateInput(today),
        defaultPaymentMonth: formatMonthInput(today),
      };
    }),
    staff: staffRows.map((staff) => ({
      id: staff.id,
      label: staff.label,
      kind: staff.kind,
      meta: staff.meta,
      salaryMode: staff.salaryMode,
      staticSalary: formatDecimalInput(staff.staticSalary),
      salaryPercent: formatDecimalInput(staff.salaryPercent),
      salaryBase: formatDecimalInput(staff.salaryBase),
      calculatedSalary: formatDecimalInput(staff.calculatedSalary),
    })),
    payments: paymentRows.map((payment) => ({
      id: payment.id,
      studentName: payment.studentName,
      studentCode: payment.studentCode,
      payerName: payment.payerName ?? payment.studentName,
      amount: formatAmount(payment.amount),
      paidAt: payment.paidAt,
      paymentMonth: payment.paymentMonth,
      method: getStudentPaymentMethodLabel(payment.method),
      receipt: payment.receiptReference ?? payment.receiptFileName ?? "-",
      note: payment.note ?? "-",
    })),
    expenses,
    debtors: debtRows.map((debtRow) => {
      const overdueDays = toNumber(debtRow.overdueDays);

      return {
        id: debtRow.studentId,
        studentName: debtRow.studentName,
        studentCode: debtRow.studentCode,
        phone: debtRow.phone ?? "-",
        program: debtRow.programName ?? "Proqram yoxdur",
        teacher: debtRow.teacherName ?? "Muellim teyin edilmeyib",
        balance: formatAmount(debtRow.balanceDue),
        nextDueDate: debtRow.nextDueDate ?? "-",
        overdueDays: overdueDays > 0 ? `${formatCount(overdueDays)} gun gecikir` : "Gecikme yoxdur",
        tone: getDebtTone(overdueDays),
      };
    }),
    payrollItems,
    alerts: [
      {
        label: "Borc nezareti",
        value: debt > 0 ? `${formatAmount(debt)} aciq qalib` : "Borc yoxdur",
        tone: debt > 0 ? "warning" : "success",
      },
      {
        label: "Maas hazirligi",
        value: payroll > 0 ? `${formatAmount(payroll)} ayrilib` : "Maas xerc qeydi yoxdur",
        tone: payroll > 0 ? "info" : "neutral",
      },
      {
        label: "Pul axini",
        value: net >= 0 ? "Musbet balans" : "Xerc riski",
        tone: net >= 0 ? "success" : "danger",
      },
    ],
  };
}

function normalizeFinanceFilters(input: FinanceFilters, monthStart: Date, today: Date) {
  const type = normalizeMovementType(input.type);
  const from = normalizeDateInput(input.from) ?? formatDateInput(monthStart);
  const to = normalizeDateInput(input.to) ?? formatDateInput(today);

  return {
    query: formFilterString(input.q),
    category: formFilterString(input.category),
    type,
    from,
    to,
  };
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
  };
}

function buildFinanceUrl(filters: {
  query: string;
  category: string;
  type: MovementType;
  from: string;
  to: string;
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

function formatMonthInput(value: Date | string) {
  return new Date(value).toISOString().slice(0, 7);
}

function formatDecimalInput(value: unknown) {
  const amount = toNumber(value);
  return amount > 0 ? amount.toFixed(2) : "";
}

function formatSalaryMode(value: string) {
  if (value === "STATIC") {
    return "Statik";
  }

  if (value === "PERCENT") {
    return "Faiz";
  }

  return "-";
}

function formatSalaryFormula(expense: ExpenseRow) {
  if (expense.salaryMode === "STATIC") {
    return expense.salaryCalculatedAmount
      ? `${formatAmount(expense.salaryCalculatedAmount)} statik`
      : "Statik";
  }

  if (expense.salaryMode === "PERCENT") {
    return `${formatDecimalInput(expense.salaryBaseAmount) || "0"} x ${formatDecimalInput(
      expense.salaryPercent
    ) || "0"}% = ${formatAmount(expense.salaryCalculatedAmount)}`;
  }

  return "-";
}

function mapExpenseRow(expenseRow: ExpenseRow) {
  return {
    id: expenseRow.id,
    category: expenseRow.category,
    amount: formatAmount(expenseRow.amount),
    expenseDate: expenseRow.expenseDate,
    method: getStudentPaymentMethodLabel(expenseRow.method),
    vendor: expenseRow.vendor ?? "-",
    staffName: expenseRow.teacherName ?? expenseRow.employeeName ?? "-",
    salaryMode: formatSalaryMode(expenseRow.salaryMode),
    salaryFormula: formatSalaryFormula(expenseRow),
    receipt: expenseRow.receiptReference ?? expenseRow.receiptFileName ?? "-",
    description: expenseRow.description ?? "-",
  };
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
