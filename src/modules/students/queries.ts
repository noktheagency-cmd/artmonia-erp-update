import {
  AppRole,
  InvoiceStatus,
  Prisma,
  StudentLifecycleStatus,
  TaskStatus,
} from "@/generated/prisma/client";
import { unstable_cache } from "next/cache";
import { getPrisma } from "@/server/db/prisma";
import { requireErpActor, type ErpActor } from "@/server/auth/actor";
import { scopeFor } from "@/server/rbac/permissions";
import { formFilterString } from "@/modules/shared/form-values";
import {
  formatAmount,
  formatCount,
  formatShortDate,
  toNumber,
} from "@/modules/shared/format";
import { erpCacheTags } from "@/modules/shared/cache-tags";
import { getStudentPaymentMethodLabel } from "@/modules/students/payment-method";
import { getStudentPaymentScheduleTypeLabel } from "@/modules/students/payment-schedule-type";
import {
  normalizeStudentPage,
  STUDENT_LIST_PAGE_SIZE,
} from "@/modules/students/student-pagination";
import {
  isStudentDebtDue,
  resolveStudentLifecycleStatus,
  resolveStudentPaymentStatus,
} from "@/modules/students/student-debt-status";
import {
  getBakuDateInput,
  getReminderDayRange,
  getStudentReminderKind,
  STUDENT_REMINDER_ENTITY_TYPE,
  studentReminderMeta,
  type StudentReminderKind,
} from "@/modules/students/student-reminders";
import { buildCrmSourceOptions } from "@/modules/crm/source-options";

type SummaryTone = "blue" | "coral" | "yellow" | "mint";
type StudentTone = "success" | "warning" | "danger" | "neutral" | "info";
type StudentPaymentFilter = "all" | "paid" | "open" | "overdue";
type FilterOption = { value: string; label: string };

export type StudentListFilters = {
  q?: string;
  status?: string;
  churn?: string;
  program?: string;
  teacher?: string;
  payment?: string;
  from?: string;
  to?: string;
  page?: string;
  tab?: string;
};

export type StudentListData = {
  query: string;
  returnTo: string;
  total: number;
  pagination: {
    page: number;
    pageSize: number;
    totalPages: number;
    from: number;
    to: number;
  };
  todayReminders: {
    dateLabel: string;
    items: StudentReminderItem[];
  };
  operations: {
    periodLabel: string;
    refreshSeconds: number;
    activeCount: number;
    slotWaitingCount: number;
    frozenOrStoppedCount: number;
    actionableCount: number;
    actionableAmount: string;
    overdueCount: number;
    overdueAmount: string;
    futureCount: number;
    futureAmount: string;
    unscheduledCount: number;
    dueTodayCount: number;
    activeWithoutTeacherCount: number;
    expectedAmount: string;
    collectedAmount: string;
    collectionRate: number;
    programs: Array<{ name: string; count: number; percentage: number }>;
    teachers: Array<{ name: string; count: number; percentage: number }>;
  };
  permissions: {
    canCreateStudent: boolean;
    canUpdateStudent: boolean;
    canConvertLead: boolean;
    canRecordPayment: boolean;
    canChangeStatus: boolean;
    canDeleteStudent: boolean;
    canManagePrograms: boolean;
    canExport: boolean;
  };
  createOptions: {
    leads: Array<{
      id: string;
      name: string;
      phone: string;
      source: string;
      educationLevel: string;
      programId: string;
      managerId: string;
      campaignId: string;
      note: string;
    }>;
    programs: Array<{
      id: string;
      name: string;
      monthlyFee: string;
      lessonsPerMonth: string;
      description: string;
      isActive: boolean;
    }>;
    teachers: Array<{ id: string; fullName: string }>;
    campaigns: Array<{ id: string; name: string }>;
    educationLevels: Array<{ value: string; label: string }>;
    discountTypes: Array<{ value: string; label: string }>;
    sourceOptions: string[];
    currentManagerName: string;
    defaultRegisteredDate: string;
    defaultPaymentDate: string;
  };
  filters: {
    status: string;
    churn: boolean;
    program: string;
    teacher: string;
    payment: StudentPaymentFilter;
    activeCount: number;
    dateFrom: string;
    dateTo: string;
  };
  filterLabels: {
    status: string;
    program: string;
    teacher: string;
    payment: string;
  };
  filterOptions: {
    statuses: FilterOption[];
    payments: FilterOption[];
    programs: FilterOption[];
    teachers: FilterOption[];
  };
  statusSummary: Array<{
    label: string;
    value: string;
    delta: string;
    amount?: string;
    tone: SummaryTone;
  }>;
  clv: {
    totalPaid: string;
    averagePaid: string;
    paidMonths: number;
  };
  listMetrics: {
    totalPaid: string;
    expectedPayment: string;
    overduePayment: string;
  };
  students: Array<{
    id: string;
    code: string;
    name: string;
    phone: string;
    program: string;
    teacher: string;
    group: string;
    dueDate: string;
    overdueDays: number;
    balance: string;
    lifecycleStatusValue: StudentLifecycleStatus;
    lifecycleStatus: string;
    lifecycleTone: StudentTone;
    paymentStatus: string;
    paymentTone: StudentTone;
    paidThisMonth: string;
    lastContact: string;
    clv: {
      totalPaid: string;
      paidMonths: number;
    };
    detail: {
      manager: string;
      registeredAt: string;
      notes: string;
      billingPaused: string;
      paymentDefaultAmount: string;
      paymentDefaultDate: string;
      monthlyFee: string;
      invoices: Array<{
        id: string;
        period: string;
        dueDate: string;
        amount: string;
        balance: string;
        status: string;
        tone: StudentTone;
      }>;
      payments: Array<{
        id: string;
        amount: string;
        paidAt: string;
        paymentMonth: string;
        nextPaymentDate: string;
        scheduleType: string;
        method: string;
        note: string;
        createdBy: string;
      }>;
      monthlyPayments: Array<{
        month: string;
        amount: string;
        paidAt: string;
      }>;
      timeline: Array<{
        id: string;
        label: string;
        reason: string;
        date: string;
        changedBy: string;
      }>;
    };
  }>;
};

export type StudentReminderItem = {
  id: string;
  studentId: string;
  studentCode: string;
  studentName: string;
  kind: StudentReminderKind;
  kindLabel: string;
  note: string;
  dueDate: string;
  status: "OPEN" | "IN_PROGRESS" | "DONE" | "CANCELLED";
  statusLabel: string;
  ownerName: string;
  canComplete: boolean;
};

const UNASSIGNED_TEACHER = "unassigned";

type StudentListCacheInput = {
  search: string;
  statusFilter: StudentLifecycleStatus | "";
  churnOnly: boolean;
  programFilter: string;
  teacherFilter: string;
  paymentFilter: StudentPaymentFilter;
  today: string;
  dateFrom: string;
  dateTo: string;
  page: number;
  pageSize: number;
};

type StudentListRawData = {
  rows: StudentListQueryRow[];
  options: StudentCreateOptionRows;
  clv: StudentClvSummary;
  paymentSummary: StudentPaymentSummary;
  operations: StudentListData["operations"];
};

type StudentClvSummary = {
  totalPaid: number;
  averagePaid: number;
  paidMonths: number;
};

type StudentPaymentSummary = {
  expectedPayment: number;
  overduePayment: number;
};

type StudentOperationsRawRow = {
  activeCount: unknown;
  slotWaitingCount: unknown;
  frozenOrStoppedCount: unknown;
  actionableCount: unknown;
  actionableAmount: unknown;
  overdueCount: unknown;
  overdueAmount: unknown;
  futureCount: unknown;
  futureAmount: unknown;
  unscheduledCount: unknown;
  dueTodayCount: unknown;
  activeWithoutTeacherCount: unknown;
  expectedAmount: unknown;
  collectedAmount: unknown;
  programs: unknown;
  teachers: unknown;
};

const lifecycleMeta: Record<
  StudentLifecycleStatus,
  { label: string; tone: StudentTone }
> = {
  [StudentLifecycleStatus.ACTIVE]: { label: "Aktiv", tone: "success" },
  [StudentLifecycleStatus.DEBT]: { label: "Borclu", tone: "danger" },
  [StudentLifecycleStatus.SLOT_WAITING]: {
    label: "Slot gözləyir",
    tone: "warning",
  },
  [StudentLifecycleStatus.FROZEN]: { label: "Dondurulub", tone: "info" },
  [StudentLifecycleStatus.STOPPED]: { label: "Dayandırılıb", tone: "neutral" },
  [StudentLifecycleStatus.DECLINED]: { label: "İmtina edib", tone: "danger" },
  [StudentLifecycleStatus.COMPLETED]: { label: "Tamamlayıb", tone: "success" },
};

const summaryMeta: Record<
  StudentLifecycleStatus,
  { label: string; tone: SummaryTone; delta: string }
> = {
  [StudentLifecycleStatus.ACTIVE]: {
    label: "Aktiv tələbələr",
    tone: "blue",
    delta: "Təhsil davam edir",
  },
  [StudentLifecycleStatus.DEBT]: {
    label: "Borclu tələbələr",
    tone: "coral",
    delta: "Ödəniş izləməsi",
  },
  [StudentLifecycleStatus.SLOT_WAITING]: {
    label: "Slot gözləyir",
    tone: "yellow",
    delta: "Slot təyinatı",
  },
  [StudentLifecycleStatus.FROZEN]: {
    label: "Dondurulmuş",
    tone: "mint",
    delta: "Qayıdış planı",
  },
  [StudentLifecycleStatus.STOPPED]: {
    label: "Dayandırılıb",
    tone: "coral",
    delta: "Arxiv",
  },
  [StudentLifecycleStatus.DECLINED]: {
    label: "İmtina edənlər",
    tone: "coral",
    delta: "Ödəniş geri qaytarılmır",
  },
  [StudentLifecycleStatus.COMPLETED]: {
    label: "Tamamlayıb",
    tone: "mint",
    delta: "Məzun",
  },
};

const paymentOptions: Array<FilterOption & { value: StudentPaymentFilter }> = [
  { value: "all", label: "Ödəniş" },
  { value: "paid", label: "Ödənilib" },
  { value: "open", label: "Qalıq borc" },
  { value: "overdue", label: "Gecikmiş ödəniş" },
];

const invoiceStatusMeta: Record<InvoiceStatus, { label: string; tone: StudentTone }> = {
  [InvoiceStatus.DRAFT]: { label: "Qaralama", tone: "neutral" },
  [InvoiceStatus.OPEN]: { label: "Açıq", tone: "warning" },
  [InvoiceStatus.PARTIAL]: { label: "Qismən ödənilib", tone: "warning" },
  [InvoiceStatus.PAID]: { label: "Ödənilib", tone: "success" },
  [InvoiceStatus.OVERDUE]: { label: "Gecikib", tone: "danger" },
  [InvoiceStatus.VOID]: { label: "Ləğv edilib", tone: "neutral" },
};

export async function getStudentListData(
  input: StudentListFilters = {}
): Promise<StudentListData> {
  const actor = await requireErpActor("student.read");
  const search = (input.q ?? "").trim();
  const statusFilter = normalizeLifecycleStatus(input.status);
  const churnOnly = normalizeChurnFilter(input.churn);
  const programFilter = formFilterString(input.program);
  const teacherFilter = formFilterString(input.teacher);
  const paymentFilter = normalizePaymentFilter(input.payment);
  const dateFromFilter = normalizeDateFilter(input.from);
  const dateToFilter = normalizeDateFilter(input.to);
  const activeTab = normalizeStudentTab(input.tab);
  let page = activeTab === "list" ? normalizeStudentPage(input.page) : 1;
  const today = startOfToday();
  const [initialRawData, todayReminders] = await Promise.all([
    readStudentListRawData({
      search,
      statusFilter,
      churnOnly,
      programFilter,
      teacherFilter,
      paymentFilter,
      today: today.toISOString(),
      dateFrom: dateFromFilter.input,
      dateTo: dateToFilter.input,
      page,
      pageSize: STUDENT_LIST_PAGE_SIZE,
    }),
    getTodayStudentReminders(getPrisma(), actor),
  ]);
  const rawData = page > 1 && initialRawData.rows.length === 0
    ? await readStudentListRawData({
        search,
        statusFilter,
        churnOnly,
        programFilter,
        teacherFilter,
        paymentFilter,
        today: today.toISOString(),
        dateFrom: dateFromFilter.input,
        dateTo: dateToFilter.input,
        page: 1,
        pageSize: STUDENT_LIST_PAGE_SIZE,
      })
    : initialRawData;
  if (rawData !== initialRawData) page = 1;
  const { rows, options, clv, paymentSummary, operations } = rawData;
  const { programs, teachers, leads: convertibleLeads, sources, campaigns, discountTypes } = options;

  const summaryCounts = new Map(
    Object.entries(options.summaryCounts).map(([status, count]) => [
      status as StudentLifecycleStatus,
      count,
    ])
  );
  const summaryBalances = new Map(
    Object.entries(options.summaryBalances).map(([status, balance]) => [
      status as StudentLifecycleStatus,
      balance,
    ])
  );
  const activeDebtPool =
    (summaryCounts.get(StudentLifecycleStatus.ACTIVE) ?? 0) +
    (summaryCounts.get(StudentLifecycleStatus.DEBT) ?? 0);
  summaryCounts.set(StudentLifecycleStatus.DEBT, options.debtCount);
  summaryCounts.set(
    StudentLifecycleStatus.ACTIVE,
    Math.max(activeDebtPool - options.debtCount, 0),
  );
  summaryBalances.set(StudentLifecycleStatus.DEBT, options.debtBalance);
  const visibleStatuses = [
    StudentLifecycleStatus.ACTIVE,
    StudentLifecycleStatus.DEBT,
    StudentLifecycleStatus.SLOT_WAITING,
    StudentLifecycleStatus.FROZEN,
    StudentLifecycleStatus.STOPPED,
    StudentLifecycleStatus.DECLINED,
    StudentLifecycleStatus.COMPLETED,
  ];
  const programOptions = programs.map((program) => ({
    value: program.id,
    label: program.name,
  }));
  const teacherOptions = [
    { value: UNASSIGNED_TEACHER, label: "Müəllim təyin edilməyib" },
    ...teachers.map((teacher) => ({
      value: teacher.id,
      label: teacher.fullName,
    })),
  ];
  const activeCount = [
    search,
    statusFilter,
    churnOnly,
    programFilter,
    teacherFilter,
    paymentFilter !== "all" ? paymentFilter : "",
    dateFromFilter.input,
    dateToFilter.input,
  ].filter(Boolean).length;
  const total = rows[0]?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / STUDENT_LIST_PAGE_SIZE));
  const pageFrom = total > 0 ? (page - 1) * STUDENT_LIST_PAGE_SIZE + 1 : 0;
  const pageTo = Math.min(page * STUDENT_LIST_PAGE_SIZE, total);

  return {
    query: search,
    returnTo: buildStudentsUrl({
      q: search,
      status: statusFilter,
      churn: churnOnly,
      program: programFilter,
      teacher: teacherFilter,
      payment: paymentFilter,
      from: dateFromFilter.input,
      to: dateToFilter.input,
      page,
      tab: activeTab,
    }),
    total,
    pagination: {
      page,
      pageSize: STUDENT_LIST_PAGE_SIZE,
      totalPages,
      from: pageFrom,
      to: pageTo,
    },
    todayReminders,
    operations,
    permissions: {
      canCreateStudent: actor.permissions.has("student.create"),
      canUpdateStudent: actor.permissions.has("student.update"),
      canConvertLead: actor.permissions.has("crm.lead.convert"),
      canRecordPayment: actor.permissions.has("billing.payment.create"),
      canChangeStatus: actor.permissions.has("student.status.change"),
      canDeleteStudent: actor.permissions.has("student.delete"),
      canManagePrograms: actor.permissions.has("settings.manage"),
      canExport: actor.permissions.has("report.export"),
    },
    createOptions: {
      leads: convertibleLeads,
      programs: programs.map((program) => ({
        id: program.id,
        name: program.name,
        monthlyFee: formatDecimalInput(program.defaultMonthlyFee),
        lessonsPerMonth: program.defaultLessonsPerMonth?.toString() ?? "",
        description: program.description ?? "",
        isActive: program.isActive,
      })),
      teachers,
      campaigns,
      educationLevels: options.educationLevels,
      discountTypes,
      sourceOptions: buildCrmSourceOptions(sources),
      currentManagerName: actor.fullName,
      defaultRegisteredDate: formatDateInput(new Date()),
      defaultPaymentDate: formatDateInput(new Date()),
    },
    filters: {
      status: statusFilter,
      churn: churnOnly,
      program: programFilter,
      teacher: teacherFilter,
      payment: paymentFilter,
      activeCount,
      dateFrom: dateFromFilter.input,
      dateTo: dateToFilter.input,
    },
    filterLabels: {
      status: statusFilter ? lifecycleMeta[statusFilter].label : "Bütün statuslar",
      program:
        programOptions.find((option) => option.value === programFilter)?.label ??
        "Bütün proqramlar",
      teacher:
        teacherOptions.find((option) => option.value === teacherFilter)?.label ??
        "Bütün müəllimlər",
      payment:
        paymentOptions.find((option) => option.value === paymentFilter)?.label ??
        "Bütün ödənişlər",
    },
    filterOptions: {
      statuses: Object.values(StudentLifecycleStatus).map((status) => ({
        value: status,
        label: lifecycleMeta[status].label,
      })),
      payments: paymentOptions,
      programs: programOptions,
      teachers: teacherOptions,
    },
    statusSummary: visibleStatuses.map((status) => {
      const outstandingBalance = formatAmount(summaryBalances.get(status) ?? 0);
      const isOutstandingStatus =
        status === StudentLifecycleStatus.DEBT ||
        status === StudentLifecycleStatus.SLOT_WAITING;

      return {
        label: summaryMeta[status].label,
        value: formatCount(summaryCounts.get(status) ?? 0),
        delta:
          status === StudentLifecycleStatus.DEBT
            ? `Qalan borc: ${outstandingBalance}`
            : status === StudentLifecycleStatus.SLOT_WAITING
              ? `Qalan ödəniş: ${outstandingBalance}`
              : summaryMeta[status].delta,
        amount: isOutstandingStatus ? outstandingBalance : undefined,
        tone: summaryMeta[status].tone,
      };
    }),
    clv: {
      totalPaid: formatAmount(clv.totalPaid),
      averagePaid: formatAmount(clv.averagePaid),
      paidMonths: clv.paidMonths,
    },
    listMetrics: {
      totalPaid: formatAmount(clv.totalPaid),
      expectedPayment: formatAmount(paymentSummary.expectedPayment),
      overduePayment: formatAmount(paymentSummary.overduePayment),
    },
    students: rows.map((student) => {
      const balance = toNumber(student.balanceDue);
      const totalPaid = toNumber(student.totalPaid);
      const currentMonthPaid = toNumber(student.currentMonthPaid);
      const paidMonths = toNumber(student.paidMonths);
      const nextPaymentAt = student.nextDueDate ? new Date(student.nextDueDate) : null;
      const debtDue = isStudentDebtDue({ balance, nextPaymentAt, today });
      const effectiveLifecycleStatus = resolveStudentLifecycleStatus({
        lifecycleStatus: student.lifecycleStatus,
        debtDue,
      }) as StudentLifecycleStatus;
      const lifecycleStatus = lifecycleMeta[effectiveLifecycleStatus];
      const paymentStatus = resolveStudentPaymentStatus({ balance, nextPaymentAt, today });
      const overdueDays = getOverdueDays(
        nextPaymentAt ?? undefined,
        today
      );
      const defaultPaymentAmount =
        balance > 0
          ? formatDecimalInput(balance)
          : student.monthlyFee
            ? formatDecimalInput(student.monthlyFee)
            : "";

      return {
        id: student.id,
        code: student.code,
        name: student.name,
        phone: student.phone ?? "-",
        program: student.programName ?? "Proqram təyin edilməyib",
        teacher: student.teacherName ?? "Müəllim təyin edilməyib",
        group: student.slotLabel ?? "Slota təyin edilməyib",
        dueDate: student.nextDueDate ? formatShortDate(student.nextDueDate) : "—",
        overdueDays,
        balance: formatAmount(balance),
        lifecycleStatusValue: student.lifecycleStatus,
        lifecycleStatus: lifecycleStatus.label,
        lifecycleTone: lifecycleStatus.tone,
        paymentStatus: paymentStatus.label,
        paymentTone: paymentStatus.tone,
        paidThisMonth: formatAmount(currentMonthPaid),
        lastContact: `Qeydiyyat: ${formatShortDate(student.registeredAt)}`,
        clv: {
          totalPaid: formatAmount(totalPaid),
          paidMonths,
        },
        detail: {
          manager: student.managerName ?? "Təyin edilməyib",
          registeredAt: formatShortDate(student.registeredAt),
          notes: student.notes ?? "Qeyd yoxdur",
          billingPaused: student.billingPaused ? "Dayandırılıb" : "Aktivdir",
          paymentDefaultAmount: defaultPaymentAmount,
          paymentDefaultDate: formatDateInput(new Date()),
          monthlyFee: student.monthlyFee ? formatDecimalInput(student.monthlyFee) : "",
          invoices: student.invoices.slice(0, 6).map((invoice) => {
            const status = invoiceStatusMeta[invoice.status];

            return {
              id: invoice.id,
              period: formatMonthInput(invoice.periodMonth),
              dueDate: formatShortDate(invoice.dueDate),
              amount: formatAmount(invoice.amount),
              balance: formatAmount(invoice.balanceDue),
              status: status.label,
              tone: status.tone,
            };
          }),
          payments: student.payments.map((payment) => ({
            id: payment.id,
            amount: formatAmount(payment.amount),
            paidAt: formatShortDate(payment.paidAt),
            paymentMonth: formatMonthInput(payment.paymentMonth),
            nextPaymentDate: payment.scheduleType === "ONE_TIME"
              ? "Tam ödənilib"
              : payment.nextPaymentAt
                ? formatShortDate(payment.nextPaymentAt)
                : "—",
            scheduleType: getStudentPaymentScheduleTypeLabel(payment.scheduleType),
            method: getStudentPaymentMethodLabel(payment.method),
            note: payment.note ?? "-",
            createdBy: payment.createdByName ?? "Sistem",
          })),
          monthlyPayments: [],
          timeline: student.timeline.map((item) => ({
            id: item.id,
            label: lifecycleMeta[item.newStatus].label,
            reason: item.note ?? item.reason,
            date: formatShortDate(item.effectiveAt),
            changedBy: item.changedByName ?? "Sistem",
          })),
        },
      };
    }),
  };
}

type StudentListQueryRow = {
  id: string;
  code: string;
  lifecycleStatus: StudentLifecycleStatus;
  registeredAt: Date | string;
  notes: string | null;
  billingPaused: boolean;
  name: string;
  phone: string | null;
  managerName: string | null;
  monthlyFee: unknown;
  programName: string | null;
  teacherName: string | null;
  slotLabel: string | null;
  balanceDue: unknown;
  currentMonthPaid: unknown;
  nextDueDate: Date | string | null;
  totalPaid: unknown;
  paidMonths: unknown;
  totalCount: number;
  invoices: StudentInvoiceRecord[];
  payments: StudentPaymentRecord[];
  monthlyPayments: StudentMonthlyPaymentRecord[];
  timeline: StudentTimelineRecord[];
};

type StudentListRawRow = Omit<
  StudentListQueryRow,
  "lifecycleStatus" | "totalCount" | "invoices" | "payments" | "monthlyPayments" | "timeline"
> & {
  lifecycleStatus: string;
  totalCount: unknown;
  invoices: unknown;
  payments: unknown;
  monthlyPayments: unknown;
  timeline: unknown;
};

type StudentDetailRawRow = StudentListRawRow & {
  contactEmail: string | null;
  source: string | null;
  educationLevel: string | null;
  managerId: string | null;
  campaignId: string | null;
  campaignName: string | null;
  enrollmentId: string | null;
  programId: string | null;
  teacherId: string | null;
  discountType: string | null;
  lessonsPerMonth: number | null;
  firstLessonAt: Date | string | null;
};

type StudentInvoiceRecord = {
  id: string;
  amount: unknown;
  balanceDue: unknown;
  dueDate: Date | string;
  periodMonth: Date | string;
  status: InvoiceStatus;
};

type StudentPaymentRecord = {
  id: string;
  amount: unknown;
  paidAt: Date | string;
  paymentMonth: Date | string;
  nextPaymentAt: Date | string | null;
  scheduleType: string;
  method: string;
  note: string | null;
  createdByName: string | null;
};

type StudentMonthlyPaymentRecord = {
  month: Date | string;
  amount: unknown;
  paidAt: Date | string;
};

type StudentTimelineRecord = {
  id: string;
  newStatus: StudentLifecycleStatus;
  reason: string;
  note: string | null;
  effectiveAt: Date | string;
  changedByName: string | null;
};

type StudentReminderRawRow = {
  id: string;
  studentId: string;
  studentCode: string;
  studentName: string;
  taskType: string;
  note: string;
  dueAt: Date | string;
  status: string;
  ownerUserId: string | null;
  ownerName: string | null;
};

const studentReminderStatusLabels: Record<StudentReminderItem["status"], string> = {
  OPEN: "Gözləyir",
  IN_PROGRESS: "İcradadır",
  DONE: "Tamamlanıb",
  CANCELLED: "Ləğv edilib",
};

async function getTodayStudentReminders(
  prisma: ReturnType<typeof getPrisma>,
  actor: ErpActor,
): Promise<StudentListData["todayReminders"]> {
  const dateInput = getBakuDateInput();
  const dateLabel = new Intl.DateTimeFormat("az-AZ", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Baku",
  }).format(new Date(`${dateInput}T12:00:00.000Z`));

  if (!actor.permissions.has("task.read")) {
    return { dateLabel, items: [] };
  }

  const { start, end } = getReminderDayRange(dateInput);
  const readScope = scopeFor(actor.permissions, "task.read");
  const ownerFilter =
    readScope === "ALL"
      ? Prisma.sql`true`
      : Prisma.sql`t.owner_user_id = ${actor.id}::uuid`;
  const studentReadScope = scopeFor(actor.permissions, "student.read");
  const studentFilter =
    studentReadScope === "ALL"
      ? Prisma.sql`true`
      : Prisma.sql`s.manager_id = ${actor.id}::uuid`;
  const rows = await prisma.$queryRaw<StudentReminderRawRow[]>(Prisma.sql`
    select
      t.id::text as "id",
      s.id::text as "studentId",
      s.code as "studentCode",
      c.full_name as "studentName",
      t.type as "taskType",
      coalesce(t.description, '') as "note",
      t.due_at as "dueAt",
      t.status::text as "status",
      t.owner_user_id::text as "ownerUserId",
      owner.full_name as "ownerName"
    from erp.tasks t
    join erp.students s on s.id = t.entity_id
    join erp.contacts c on c.id = s.contact_id
    left join erp.users owner on owner.id = t.owner_user_id
    where t.entity_type = ${STUDENT_REMINDER_ENTITY_TYPE}
      and t.type in (
        ${studentReminderMeta.PAYMENT.taskType},
        ${studentReminderMeta.GENERAL.taskType}
      )
      and t.status in (
        'OPEN'::"erp"."TaskStatus",
        'IN_PROGRESS'::"erp"."TaskStatus"
      )
      and t.due_at >= ${start}
      and t.due_at < ${end}
      and ${ownerFilter}
      and ${studentFilter}
    order by
      case when t.type = ${studentReminderMeta.PAYMENT.taskType} then 0 else 1 end,
      t.created_at asc
    limit 20
  `);

  return { dateLabel, items: mapStudentReminderRows(rows, actor) };
}

async function getStudentReminderHistory(
  prisma: ReturnType<typeof getPrisma>,
  actor: ErpActor,
  studentId: string,
) {
  if (!actor.permissions.has("task.read")) {
    return [];
  }

  const readScope = scopeFor(actor.permissions, "task.read");
  const ownerFilter =
    readScope === "ALL"
      ? Prisma.sql`true`
      : Prisma.sql`t.owner_user_id = ${actor.id}::uuid`;
  const studentReadScope = scopeFor(actor.permissions, "student.read");
  const studentFilter =
    studentReadScope === "ALL"
      ? Prisma.sql`true`
      : Prisma.sql`s.manager_id = ${actor.id}::uuid`;
  const rows = await prisma.$queryRaw<StudentReminderRawRow[]>(Prisma.sql`
    select
      t.id::text as "id",
      s.id::text as "studentId",
      s.code as "studentCode",
      c.full_name as "studentName",
      t.type as "taskType",
      coalesce(t.description, '') as "note",
      t.due_at as "dueAt",
      t.status::text as "status",
      t.owner_user_id::text as "ownerUserId",
      owner.full_name as "ownerName"
    from erp.tasks t
    join erp.students s on s.id = t.entity_id
    join erp.contacts c on c.id = s.contact_id
    left join erp.users owner on owner.id = t.owner_user_id
    where t.entity_type = ${STUDENT_REMINDER_ENTITY_TYPE}
      and t.entity_id = ${studentId}::uuid
      and t.type in (
        ${studentReminderMeta.PAYMENT.taskType},
        ${studentReminderMeta.GENERAL.taskType}
      )
      and t.status <> 'CANCELLED'::"erp"."TaskStatus"
      and ${ownerFilter}
      and ${studentFilter}
    order by
      case
        when t.status in ('OPEN'::"erp"."TaskStatus", 'IN_PROGRESS'::"erp"."TaskStatus") then 0
        else 1
      end,
      t.due_at desc,
      t.created_at desc
    limit 12
  `);

  return mapStudentReminderRows(rows, actor);
}

function mapStudentReminderRows(rows: StudentReminderRawRow[], actor: ErpActor) {
  const manageScope = scopeFor(actor.permissions, "task.manage");

  return rows.flatMap((row): StudentReminderItem[] => {
    const kind = getStudentReminderKind(row.taskType);
    const status = row.status as StudentReminderItem["status"];

    if (!kind || !(status in studentReminderStatusLabels)) {
      return [];
    }

    return [{
      id: row.id,
      studentId: row.studentId,
      studentCode: row.studentCode,
      studentName: row.studentName,
      kind,
      kindLabel: studentReminderMeta[kind].label,
      note: row.note,
      dueDate: formatShortDate(row.dueAt),
      status,
      statusLabel: studentReminderStatusLabels[status],
      ownerName: row.ownerName ?? "Təyin edilməyib",
      canComplete:
        (status === TaskStatus.OPEN || status === TaskStatus.IN_PROGRESS) &&
        (manageScope === "ALL" || row.ownerUserId === actor.id),
    }];
  });
}

async function getStudentRows(
  prisma: ReturnType<typeof getPrisma>,
  input: {
    search: string;
    statusFilter: StudentLifecycleStatus | "";
    churnOnly: boolean;
    programFilter: string;
    teacherFilter: string;
    paymentFilter: StudentPaymentFilter;
    today: Date;
    dateFrom: Date | null;
    dateTo: Date | null;
    page: number;
    pageSize: number;
  }
): Promise<StudentListQueryRow[]> {
  const whereSql = buildStudentWhereSql(input);
  const rows = await prisma.$queryRaw<StudentListRawRow[]>(Prisma.sql`
    with filtered_students as (
      select s.id
      from erp.students s
      join erp.contacts c on c.id = s.contact_id
      ${whereSql}
    ),
    paged_students as (
      select
        s.id,
        s.code,
        s.lifecycle_status::text as "lifecycleStatus",
        s.registered_at as "registeredAt",
        s.created_at as "createdAt",
        s.notes,
        s.billing_paused as "billingPaused",
        c.full_name as "name",
        c.phone_display as "phone",
        u.full_name as "managerName",
        count(*) over() as "totalCount"
      from erp.students s
      join filtered_students fs on fs.id = s.id
      join erp.contacts c on c.id = s.contact_id
      left join erp.users u on u.id = s.manager_id
      order by s.registered_at desc, s.created_at desc
      limit ${input.pageSize}
      offset ${(input.page - 1) * input.pageSize}
    )
    select
      ps.id::text as "id",
      ps.code,
      ps."lifecycleStatus",
      ps."registeredAt",
      ps.notes,
      ps."billingPaused",
      ps.name,
      ps.phone,
      ps."managerName",
      ps."totalCount",
      ae.monthly_fee as "monthlyFee",
      ae.program_name as "programName",
      ae.teacher_name as "teacherName",
      (select concat(t.full_name, ' · ', cs.start_time, '–', cs.end_time) from erp.student_schedule_assignments ssa join erp.class_slots cs on cs.id = ssa.slot_id join erp.teachers t on t.id = cs.teacher_id join erp.enrollments se on se.id = ssa.enrollment_id where se.student_id = ps.id and ssa.valid_to is null order by ssa.valid_from desc, ssa.created_at desc limit 1) as "slotLabel",
      inv.balance_due as "balanceDue",
      coalesce((select sum(p.amount) from erp.payments p where p.student_id = ps.id and date_trunc('month', p.paid_at) = date_trunc('month', ${input.today}::date)), 0) as "currentMonthPaid",
      inv.next_due_date as "nextDueDate",
      clv.total_paid as "totalPaid",
      clv.paid_months as "paidMonths",
      inv.invoices,
      pay.payments,
      hist.timeline
    from paged_students ps
    left join lateral (
      select
        e.monthly_fee,
        p.name as program_name,
        t.full_name as teacher_name
      from erp.enrollments e
      join erp.programs p on p.id = e.program_id
      left join erp.teachers t on t.id = e.teacher_id
      where e.student_id = ps.id
        and e.status in (
          'ACTIVE'::"erp"."EnrollmentStatus",
          'PAUSED'::"erp"."EnrollmentStatus"
        )
      order by e.start_date desc, e.created_at desc
      limit 1
    ) ae on true
    left join lateral (
      select
        greatest(coalesce((
          select sum(i.balance_due)
          from erp.invoices i
          where i.student_id = ps.id
            and i.status <> 'VOID'::"erp"."InvoiceStatus"
            and i.balance_due > 0
        ), 0), greatest(coalesce(ae.monthly_fee, 0) - coalesce((
          select sum(p.amount)
          from erp.payments p
          where p.student_id = ps.id
            and date_trunc('month', p.paid_at) = date_trunc('month', ${input.today}::date)
        ), 0), 0)) as balance_due,
        (select p.next_payment_at from erp.payments p where p.student_id = ps.id and p.next_payment_at is not null order by p.paid_at desc, p.created_at desc limit 1) as next_due_date,
        coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', ordered.id::text,
              'amount', ordered.amount,
              'balanceDue', ordered.balance_due,
              'dueDate', ordered.due_date,
              'periodMonth', ordered.period_month,
              'status', ordered.status::text
            )
            order by ordered.due_date asc, ordered.created_at asc
          )
          from (
            select i.id, i.amount, i.balance_due, i.due_date, i.period_month, i.status, i.created_at
            from erp.invoices i
            where i.student_id = ps.id
              and i.status <> 'VOID'::"erp"."InvoiceStatus"
            order by i.due_date asc, i.created_at asc
            limit 6
          ) ordered
        ), '[]'::jsonb) as invoices
    ) inv on true
    left join lateral (
      select
        coalesce(sum(p.amount), 0) as total_paid,
        count(distinct p.payment_month) filter (
          where p.schedule_type = 'MONTHLY'::"erp"."PaymentScheduleType"
        )::int as paid_months
      from erp.payments p
      where p.student_id = ps.id
    ) clv on true
    left join lateral (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', ordered.id::text,
          'amount', ordered.amount,
          'paidAt', ordered.paid_at,
          'paymentMonth', ordered.payment_month,
          'nextPaymentAt', ordered.next_payment_at,
          'scheduleType', ordered.schedule_type::text,
          'method', ordered.method::text,
          'note', ordered.note,
          'createdByName', ordered.created_by_name
        )
        order by ordered.paid_at desc, ordered.created_at desc
      ), '[]'::jsonb) as payments
      from (
        select p.id, p.amount, p.paid_at, p.payment_month, p.next_payment_at, p.schedule_type, p.method, p.note, p.created_at, u.full_name as created_by_name
        from erp.payments p
        left join erp.users u on u.id = p.created_by_id
        where p.student_id = ps.id
        order by p.paid_at desc, p.created_at desc
        limit 5
      ) ordered
    ) pay on true
    left join lateral (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', ordered.id::text,
          'newStatus', ordered.new_status::text,
          'reason', ordered.reason,
          'note', ordered.note,
          'effectiveAt', ordered.effective_at,
          'changedByName', ordered.changed_by_name
        )
        order by ordered.effective_at desc, ordered.created_at desc
      ), '[]'::jsonb) as timeline
      from (
        select h.id, h.new_status, h.reason, h.note, h.effective_at, h.created_at, u.full_name as changed_by_name
        from erp.student_status_history h
        left join erp.users u on u.id = h.changed_by_id
        where h.student_id = ps.id
        order by h.effective_at desc, h.created_at desc
        limit 5
      ) ordered
    ) hist on true
    order by ps."registeredAt" desc, ps."createdAt" desc
  `);

  return rows.map((row) => ({
    ...row,
    lifecycleStatus: row.lifecycleStatus as StudentLifecycleStatus,
    totalCount: toNumber(row.totalCount),
    invoices: asJsonArray<StudentInvoiceRecord>(row.invoices).map((invoice) => ({
      ...invoice,
      status: invoice.status as InvoiceStatus,
    })),
    payments: asJsonArray<StudentPaymentRecord>(row.payments),
    monthlyPayments: asJsonArray<StudentMonthlyPaymentRecord>(row.monthlyPayments),
    timeline: asJsonArray<StudentTimelineRecord>(row.timeline).map((item) => ({
      ...item,
      newStatus: item.newStatus as StudentLifecycleStatus,
    })),
  }));
}

type StudentCreateOptionRows = {
  summaryCounts: Record<string, number>;
  summaryBalances: Record<string, number>;
  debtCount: number;
  debtBalance: number;
  programs: Array<{
    id: string;
    name: string;
    defaultMonthlyFee: unknown;
    defaultLessonsPerMonth: number | null;
    description: string | null;
    isActive: boolean;
  }>;
  teachers: Array<{ id: string; fullName: string }>;
  campaigns: Array<{ id: string; name: string }>;
  educationLevels: Array<{ value: string; label: string }>;
  discountTypes: Array<{ value: string; label: string }>;
  sources: string[];
  leads: StudentListData["createOptions"]["leads"];
};

type StudentCreateOptionsRawRow = {
  summaryCounts: unknown;
  summaryBalances: unknown;
  debtCount: unknown;
  debtBalance: unknown;
  programs: unknown;
  teachers: unknown;
  campaigns: unknown;
  educationLevels: unknown;
  discountTypes: unknown;
  sources: unknown;
  leads: unknown;
};

const getCachedStudentListRawData = unstable_cache(
  async (input: StudentListCacheInput) => getStudentListRawData(input),
  ["student-list-data-v10"],
  {
    revalidate: 30,
    tags: [erpCacheTags.students],
  }
);

async function readStudentListRawData(
  input: StudentListCacheInput
): Promise<StudentListRawData> {
  try {
    return await getCachedStudentListRawData(input);
  } catch (error) {
    if (!isMissingIncrementalCacheError(error)) {
      throw error;
    }

    return getStudentListRawData(input);
  }
}

async function getStudentListRawData(
  input: StudentListCacheInput
): Promise<StudentListRawData> {
  const prisma = getPrisma();
  const filterInput = {
    search: input.search,
    statusFilter: input.statusFilter,
    churnOnly: input.churnOnly,
    programFilter: input.programFilter,
    teacherFilter: input.teacherFilter,
    paymentFilter: input.paymentFilter,
    today: new Date(input.today),
    dateFrom: input.dateFrom ? new Date(input.dateFrom) : null,
    dateTo: input.dateTo ? new Date(input.dateTo) : null,
  };
  const [rows, options, clv, paymentSummary, operations] = await Promise.all([
    getStudentRows(prisma, {
      ...filterInput,
      page: input.page,
      pageSize: input.pageSize,
    }),
    getStudentCreateOptions(prisma, filterInput.today),
    getStudentClvSummary(prisma, filterInput),
    getStudentPaymentSummary(prisma, filterInput),
    getStudentOperationsOverview(prisma, filterInput.today),
  ]);

  return { rows, options, clv, paymentSummary, operations };
}

async function getStudentClvSummary(
  prisma: ReturnType<typeof getPrisma>,
  input: Parameters<typeof buildStudentWhereSql>[0]
): Promise<StudentClvSummary> {
  const whereSql = buildStudentWhereSql(input);
  const [summary] = await prisma.$queryRaw<
    Array<{ totalPaid: unknown; averagePaid: unknown; paidMonths: unknown }>
  >(Prisma.sql`
    select
      coalesce(sum(clv.total_paid), 0) as "totalPaid",
      coalesce(avg(clv.total_paid), 0) as "averagePaid",
      coalesce(sum(clv.paid_months), 0) as "paidMonths"
    from erp.students s
    join erp.contacts c on c.id = s.contact_id
    left join lateral (
      select
        coalesce(sum(p.amount), 0) as total_paid,
        count(distinct p.payment_month) filter (
          where p.schedule_type = 'MONTHLY'::"erp"."PaymentScheduleType"
        )::int as paid_months
      from erp.payments p
      where p.student_id = s.id
    ) clv on true
    ${whereSql}
  `);

  return {
    totalPaid: toNumber(summary?.totalPaid),
    averagePaid: toNumber(summary?.averagePaid),
    paidMonths: toNumber(summary?.paidMonths),
  };
}

async function getStudentPaymentSummary(
  prisma: ReturnType<typeof getPrisma>,
  input: Parameters<typeof buildStudentWhereSql>[0]
): Promise<StudentPaymentSummary> {
  const whereSql = buildStudentWhereSql(input);
  const [summary] = await prisma.$queryRaw<
    Array<{ expectedPayment: unknown; overduePayment: unknown }>
  >(Prisma.sql`
    select
      coalesce(sum(balance.balance_due) filter (
        where balance.balance_due > 0
      ), 0) as "expectedPayment",
      coalesce(sum(balance.balance_due) filter (
        where balance.next_due_date < ${input.today}::date
      ), 0) as "overduePayment"
    from erp.students s
    join erp.contacts c on c.id = s.contact_id
    left join lateral (
      select
        e.monthly_fee
      from erp.enrollments e
      where e.student_id = s.id
        and e.status in (
          'ACTIVE'::"erp"."EnrollmentStatus",
          'PAUSED'::"erp"."EnrollmentStatus"
        )
      order by e.start_date desc, e.created_at desc
      limit 1
    ) ae on true
    left join lateral (
      select
        greatest(coalesce((
          select sum(i.balance_due)
          from erp.invoices i
          where i.student_id = s.id
            and i.status <> 'VOID'::"erp"."InvoiceStatus"
            and i.balance_due > 0
        ), 0), greatest(coalesce(ae.monthly_fee, 0) - coalesce((
          select sum(p.amount)
          from erp.payments p
          where p.student_id = s.id
            and date_trunc('month', p.paid_at) = date_trunc('month', ${input.today}::date)
        ), 0), 0)) as balance_due,
        (
          select p.next_payment_at
          from erp.payments p
          where p.student_id = s.id
            and p.next_payment_at is not null
          order by p.paid_at desc, p.created_at desc
          limit 1
        ) as next_due_date
    ) balance on true
    ${whereSql}
  `);

  return {
    expectedPayment: toNumber(summary?.expectedPayment),
    overduePayment: toNumber(summary?.overduePayment),
  };
}

async function getStudentOperationsOverview(
  prisma: ReturnType<typeof getPrisma>,
  today: Date,
): Promise<StudentListData["operations"]> {
  const [row] = await prisma.$queryRaw<StudentOperationsRawRow[]>(Prisma.sql`
    with current_enrollment as (
      select distinct on (e.student_id)
        e.student_id,
        e.monthly_fee,
        e.program_id,
        e.teacher_id,
        p.name as program_name,
        t.full_name as teacher_name
      from erp.enrollments e
      join erp.programs p on p.id = e.program_id
      left join erp.teachers t on t.id = e.teacher_id
      where e.status in (
        'ACTIVE'::"erp"."EnrollmentStatus",
        'PAUSED'::"erp"."EnrollmentStatus"
      )
      order by e.student_id, e.start_date desc, e.created_at desc
    ),
    student_month as (
      select
        s.id,
        s.lifecycle_status,
        ce.monthly_fee,
        ce.program_name,
        ce.teacher_name,
        ce.teacher_id,
        coalesce((
          select sum(p.amount)
          from erp.payments p
          where p.student_id = s.id
            and p.paid_at >= date_trunc('month', ${today}::date)
            and p.paid_at < date_trunc('month', ${today}::date) + interval '1 month'
        ), 0) as current_month_paid,
        coalesce((
          select sum(i.balance_due)
          from erp.invoices i
          where i.student_id = s.id
            and i.status <> 'VOID'::"erp"."InvoiceStatus"
            and i.balance_due > 0
        ), 0) as invoice_balance,
        (
          select p.next_payment_at
          from erp.payments p
          where p.student_id = s.id
            and p.next_payment_at is not null
          order by p.paid_at desc, p.created_at desc
          limit 1
        ) as next_due_date
      from erp.students s
      left join current_enrollment ce on ce.student_id = s.id
    ),
    student_finance as (
      select
        sm.*,
        greatest(
          sm.invoice_balance,
          greatest(coalesce(sm.monthly_fee, 0) - sm.current_month_paid, 0)
        ) as balance_due
      from student_month sm
    )
    select
      count(*) filter (where lifecycle_status in (
        'ACTIVE'::"erp"."StudentLifecycleStatus",
        'DEBT'::"erp"."StudentLifecycleStatus"
      ))::int as "activeCount",
      count(*) filter (where lifecycle_status = 'SLOT_WAITING'::"erp"."StudentLifecycleStatus")::int as "slotWaitingCount",
      count(*) filter (where lifecycle_status in (
        'FROZEN'::"erp"."StudentLifecycleStatus",
        'STOPPED'::"erp"."StudentLifecycleStatus"
      ))::int as "frozenOrStoppedCount",
      count(*) filter (
        where lifecycle_status in ('ACTIVE'::"erp"."StudentLifecycleStatus", 'DEBT'::"erp"."StudentLifecycleStatus")
          and balance_due > 0
          and (next_due_date is null or next_due_date <= ${today}::date)
      )::int as "actionableCount",
      coalesce(sum(balance_due) filter (
        where lifecycle_status in ('ACTIVE'::"erp"."StudentLifecycleStatus", 'DEBT'::"erp"."StudentLifecycleStatus")
          and balance_due > 0
          and (next_due_date is null or next_due_date <= ${today}::date)
      ), 0) as "actionableAmount",
      count(*) filter (
        where lifecycle_status in ('ACTIVE'::"erp"."StudentLifecycleStatus", 'DEBT'::"erp"."StudentLifecycleStatus")
          and balance_due > 0
          and next_due_date < ${today}::date
      )::int as "overdueCount",
      coalesce(sum(balance_due) filter (
        where lifecycle_status in ('ACTIVE'::"erp"."StudentLifecycleStatus", 'DEBT'::"erp"."StudentLifecycleStatus")
          and balance_due > 0
          and next_due_date < ${today}::date
      ), 0) as "overdueAmount",
      count(*) filter (
        where lifecycle_status in ('ACTIVE'::"erp"."StudentLifecycleStatus", 'DEBT'::"erp"."StudentLifecycleStatus")
          and balance_due > 0
          and next_due_date > ${today}::date
      )::int as "futureCount",
      coalesce(sum(balance_due) filter (
        where lifecycle_status in ('ACTIVE'::"erp"."StudentLifecycleStatus", 'DEBT'::"erp"."StudentLifecycleStatus")
          and balance_due > 0
          and next_due_date > ${today}::date
      ), 0) as "futureAmount",
      count(*) filter (
        where lifecycle_status in ('ACTIVE'::"erp"."StudentLifecycleStatus", 'DEBT'::"erp"."StudentLifecycleStatus")
          and balance_due > 0
          and next_due_date is null
      )::int as "unscheduledCount",
      count(*) filter (
        where lifecycle_status in ('ACTIVE'::"erp"."StudentLifecycleStatus", 'DEBT'::"erp"."StudentLifecycleStatus")
          and balance_due > 0
          and next_due_date = ${today}::date
      )::int as "dueTodayCount",
      count(*) filter (
        where lifecycle_status in ('ACTIVE'::"erp"."StudentLifecycleStatus", 'DEBT'::"erp"."StudentLifecycleStatus")
          and teacher_id is null
      )::int as "activeWithoutTeacherCount",
      coalesce(sum(monthly_fee) filter (
        where lifecycle_status in ('ACTIVE'::"erp"."StudentLifecycleStatus", 'DEBT'::"erp"."StudentLifecycleStatus")
      ), 0) as "expectedAmount",
      coalesce(sum(current_month_paid) filter (
        where lifecycle_status in ('ACTIVE'::"erp"."StudentLifecycleStatus", 'DEBT'::"erp"."StudentLifecycleStatus")
      ), 0) as "collectedAmount",
      coalesce((
        select jsonb_agg(jsonb_build_object('name', grouped.name, 'count', grouped.count) order by grouped.count desc, grouped.name asc)
        from (
          select program_name as name, count(*)::int as count
          from student_finance
          where lifecycle_status in ('ACTIVE'::"erp"."StudentLifecycleStatus", 'DEBT'::"erp"."StudentLifecycleStatus")
            and program_name is not null
          group by program_name
        ) grouped
      ), '[]'::jsonb) as programs,
      coalesce((
        select jsonb_agg(jsonb_build_object('name', grouped.name, 'count', grouped.count) order by grouped.count desc, grouped.name asc)
        from (
          select teacher_name as name, count(*)::int as count
          from student_finance
          where lifecycle_status in ('ACTIVE'::"erp"."StudentLifecycleStatus", 'DEBT'::"erp"."StudentLifecycleStatus")
            and teacher_name is not null
          group by teacher_name
        ) grouped
      ), '[]'::jsonb) as teachers
    from student_finance
  `);

  const expectedAmount = toNumber(row?.expectedAmount);
  const collectedAmount = toNumber(row?.collectedAmount);
  const collectionRate = expectedAmount > 0
    ? Math.min(100, Math.round((collectedAmount / expectedAmount) * 100))
    : 100;

  return {
    periodLabel: new Intl.DateTimeFormat("az-AZ", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(today),
    refreshSeconds: 60,
    activeCount: toNumber(row?.activeCount),
    slotWaitingCount: toNumber(row?.slotWaitingCount),
    frozenOrStoppedCount: toNumber(row?.frozenOrStoppedCount),
    actionableCount: toNumber(row?.actionableCount),
    actionableAmount: formatAmount(row?.actionableAmount),
    overdueCount: toNumber(row?.overdueCount),
    overdueAmount: formatAmount(row?.overdueAmount),
    futureCount: toNumber(row?.futureCount),
    futureAmount: formatAmount(row?.futureAmount),
    unscheduledCount: toNumber(row?.unscheduledCount),
    dueTodayCount: toNumber(row?.dueTodayCount),
    activeWithoutTeacherCount: toNumber(row?.activeWithoutTeacherCount),
    expectedAmount: formatAmount(expectedAmount),
    collectedAmount: formatAmount(collectedAmount),
    collectionRate,
    programs: toOperationsDistribution(row?.programs),
    teachers: toOperationsDistribution(row?.teachers),
  };
}

async function getStudentCreateOptions(
  prisma: ReturnType<typeof getPrisma>,
  today: Date,
): Promise<StudentCreateOptionRows> {
  const [row] = await prisma.$queryRaw<StudentCreateOptionsRawRow[]>(Prisma.sql`
    select
      coalesce((
        select jsonb_object_agg(summary.lifecycle_status, summary.total_count)
        from (
          select s.lifecycle_status::text as lifecycle_status, count(*)::int as total_count
          from erp.students s
          group by s.lifecycle_status
        ) summary
      ), '{}'::jsonb) as "summaryCounts",
      coalesce((
        select jsonb_object_agg(summary.lifecycle_status, summary.total_balance)
        from (
          select
            s.lifecycle_status::text as lifecycle_status,
            coalesce(sum(i.balance_due), 0) as total_balance
          from erp.students s
          left join erp.invoices i
            on i.student_id = s.id
            and i.status <> 'VOID'::"erp"."InvoiceStatus"
            and i.balance_due > 0
          group by s.lifecycle_status
        ) summary
      ), '{}'::jsonb) as "summaryBalances",
      coalesce((
        select count(*)::int
        from erp.students s
        where s.lifecycle_status in (
          'ACTIVE'::"erp"."StudentLifecycleStatus",
          'DEBT'::"erp"."StudentLifecycleStatus"
        )
          and ${buildStudentDebtDueSql(today)}
      ), 0) as "debtCount",
      coalesce((
        select sum(greatest(
          coalesce((
            select sum(i.balance_due)
            from erp.invoices i
            where i.student_id = s.id
              and i.status <> 'VOID'::"erp"."InvoiceStatus"
              and i.balance_due > 0
          ), 0),
          greatest(coalesce(ae.monthly_fee, 0) - coalesce((
            select sum(p.amount)
            from erp.payments p
            where p.student_id = s.id
              and date_trunc('month', p.paid_at) = date_trunc('month', ${today}::date)
          ), 0), 0)
        ))
        from erp.students s
        left join lateral (
          select e.monthly_fee
          from erp.enrollments e
          where e.student_id = s.id
            and e.status in (
              'ACTIVE'::"erp"."EnrollmentStatus",
              'PAUSED'::"erp"."EnrollmentStatus"
            )
          order by e.start_date desc, e.created_at desc
          limit 1
        ) ae on true
        where s.lifecycle_status in (
          'ACTIVE'::"erp"."StudentLifecycleStatus",
          'DEBT'::"erp"."StudentLifecycleStatus"
        )
          and ${buildStudentDebtDueSql(today)}
      ), 0) as "debtBalance",
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', p.id::text,
            'name', p.name,
            'defaultMonthlyFee', p.default_monthly_fee,
            'defaultLessonsPerMonth', p.default_lessons_per_month
            ,'description', p.description
            ,'isActive', p.is_active
          )
          order by p.name asc
        )
        from erp.programs p
        where p.is_active = true
      ), '[]'::jsonb) as "programs",
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', t.id::text,
            'fullName', t.full_name
          )
          order by t.full_name asc
        )
        from erp.teachers t
        where t.is_active = true
      ), '[]'::jsonb) as "teachers",
      coalesce((
        select jsonb_agg(source_rows.source order by source_rows.source asc)
        from (
          select distinct trim(c.source) as source
          from erp.contacts c
          where c.source is not null
            and trim(c.source) <> ''
        ) source_rows
      ), '[]'::jsonb) as "sources",
      coalesce((
        select jsonb_agg(jsonb_build_object('id', mc.id::text, 'name', mc.name) order by mc.name asc)
        from erp.marketing_campaigns mc
        where mc.status = 'ACTIVE'::"erp"."MarketingCampaignStatus"
      ), '[]'::jsonb) as "campaigns",
      coalesce((
        select jsonb_agg(
          jsonb_build_object('value', dco.value, 'label', dco.label)
          order by dco.label asc, dco.created_at asc
        )
        from erp.dropdown_catalog_options dco
        where dco.catalog = 'STUDENT_EDUCATION_LEVEL'
          and dco.is_active = true
      ), '[]'::jsonb) as "educationLevels",
      coalesce((
        select jsonb_agg(
          jsonb_build_object('value', dco.value, 'label', dco.label)
          order by dco.label asc, dco.created_at asc
        )
        from erp.dropdown_catalog_options dco
        where dco.catalog = 'STUDENT_DISCOUNT_TYPE'
          and dco.is_active = true
      ), '[]'::jsonb) as "discountTypes",
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', ordered.id,
            'name', ordered.name,
            'phone', ordered.phone,
            'source', ordered.source,
            'educationLevel', ordered.education_level,
            'programId', ordered.program_id,
            'managerId', ordered.manager_id,
            'campaignId', ordered.campaign_id,
            'note', ordered.note
          )
          order by ordered.updated_at desc, ordered.created_at desc
        )
        from (
          select
            l.id::text as id,
            c.full_name as name,
            coalesce(c.phone_display, '') as phone,
            coalesce(l.source, 'Manual') as source,
            coalesce(l.education_level, '') as education_level,
            coalesce(l.program_interest_id::text, '') as program_id,
            coalesce(l.manager_id::text, '') as manager_id,
            coalesce(l.campaign_id::text, '') as campaign_id,
            coalesce(last_history.reason, '') as note,
            l.updated_at,
            l.created_at
          from erp.leads l
          join erp.contacts c on c.id = l.contact_id
          left join lateral (
            select h.reason
            from erp.lead_stage_history h
            where h.lead_id = l.id
            order by h.created_at desc
            limit 1
          ) last_history on true
          where l.converted_student_id is null
            and l.stage <> 'REGISTERED'::"erp"."LeadStage"
          order by l.updated_at desc, l.created_at desc
          limit 60
        ) ordered
      ), '[]'::jsonb) as "leads"
  `);

  return {
    summaryCounts: asJsonRecord(row?.summaryCounts),
    summaryBalances: asJsonRecord(row?.summaryBalances),
    debtCount: toNumber(row?.debtCount),
    debtBalance: toNumber(row?.debtBalance),
    programs: asJsonArray<StudentCreateOptionRows["programs"][number]>(
      row?.programs
    ),
    teachers: asJsonArray<StudentCreateOptionRows["teachers"][number]>(
      row?.teachers
    ),
    campaigns: asJsonArray<StudentCreateOptionRows["campaigns"][number]>(row?.campaigns),
    educationLevels: asJsonArray<StudentCreateOptionRows["educationLevels"][number]>(row?.educationLevels),
    discountTypes: asJsonArray<StudentCreateOptionRows["discountTypes"][number]>(row?.discountTypes),
    sources: asJsonArray<string>(row?.sources),
    leads: asJsonArray<StudentCreateOptionRows["leads"][number]>(row?.leads),
  };
}

function buildStudentOutstandingBalanceSql(today: Date) {
  return Prisma.sql`(
    exists (
      select 1
      from erp.invoices i
      where i.student_id = s.id
        and i.status <> 'VOID'::"erp"."InvoiceStatus"
        and i.balance_due > 0
    )
    or exists (
      select 1
      from erp.enrollments e
      where e.student_id = s.id
        and e.status in (
          'ACTIVE'::"erp"."EnrollmentStatus",
          'PAUSED'::"erp"."EnrollmentStatus"
        )
        and e.monthly_fee > coalesce((
          select sum(p.amount)
          from erp.payments p
          where p.student_id = s.id
            and date_trunc('month', p.paid_at) = date_trunc('month', ${today}::date)
        ), 0)
    )
  )`;
}

function buildStudentDebtDueSql(today: Date, overdueOnly = false) {
  const nextPaymentDateSql = Prisma.sql`(
    select p.next_payment_at
    from erp.payments p
    where p.student_id = s.id
      and p.next_payment_at is not null
    order by p.paid_at desc, p.created_at desc
    limit 1
  )`;
  const dueDateCondition = overdueOnly
    ? Prisma.sql`${nextPaymentDateSql} < ${today}::date`
    : Prisma.sql`(${nextPaymentDateSql} is null or ${nextPaymentDateSql} <= ${today}::date)`;

  return Prisma.sql`(${dueDateCondition} and ${buildStudentOutstandingBalanceSql(today)})`;
}

function buildStudentWhereSql({
  search,
  statusFilter,
  churnOnly,
  programFilter,
  teacherFilter,
  paymentFilter,
  today,
  dateFrom,
  dateTo,
}: {
  search: string;
  statusFilter: StudentLifecycleStatus | "";
  churnOnly: boolean;
  programFilter: string;
  teacherFilter: string;
  paymentFilter: StudentPaymentFilter;
  today: Date;
  dateFrom: Date | null;
  dateTo: Date | null;
}) {
  const conditions: Prisma.Sql[] = [Prisma.sql`true`];
  const debtDueSql = buildStudentDebtDueSql(today);

  if (search.length > 0) {
    const searchPattern = `%${search}%`;
    const searchDigits = search.replace(/\D/g, "");
    const searchConditions: Prisma.Sql[] = [
      Prisma.sql`s.code ilike ${searchPattern}`,
      Prisma.sql`c.full_name ilike ${searchPattern}`,
      Prisma.sql`c.phone_display ilike ${searchPattern}`,
    ];

    if (searchDigits.length > 0) {
      searchConditions.push(Prisma.sql`c.phone_normalized like ${`%${searchDigits}%`}`);
    }

    conditions.push(Prisma.sql`(${Prisma.join(searchConditions, " OR ")})`);
  }

  if (statusFilter) {
    if (statusFilter === StudentLifecycleStatus.DEBT) {
      conditions.push(Prisma.sql`(
        s.lifecycle_status in (
          'ACTIVE'::"erp"."StudentLifecycleStatus",
          'DEBT'::"erp"."StudentLifecycleStatus"
        )
        and ${debtDueSql}
      )`);
    } else if (statusFilter === StudentLifecycleStatus.ACTIVE) {
      conditions.push(Prisma.sql`(
        s.lifecycle_status in (
          'ACTIVE'::"erp"."StudentLifecycleStatus",
          'DEBT'::"erp"."StudentLifecycleStatus"
        )
        and not ${debtDueSql}
      )`);
    } else {
      conditions.push(
        Prisma.sql`s.lifecycle_status = ${statusFilter}::"erp"."StudentLifecycleStatus"`
      );
    }
  }

  if (churnOnly) {
    conditions.push(Prisma.sql`s.lifecycle_status in (
      'FROZEN'::"erp"."StudentLifecycleStatus",
      'STOPPED'::"erp"."StudentLifecycleStatus",
      'DECLINED'::"erp"."StudentLifecycleStatus"
    )`);
  }

  if (programFilter) {
    conditions.push(Prisma.sql`exists (
      select 1
      from erp.enrollments e
      where e.student_id = s.id
        and e.status in (
          'ACTIVE'::"erp"."EnrollmentStatus",
          'PAUSED'::"erp"."EnrollmentStatus"
        )
        and e.program_id = ${programFilter}::uuid
    )`);
  }

  if (teacherFilter) {
    const teacherCondition =
      teacherFilter === UNASSIGNED_TEACHER
        ? Prisma.sql`e.teacher_id is null`
        : Prisma.sql`e.teacher_id = ${teacherFilter}::uuid`;

    conditions.push(Prisma.sql`exists (
      select 1
      from erp.enrollments e
      where e.student_id = s.id
        and e.status in (
          'ACTIVE'::"erp"."EnrollmentStatus",
          'PAUSED'::"erp"."EnrollmentStatus"
        )
        and ${teacherCondition}
    )`);
  }

  if (paymentFilter === "paid") {
    conditions.push(Prisma.sql`not ${buildStudentOutstandingBalanceSql(today)}`);
  }

  if (paymentFilter === "open") {
    conditions.push(Prisma.sql`s.lifecycle_status in (
      'ACTIVE'::"erp"."StudentLifecycleStatus",
      'DEBT'::"erp"."StudentLifecycleStatus"
    )`);
    conditions.push(debtDueSql);
  }

  if (paymentFilter === "overdue") {
    conditions.push(Prisma.sql`s.lifecycle_status in (
      'ACTIVE'::"erp"."StudentLifecycleStatus",
      'DEBT'::"erp"."StudentLifecycleStatus"
    )`);
    conditions.push(buildStudentDebtDueSql(today, true));
  }

  if (dateFrom || dateTo) {
    const fromCond = dateFrom ? Prisma.sql`s.registered_at >= ${dateFrom}::date` : Prisma.sql`true`;
    const toCond = dateTo ? Prisma.sql`s.registered_at <= ${dateTo}::date` : Prisma.sql`true`;
    conditions.push(Prisma.sql`(${fromCond} AND ${toCond})`);
  }

  return Prisma.sql`where ${Prisma.join(conditions, " AND ")}`;
}

function asJsonArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }

  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }

  return [];
}

function toOperationsDistribution(value: unknown) {
  const rows = asJsonArray<{ name: string; count: unknown }>(value).map((item) => ({
    name: item.name,
    count: toNumber(item.count),
  }));
  const total = rows.reduce((sum, item) => sum + item.count, 0);

  return rows.map((item) => ({
    ...item,
    percentage: total > 0 ? Math.round((item.count / total) * 100) : 0,
  }));
}

function asJsonRecord(value: unknown): Record<string, number> {
  const parsed =
    typeof value === "string"
      ? parseJsonObject(value)
      : value && typeof value === "object" && !Array.isArray(value)
        ? value
        : null;

  if (!parsed) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(parsed).map(([key, count]) => [key, toNumber(count)])
  );
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function normalizeLifecycleStatus(value: string | undefined) {
  const normalized = formFilterString(value);

  if (!normalized) {
    return "";
  }

  return (Object.values(StudentLifecycleStatus) as string[]).includes(normalized)
    ? (normalized as StudentLifecycleStatus)
    : "";
}

function normalizePaymentFilter(value: string | undefined): StudentPaymentFilter {
  const normalized = formFilterString(value);
  return paymentOptions.some((option) => option.value === normalized)
    ? (normalized as StudentPaymentFilter)
    : "all";
}

function normalizeChurnFilter(value: string | undefined) {
  return value === "1" || value === "true";
}

function getOverdueDays(nextDueDate: Date | undefined, today: Date) {
  if (!nextDueDate || nextDueDate >= today) {
    return 0;
  }

  return Math.floor((today.getTime() - nextDueDate.getTime()) / 86_400_000);
}

function normalizeDateFilter(value: string | undefined) {
  const normalized = normalizeDateValue(value);

  return {
    input: normalized ? normalized.toISOString().slice(0, 10) : "",
    date: normalized,
  };
}

function normalizeStudentTab(value: string | undefined) {
  if (value === "list" || value === "programs") return value;
  return "overview";
}

function normalizeDateValue(value: string | undefined) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return new Date(`${trimmed}T00:00:00.000Z`);
  }

  const azMatch = trimmed.match(/^(\d{2})[./](\d{2})[./](\d{4})$/);
  if (azMatch) {
    const day = parseInt(azMatch[1], 10);
    const month = parseInt(azMatch[2], 10) - 1;
    const year = parseInt(azMatch[3], 10);
    return new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
  }

  const parsed = new Date(trimmed);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function buildStudentsUrl({
  q,
  status,
  churn,
  program,
  teacher,
  payment,
  from,
  to,
  page,
  tab,
}: {
  q: string;
  status: StudentLifecycleStatus | "";
  churn: boolean;
  program: string;
  teacher: string;
  payment: StudentPaymentFilter;
  from?: string;
  to?: string;
  page?: number;
  tab?: "overview" | "list" | "programs";
}) {
  const params = new URLSearchParams();

  if (tab && tab !== "overview") {
    params.set("tab", tab);
  }

  if (q) {
    params.set("q", q);
  }

  if (status) {
    params.set("status", status);
  }

  if (churn) {
    params.set("churn", "1");
  }

  if (program) {
    params.set("program", program);
  }

  if (teacher) {
    params.set("teacher", teacher);
  }

  if (payment !== "all") {
    params.set("payment", payment);
  }

  if (from) {
    params.set("from", from);
  }

  if (to) {
    params.set("to", to);
  }

  if (tab === "list" && page && page > 1) {
    params.set("page", page.toString());
  }

  return params.size > 0 ? `/students?${params.toString()}` : "/students";
}

function formatDateInput(value: Date) {
  return [
    value.getDate().toString().padStart(2, "0"),
    (value.getMonth() + 1).toString().padStart(2, "0"),
    value.getFullYear().toString(),
  ].join(".");
}

function formatMonthInput(value: Date | string) {
  return new Date(value).toISOString().slice(0, 7);
}

function formatDecimalInput(value: unknown) {
  const amount = toNumber(value);
  return amount > 0 ? amount.toFixed(2) : "";
}

function formatNonNegativeDecimalInput(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  return toNumber(value).toFixed(2);
}

function startOfToday() {
  return new Date(`${getBakuDateInput()}T00:00:00.000Z`);
}

function isMissingIncrementalCacheError(error: unknown) {
  return error instanceof Error && error.message.includes("incrementalCache missing");
}

export async function getStudentDetailData(studentId: string) {
  const actor = await requireErpActor("student.read");
  const prisma = getPrisma();
  const today = startOfToday();
  const studentReadScope = scopeFor(actor.permissions, "student.read");
  const studentScopeSql = studentReadScope === "ALL"
    ? Prisma.sql`true`
    : studentReadScope === "ASSIGNED"
      ? Prisma.sql`s.manager_id = ${actor.id}::uuid`
      : Prisma.sql`false`;

  const rows = await prisma.$queryRaw<StudentDetailRawRow[]>(Prisma.sql`
    with paged_students as (
      select
        s.id,
        s.code,
        s.lifecycle_status::text as "lifecycleStatus",
        s.registered_at as "registeredAt",
        s.created_at as "createdAt",
        s.notes,
        s.billing_paused as "billingPaused",
        s.education_level as "educationLevel",
        s.manager_id::text as "managerId",
        s.campaign_id::text as "campaignId",
        c.full_name as "name",
        c.phone_display as "phone",
        c.email as "contactEmail",
        c.source,
        u.full_name as "managerName",
        mc.name as "campaignName",
        1::int as "totalCount"
      from erp.students s
      join erp.contacts c on c.id = s.contact_id
      left join erp.users u on u.id = s.manager_id
      left join erp.marketing_campaigns mc on mc.id = s.campaign_id
      where s.id = ${studentId}::uuid
        and ${studentScopeSql}
    )
    select
      ps.id::text as "id",
      ps.code,
      ps."lifecycleStatus",
      ps."registeredAt",
      ps.notes,
      ps."billingPaused",
      ps."educationLevel",
      ps."managerId",
      ps."campaignId",
      ps.name,
      ps.phone,
      ps."contactEmail",
      ps.source,
      ps."managerName",
      ps."campaignName",
      ps."totalCount",
      ae.id::text as "enrollmentId",
      ae.program_id::text as "programId",
      ae.teacher_id::text as "teacherId",
      ae.monthly_fee as "monthlyFee",
      ae.discount_type as "discountType",
      ae.lessons_per_month as "lessonsPerMonth",
      ae.first_lesson_at as "firstLessonAt",
      ae.program_name as "programName",
      ae.teacher_name as "teacherName",
      (select concat(t.full_name, ' · ', cs.start_time, '–', cs.end_time) from erp.student_schedule_assignments ssa join erp.class_slots cs on cs.id = ssa.slot_id join erp.teachers t on t.id = cs.teacher_id join erp.enrollments se on se.id = ssa.enrollment_id where se.student_id = ps.id and ssa.valid_to is null order by ssa.valid_from desc, ssa.created_at desc limit 1) as "slotLabel",
      inv.balance_due as "balanceDue",
      coalesce((select sum(p.amount) from erp.payments p where p.student_id = ps.id and date_trunc('month', p.paid_at) = date_trunc('month', ${today}::date)), 0) as "currentMonthPaid",
      inv.next_due_date as "nextDueDate",
      clv.total_paid as "totalPaid",
      clv.paid_months as "paidMonths",
      clv_history.monthly_payments as "monthlyPayments",
      inv.invoices,
      pay.payments,
      hist.timeline
    from paged_students ps
    left join lateral (
      select
        e.id,
        e.program_id,
        e.teacher_id,
        e.monthly_fee,
        e.discount_type,
        e.lessons_per_month,
        e.first_lesson_at,
        p.name as program_name,
        t.full_name as teacher_name
      from erp.enrollments e
      join erp.programs p on p.id = e.program_id
      left join erp.teachers t on t.id = e.teacher_id
      where e.student_id = ps.id
        and e.status in (
          'ACTIVE'::"erp"."EnrollmentStatus",
          'PAUSED'::"erp"."EnrollmentStatus"
        )
      order by e.start_date desc, e.created_at desc
      limit 1
    ) ae on true
    left join lateral (
      select
        greatest(coalesce((
          select sum(i.balance_due)
          from erp.invoices i
          where i.student_id = ps.id
            and i.status <> 'VOID'::"erp"."InvoiceStatus"
            and i.balance_due > 0
        ), 0), greatest(coalesce(ae.monthly_fee, 0) - coalesce((
          select sum(p.amount)
          from erp.payments p
          where p.student_id = ps.id
            and date_trunc('month', p.paid_at) = date_trunc('month', ${today}::date)
        ), 0), 0)) as balance_due,
        (select p.next_payment_at from erp.payments p where p.student_id = ps.id and p.next_payment_at is not null order by p.paid_at desc, p.created_at desc limit 1) as next_due_date,
        coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', ordered.id::text,
              'amount', ordered.amount,
              'balanceDue', ordered.balance_due,
              'dueDate', ordered.due_date,
              'periodMonth', ordered.period_month,
              'status', ordered.status::text
            )
            order by ordered.due_date asc, ordered.created_at asc
          )
          from (
            select i.id, i.amount, i.balance_due, i.due_date, i.period_month, i.status, i.created_at
            from erp.invoices i
            where i.student_id = ps.id
              and i.status <> 'VOID'::"erp"."InvoiceStatus"
            order by i.due_date asc, i.created_at asc
            limit 6
          ) ordered
        ), '[]'::jsonb) as invoices
    ) inv on true
    left join lateral (
      select
        coalesce(sum(p.amount), 0) as total_paid,
        count(distinct p.payment_month) filter (
          where p.schedule_type = 'MONTHLY'::"erp"."PaymentScheduleType"
        )::int as paid_months
      from erp.payments p
      where p.student_id = ps.id
    ) clv on true
    left join lateral (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'month', monthly.payment_month,
          'amount', monthly.amount,
          'paidAt', monthly.last_paid_at
        )
        order by monthly.payment_month desc
      ), '[]'::jsonb) as monthly_payments
      from (
        select
          date_trunc('month', p.payment_month)::date as payment_month,
          sum(p.amount) as amount,
          max(p.paid_at) as last_paid_at
        from erp.payments p
        where p.student_id = ps.id
          and p.schedule_type = 'MONTHLY'::"erp"."PaymentScheduleType"
        group by date_trunc('month', p.payment_month)::date
      ) monthly
    ) clv_history on true
    left join lateral (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', ordered.id::text,
          'amount', ordered.amount,
          'paidAt', ordered.paid_at,
          'paymentMonth', ordered.payment_month,
          'nextPaymentAt', ordered.next_payment_at,
          'scheduleType', ordered.schedule_type::text,
          'method', ordered.method::text,
          'note', ordered.note,
          'createdByName', ordered.created_by_name
        )
        order by ordered.paid_at desc, ordered.created_at desc
      ), '[]'::jsonb) as payments
      from (
        select p.id, p.amount, p.paid_at, p.payment_month, p.next_payment_at, p.schedule_type, p.method, p.note, p.created_at, u.full_name as created_by_name
        from erp.payments p
        left join erp.users u on u.id = p.created_by_id
        where p.student_id = ps.id
        order by p.paid_at desc, p.created_at desc
        limit 5
      ) ordered
    ) pay on true
    left join lateral (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', ordered.id::text,
          'newStatus', ordered.new_status::text,
          'reason', ordered.reason,
          'note', ordered.note,
          'effectiveAt', ordered.effective_at,
          'changedByName', ordered.changed_by_name
        )
        order by ordered.effective_at desc, ordered.created_at desc
      ), '[]'::jsonb) as timeline
      from (
        select h.id, h.new_status, h.reason, h.note, h.effective_at, h.created_at, u.full_name as changed_by_name
        from erp.student_status_history h
        left join erp.users u on u.id = h.changed_by_id
        where h.student_id = ps.id
        order by h.effective_at desc, h.created_at desc
        limit 5
      ) ordered
    ) hist on true
  `);

  if (rows.length === 0) {
    return null;
  }

  const student = rows[0];
  const balance = toNumber(student.balanceDue);
  const totalPaid = toNumber(student.totalPaid);
  const currentMonthPaid = toNumber(student.currentMonthPaid);
  const paidMonths = toNumber(student.paidMonths);
  const nextPaymentAt = student.nextDueDate
    ? new Date(student.nextDueDate as Date)
    : null;
  const debtDue = isStudentDebtDue({ balance, nextPaymentAt, today });
  const effectiveLifecycleStatus = resolveStudentLifecycleStatus({
    lifecycleStatus: student.lifecycleStatus,
    debtDue,
  }) as StudentLifecycleStatus;
  const lifecycleStatus = lifecycleMeta[effectiveLifecycleStatus];
  const paymentStatus = resolveStudentPaymentStatus({ balance, nextPaymentAt, today });
  const overdueDays = getOverdueDays(
    nextPaymentAt ?? undefined,
    today
  );
  const defaultPaymentAmount =
    balance > 0
      ? formatDecimalInput(balance)
      : student.monthlyFee
        ? formatDecimalInput(student.monthlyFee)
        : "";

  const canAssignStudentManager = scopeFor(actor.permissions, "student.update") === "ALL";
  const [options, reminders, managers] = await Promise.all([
    getStudentCreateOptions(prisma, today),
    getStudentReminderHistory(prisma, actor, studentId),
    prisma.user.findMany({
      where: canAssignStudentManager
        ? {
            OR: [
              ...(student.managerId ? [{ id: student.managerId }] : []),
              {
                isActive: true,
                roles: {
                  some: {
                    role: { code: { in: [AppRole.OWNER, AppRole.ADMIN, AppRole.SALES] } },
                  },
                },
              },
            ],
          }
        : { id: student.managerId ?? actor.id },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true },
    }),
  ]);

  const programs = options.programs.map((program) => ({
    id: program.id,
    name: program.name,
    monthlyFee: formatDecimalInput(program.defaultMonthlyFee),
    lessonsPerMonth: program.defaultLessonsPerMonth?.toString() ?? "",
  }));
  if (student.programId && !programs.some((program) => program.id === student.programId)) {
    programs.push({
      id: student.programId,
      name: student.programName ?? "Cari proqram",
      monthlyFee: formatNonNegativeDecimalInput(student.monthlyFee),
      lessonsPerMonth: student.lessonsPerMonth?.toString() ?? "",
    });
  }

  const teachers = [...options.teachers];
  if (student.teacherId && !teachers.some((teacher) => teacher.id === student.teacherId)) {
    teachers.push({ id: student.teacherId, fullName: student.teacherName ?? "Cari müəllim" });
  }

  const campaigns = [...options.campaigns];
  if (student.campaignId && !campaigns.some((campaign) => campaign.id === student.campaignId)) {
    campaigns.push({ id: student.campaignId, name: student.campaignName ?? "Cari kampaniya" });
  }

  const discountTypes = [...options.discountTypes];
  if (
    student.discountType
    && !discountTypes.some((discountType) => discountType.value === student.discountType)
  ) {
    discountTypes.push({ value: student.discountType, label: student.discountType });
  }

  return {
    returnTo: `/students/${student.id}`,
    permissions: {
      canCreateStudent: actor.permissions.has("student.create"),
      canUpdateStudent: actor.permissions.has("student.update"),
      canAssignStudentManager,
      canConvertLead: actor.permissions.has("crm.lead.convert"),
      canRecordPayment: actor.permissions.has("billing.payment.create"),
      canChangeStatus: actor.permissions.has("student.status.change"),
      canDeleteStudent: actor.permissions.has("student.delete"),
      canManageReminders: actor.permissions.has("task.manage"),
    },
    createOptions: {
      leads: options.leads,
      programs,
      teachers,
      managers,
      campaigns,
      educationLevels: options.educationLevels,
      discountTypes,
      sourceOptions: buildCrmSourceOptions(options.sources),
      currentManagerName: actor.fullName,
      defaultRegisteredDate: formatDateInput(new Date()),
      defaultPaymentDate: formatDateInput(new Date()),
    },
    student: {
      id: student.id,
      code: student.code,
      name: student.name,
      phone: student.phone ?? "-",
      program: student.programName ?? "Proqram təyin edilməyib",
      teacher: student.teacherName ?? "Müəllim təyin edilməyib",
      group: student.slotLabel ?? "Slota təyin edilməyib",
      dueDate: student.nextDueDate ? formatShortDate(student.nextDueDate as Date) : "—",
      overdueDays,
      balance: formatAmount(balance),
      lifecycleStatusValue: student.lifecycleStatus as StudentLifecycleStatus,
      lifecycleStatus: lifecycleStatus.label,
      lifecycleTone: lifecycleStatus.tone,
      paymentStatus: paymentStatus.label,
      paymentTone: paymentStatus.tone,
      paidThisMonth: formatAmount(currentMonthPaid),
      lastContact: `Qeydiyyat: ${formatShortDate(student.registeredAt as Date)}`,
      clv: {
        totalPaid: formatAmount(totalPaid),
        paidMonths,
      },
      detail: {
        email: student.contactEmail ?? "",
        source: student.source ?? "",
        educationLevel: student.educationLevel ?? "",
        managerId: student.managerId ?? "",
        manager: student.managerName ?? "Təyin edilməyib",
        campaignId: student.campaignId ?? "",
        campaign: student.campaignName ?? "Təyin edilməyib",
        enrollmentId: student.enrollmentId ?? "",
        programId: student.programId ?? "",
        teacherId: student.teacherId ?? "",
        discountType: student.discountType ?? "",
        lessonsPerMonth: student.lessonsPerMonth?.toString() ?? "",
        firstLessonDate: student.firstLessonAt
          ? formatDateInput(new Date(student.firstLessonAt))
          : "",
        registeredDate: formatDateInput(new Date(student.registeredAt as Date)),
        registeredAt: formatShortDate(student.registeredAt as Date),
        notes: student.notes ?? "Qeyd yoxdur",
        billingPaused: student.billingPaused ? "Dayandırılıb" : "Aktivdir",
        reminderDefaultDate: getBakuDateInput(),
        reminders,
        paymentDefaultAmount: defaultPaymentAmount,
        paymentDefaultDate: formatDateInput(new Date()),
        monthlyFee: formatNonNegativeDecimalInput(student.monthlyFee),
        monthlyFeeLabel: student.monthlyFee === null || student.monthlyFee === undefined
          ? "Təyin edilməyib"
          : formatAmount(student.monthlyFee),
        invoices: asJsonArray<StudentInvoiceRecord>(student.invoices).slice(0, 6).map((invoice) => {
          const status = invoiceStatusMeta[invoice.status];
          return {
            id: invoice.id,
            period: formatMonthInput(invoice.periodMonth),
            dueDate: formatShortDate(invoice.dueDate),
            amount: formatAmount(invoice.amount),
            balance: formatAmount(invoice.balanceDue),
            status: status.label,
            tone: status.tone,
          };
        }),
        payments: asJsonArray<StudentPaymentRecord>(student.payments).map((payment) => ({
          id: payment.id,
          amount: formatAmount(payment.amount),
          paidAt: formatShortDate(payment.paidAt),
          paymentMonth: formatMonthInput(payment.paymentMonth),
          nextPaymentDate: payment.scheduleType === "ONE_TIME"
            ? "Tam ödənilib"
            : payment.nextPaymentAt
              ? formatShortDate(payment.nextPaymentAt)
              : "—",
          scheduleType: getStudentPaymentScheduleTypeLabel(payment.scheduleType),
          method: getStudentPaymentMethodLabel(payment.method),
          note: payment.note ?? "-",
          createdBy: payment.createdByName ?? "Sistem",
        })),
        monthlyPayments: asJsonArray<StudentMonthlyPaymentRecord>(student.monthlyPayments).map((payment) => ({
          month: formatMonthInput(payment.month),
          amount: formatAmount(payment.amount),
          paidAt: formatShortDate(payment.paidAt),
        })),
        timeline: asJsonArray<StudentTimelineRecord>(student.timeline).map((item) => ({
          id: item.id,
          label: lifecycleMeta[item.newStatus as StudentLifecycleStatus].label,
          reason: item.note ?? item.reason,
          date: formatShortDate(item.effectiveAt),
          changedBy: item.changedByName ?? "Sistem",
        })),
      },
    }
  };
}
