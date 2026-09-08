import {
  AppRole,
  EnrollmentStatus,
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
import { calculatePackageLessonUsage } from "@/modules/students/package-lesson-usage";
import {
  normalizeStudentPage,
  STUDENT_LIST_PAGE_SIZE,
} from "@/modules/students/student-pagination";
import type {
  ProgramJourneyMaterial,
  ProgramJourneyStep,
} from "@/modules/students/program-journey";
import {
  resolveStudentPaymentStatus,
} from "@/modules/students/student-debt-status";
import {
  buildStudentDueDebtValueSql,
  buildStudentFutureReceivableValueSql,
  buildStudentNextPaymentDateSql,
  buildStudentOldestDebtDueDateSql,
  buildStudentOpenBalanceValueSql,
} from "@/modules/students/student-billing-sql";
import {
  getBakuDateInput,
  getReminderDayRange,
  getStudentReminderKind,
  STUDENT_REMINDER_ENTITY_TYPE,
  studentReminderMeta,
  type StudentReminderKind,
} from "@/modules/students/student-reminders";
import { buildCrmSourceOptions } from "@/modules/crm/source-options";
import { programJourneyImageUrl } from "@/server/storage/erp-files";

type SummaryTone = "blue" | "coral" | "yellow" | "mint";
type StudentTone = "success" | "warning" | "danger" | "neutral" | "info";
type StudentPaymentFilter = "all" | "paid" | "open" | "overdue" | "archive";
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

type StudentPaymentAttentionItem = {
  id: string;
  code: string;
  name: string;
  phone: string;
  program: string;
  balance: string;
  dueDate: string;
  overdueDays: number;
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
    unscheduledCount: number;
    dueTodayCount: number;
    dueTodayStudents: StudentPaymentAttentionItem[];
    overdueStudents: StudentPaymentAttentionItem[];
    activeWithoutTeacherCount: number;
    expectedAmount: string;
    collectedAmount: string;
    collectionRate: number;
    programs: Array<{ name: string; count: number; percentage: number; capacity: number | null; utilization: number | null }>;
    teachers: Array<{ name: string; count: number; percentage: number; capacity: number | null; utilization: number | null }>;
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
  managedPrograms: StudentListData["createOptions"]["programs"];
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
      code: string;
      monthlyFee: string;
      lessonsPerMonth: string;
      description: string;
      lessonTopics: ProgramJourneyStep[];
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
    filter: { key: "status" | "payment"; value: string };
  }>;
  clv: {
    averageClv: string;
    arpu: string;
    averageLifetime: string;
    studentCount: number;
    comparisonLabel: string;
    hasEnoughData: boolean;
  };
  listMetrics: {
    totalPaid: string;
    expectedPayment: string;
    futurePayment: string;
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
    dueDebt: string;
    futureReceivable: string;
    hasDueDebt: boolean;
    hasFutureReceivable: boolean;
    lifecycleStatusValue: StudentLifecycleStatus;
    freezeReserved: boolean;
    lifecycleStatus: string;
    lifecycleTone: StudentTone;
    paymentStatus: string;
    paymentTone: StudentTone;
    paidThisMonth: string;
    lastContact: string;
    clv: {
      totalPaid: string;
      paidMonths: number;
      creditBalance: string;
      hasCredit: boolean;
    };
    detail: {
      manager: string;
      registeredAt: string;
      notes: string;
      billingPaused: string;
      paymentDefaultAmount: string;
      paymentDefaultDate: string;
      paymentDefaultMonth: string;
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
      slots: Array<{
        id: string;
        name: string;
        schedule: string;
        room: string;
        teacher: string;
        period: string;
        isActive: boolean;
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
const STUDENT_CLV_MIN_SAMPLE_SIZE = 5;
const clvLifetimeFormatter = new Intl.NumberFormat("az-AZ", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

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
  averageClv: number;
  arpu: number;
  averageLifetime: number;
  studentCount: number;
  comparisonPercent: number | null;
  hasEnoughData: boolean;
};

type StudentPaymentSummary = {
  totalPaid: number;
  expectedPayment: number;
  futurePayment: number;
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
  unscheduledCount: unknown;
  dueTodayCount: unknown;
  dueTodayStudents: unknown;
  overdueStudents: unknown;
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
  { value: "open", label: "Mövcud borclular" },
  { value: "overdue", label: "Gecikmiş ödəniş" },
  { value: "archive", label: "Arxiv borcu" },
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
  const activeTab = normalizeStudentTab(input.tab);
  let page = activeTab === "list" ? normalizeStudentPage(input.page) : 1;
  const today = startOfToday();
  const debtListMode = paymentFilter === "open"
    || paymentFilter === "overdue"
    || paymentFilter === "archive";
  const hasExplicitDateRange = Boolean(input.from?.trim() || input.to?.trim());
  const statusListMode = Boolean(statusFilter) || churnOnly;
  const defaultDateFrom = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const dateFromFilter = normalizeDateFilter(
    debtListMode
      ? undefined
      : hasExplicitDateRange
        ? input.from
        : statusListMode
          ? undefined
          : defaultDateFrom.toISOString().slice(0, 10)
  );
  const dateToFilter = normalizeDateFilter(
    debtListMode
      ? undefined
      : hasExplicitDateRange
        ? input.to
        : statusListMode
          ? undefined
          : today.toISOString().slice(0, 10)
  );
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
  const visibleStatuses = [
    StudentLifecycleStatus.ACTIVE,
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
    managedPrograms: programs.map((program) => ({
        id: program.id,
        name: program.name,
        code: program.code ?? "",
        monthlyFee: formatDecimalInput(program.defaultMonthlyFee),
        lessonsPerMonth: program.defaultLessonsPerMonth?.toString() ?? "",
        description: program.description ?? "",
        lessonTopics: program.lessonTopics,
        isActive: program.isActive,
      })),
    createOptions: {
      leads: convertibleLeads,
      programs: programs.filter((program) => program.isActive).map((program) => ({
        id: program.id,
        name: program.name,
        code: program.code ?? "",
        monthlyFee: formatDecimalInput(program.defaultMonthlyFee),
        lessonsPerMonth: program.defaultLessonsPerMonth?.toString() ?? "",
        description: program.description ?? "",
        lessonTopics: program.lessonTopics,
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
    statusSummary: [
      ...visibleStatuses.map((status) => {
      const outstandingBalance = formatAmount(summaryBalances.get(status) ?? 0);
        const isOutstandingStatus = status === StudentLifecycleStatus.SLOT_WAITING;

      return {
        label: summaryMeta[status].label,
        value: formatCount(summaryCounts.get(status) ?? 0),
        delta:
          status === StudentLifecycleStatus.SLOT_WAITING
              ? `Qalan ödəniş: ${outstandingBalance}`
              : summaryMeta[status].delta,
        amount: isOutstandingStatus ? outstandingBalance : undefined,
        tone: summaryMeta[status].tone,
        filter: { key: "status" as const, value: status },
      };
      }),
      {
        label: "Borclu tələbələr",
        value: formatCount(options.debtCount),
        delta: options.unscheduledDebtCount > 0
          ? `${formatCount(options.overdueDebtCount)} gecikmiş · ${formatCount(options.unscheduledDebtCount)} tarixsiz`
          : `${formatCount(options.overdueDebtCount)} gecikmiş`,
        amount: formatAmount(options.debtBalance),
        tone: "coral" as const,
        filter: { key: "payment" as const, value: "open" },
      },
      {
        label: "Arxiv borcu",
        value: formatCount(options.archiveDebtCount),
        delta: `Qalan borc: ${formatAmount(options.archiveDebtBalance)}`,
        amount: formatAmount(options.archiveDebtBalance),
        tone: "yellow" as const,
        filter: { key: "payment" as const, value: "archive" },
      },
    ],
    clv: {
      averageClv: formatAmount(clv.averageClv),
      arpu: formatAmount(clv.arpu),
      averageLifetime: formatClvLifetime(clv.averageLifetime),
      studentCount: clv.studentCount,
      comparisonLabel: formatClvComparison(clv.comparisonPercent),
      hasEnoughData: clv.hasEnoughData,
    },
    listMetrics: {
      totalPaid: formatAmount(paymentSummary.totalPaid),
      expectedPayment: formatAmount(paymentSummary.expectedPayment),
      futurePayment: formatAmount(paymentSummary.futurePayment),
      overduePayment: formatAmount(paymentSummary.overduePayment),
    },
    students: rows.map((student) => {
      const dueDebt = toNumber(student.dueDebt);
      const futureReceivable = toNumber(student.futureReceivable);
      const totalPaid = toNumber(student.totalPaid);
      const currentMonthPaid = toNumber(student.currentMonthPaid);
      const paidMonths = toNumber(student.paidMonths);
      const creditBalance = toNumber(student.creditBalance);
      const nextPaymentAt = student.nextDueDate ? new Date(student.nextDueDate) : null;
      const lifecycleStatus = lifecycleMeta[student.lifecycleStatus];
      const paymentStatus = student.lifecycleStatus === StudentLifecycleStatus.COMPLETED
        ? { code: "PAID" as const, label: "Öhdəlik yoxdur", tone: "success" as const }
        : resolveStudentPaymentStatus({
            balance: dueDebt > 0 ? dueDebt : futureReceivable,
            nextPaymentAt,
            today,
            hasBillingRecord: student.invoices.length > 0,
          });
      const overdueDays = getOverdueDays(
        nextPaymentAt ?? undefined,
        today
      );
      const defaultPaymentAmount =
        dueDebt > 0
          ? formatDecimalInput(dueDebt)
          : futureReceivable > 0
            ? formatDecimalInput(futureReceivable)
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
        balance: formatAmount(dueDebt),
        dueDebt: formatAmount(dueDebt),
        futureReceivable: formatAmount(futureReceivable),
        hasDueDebt: dueDebt > 0,
        hasFutureReceivable: futureReceivable > 0,
        lifecycleStatusValue: student.lifecycleStatus,
        freezeReserved: student.freezeReserved,
        lifecycleStatus: student.freezeReserved ? "Dondurulub — yer rezervdir" : lifecycleStatus.label,
        lifecycleTone: lifecycleStatus.tone,
        paymentStatus: paymentStatus.label,
        paymentTone: paymentStatus.tone,
        paidThisMonth: formatAmount(currentMonthPaid),
        lastContact: `Qeydiyyat: ${formatShortDate(student.registeredAt)}`,
        clv: {
          totalPaid: formatAmount(totalPaid),
          paidMonths,
          creditBalance: formatAmount(creditBalance),
          hasCredit: creditBalance > 0,
        },
        detail: {
          manager: student.managerName ?? "Təyin edilməyib",
          registeredAt: formatShortDate(student.registeredAt),
          notes: student.notes ?? "Qeyd yoxdur",
          billingPaused: student.billingPaused ? "Dayandırılıb" : "Aktivdir",
          paymentDefaultAmount: defaultPaymentAmount,
          paymentDefaultDate: formatDateInput(new Date()),
          paymentDefaultMonth: formatDateInput(
            student.nextDueDate ? new Date(student.nextDueDate) : new Date(),
          ).slice(0, 7),
          monthlyFee: student.monthlyFee ? formatDecimalInput(student.monthlyFee) : "",
          invoices: student.invoices.map((invoice) => {
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
          slots: student.slots.map(mapStudentSlot),
          payments: student.payments.map((payment) => ({
            id: payment.id,
            amount: formatAmount(payment.amount),
            paidAt: formatShortDate(payment.paidAt),
            paymentMonth: formatMonthInput(payment.paymentMonth),
            nextPaymentDate: payment.scheduleType === "ONE_TIME"
              ? "Tam ödənilib"
              : student.nextDueDate
                ? formatShortDate(student.nextDueDate)
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
  freezeReserved: boolean;
  name: string;
  phone: string | null;
  managerName: string | null;
  monthlyFee: unknown;
  programName: string | null;
  teacherName: string | null;
  slotLabel: string | null;
  dueDebt: unknown;
  futureReceivable: unknown;
  currentMonthPaid: unknown;
  nextDueDate: Date | string | null;
  totalPaid: unknown;
  paidMonths: unknown;
  creditBalance: unknown;
  totalCount: number;
  invoices: StudentInvoiceRecord[];
  slots: StudentSlotRecord[];
  payments: StudentPaymentRecord[];
  monthlyPayments: StudentMonthlyPaymentRecord[];
  timeline: StudentTimelineRecord[];
};

type StudentListRawRow = Omit<
  StudentListQueryRow,
  "lifecycleStatus" | "totalCount" | "invoices" | "slots" | "payments" | "monthlyPayments" | "timeline"
> & {
  lifecycleStatus: string;
  totalCount: unknown;
  invoices: unknown;
  slots: unknown;
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
  originalFirstLessonAt: Date | string | null;
  billingAnchorDate: Date | string | null;
  mobileAccountId: string | null;
  mobileLoginEmail: string | null;
  mobileAccountStatus: "INVITED" | "ACTIVE" | "DISABLED" | null;
  mobileInvitedAt: Date | string | null;
  mobileLastInviteSentAt: Date | string | null;
  mobileActivatedAt: Date | string | null;
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

type StudentSlotRecord = {
  id: string;
  displayName: string | null;
  weekday: string;
  shift: string;
  startTime: string;
  endTime: string;
  room: string | null;
  teacherName: string | null;
  validFrom: Date | string;
  validTo: Date | string | null;
};

type StudentPackageUsageRaw = {
  enrollmentId: string;
  totalLessons: number | null;
  usedLessons: number;
  periodStart: Date | string;
  periodEnd: Date | string;
  periodSource: "BILLING_CYCLE" | "CALENDAR_MONTH";
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
        s.freeze_reserved as "freezeReserved",
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
      inv.due_debt as "dueDebt",
      inv.future_receivable as "futureReceivable",
      coalesce((select sum(p.amount) from erp.payments p where p.student_id = ps.id and date_trunc('month', p.paid_at) = date_trunc('month', ${input.today}::date)), 0) as "currentMonthPaid",
      inv.next_due_date as "nextDueDate",
      clv.total_paid as "totalPaid",
      clv.paid_months as "paidMonths",
      clv.credit_balance as "creditBalance",
      inv.invoices,
      ${buildStudentSlotsJsonSql(Prisma.sql`ps.id`)} as slots,
      pay.payments,
      hist.timeline,
      ma.id::text as "mobileAccountId",
      ma.login_email as "mobileLoginEmail",
      ma.status::text as "mobileAccountStatus",
      ma.invited_at as "mobileInvitedAt",
      ma.last_invite_sent_at as "mobileLastInviteSentAt",
      ma.activated_at as "mobileActivatedAt"
    from paged_students ps
    left join lateral (
      select
        sum(e.monthly_fee) as monthly_fee,
        string_agg(distinct p.name, ', ' order by p.name) as program_name,
        string_agg(distinct t.full_name, ', ' order by t.full_name) filter (where t.full_name is not null) as teacher_name
      from erp.enrollments e
      join erp.programs p on p.id = e.program_id
      left join erp.teachers t on t.id = e.teacher_id
      where e.student_id = ps.id
        and e.status in (
          'ACTIVE'::"erp"."EnrollmentStatus",
          'PAUSED'::"erp"."EnrollmentStatus"
        )
    ) ae on true
    left join lateral (
      select
        ${buildStudentDueDebtValueSql({
          studentId: Prisma.sql`ps.id`,
          asOfDate: input.today,
        })} as due_debt,
        ${buildStudentFutureReceivableValueSql({
          studentId: Prisma.sql`ps.id`,
          asOfDate: input.today,
        })} as future_receivable,
        ${buildStudentEffectiveDueDateSql(Prisma.sql`ps.id`)} as next_due_date,
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
          ) ordered
        ), '[]'::jsonb) as invoices
    ) inv on true
    left join lateral (
      select
        coalesce(sum(p.amount), 0) as total_paid,
        count(distinct p.payment_month) filter (
          where p.schedule_type = 'MONTHLY'::"erp"."PaymentScheduleType"
        )::int as paid_months,
        coalesce(sum(greatest(
          p.amount - coalesce((
            select sum(pa.amount_allocated)
            from erp.payment_allocations pa
            where pa.payment_id = p.id
          ), 0),
          0
        )), 0) as credit_balance
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
    left join erp.student_mobile_accounts ma on ma.student_id = ps.id
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
    slots: asJsonArray<StudentSlotRecord>(row.slots),
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
  overdueDebtCount: number;
  unscheduledDebtCount: number;
  archiveDebtCount: number;
  archiveDebtBalance: number;
  programs: Array<{
    id: string;
    name: string;
    code: string | null;
    defaultMonthlyFee: unknown;
    defaultLessonsPerMonth: number | null;
    description: string | null;
    lessonTopics: ProgramJourneyStep[];
    isActive: boolean;
  }>;
  teachers: Array<{ id: string; fullName: string }>;
  campaigns: Array<{ id: string; name: string }>;
  educationLevels: Array<{ value: string; label: string }>;
  discountTypes: Array<{ value: string; label: string }>;
  sources: string[];
  leads: StudentListData["createOptions"]["leads"];
};

type ProgramJourneyMaterialRow = Omit<ProgramJourneyMaterial, "imageUrl">;
type ProgramJourneyStepRow = Omit<ProgramJourneyStep, "materials"> & {
  materials: ProgramJourneyMaterialRow[];
};

type StudentCreateOptionProgramRow = Omit<
  StudentCreateOptionRows["programs"][number],
  "lessonTopics"
> & {
  lessonTopics: ProgramJourneyStepRow[];
};

type StudentCreateOptionsRawRow = {
  summaryCounts: unknown;
  summaryBalances: unknown;
  debtCount: unknown;
  debtBalance: unknown;
  overdueDebtCount: unknown;
  unscheduledDebtCount: unknown;
  archiveDebtCount: unknown;
  archiveDebtBalance: unknown;
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
  ["student-list-data-v17"],
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
    getStudentClvSummary(prisma, filterInput.today),
    getStudentPaymentSummary(prisma, filterInput),
    getStudentOperationsOverview(prisma, filterInput.today),
  ]);

  return { rows, options, clv, paymentSummary, operations };
}

async function getStudentClvSummary(
  prisma: ReturnType<typeof getPrisma>,
  today: Date,
): Promise<StudentClvSummary> {
  const rows = await prisma.$queryRaw<Array<{
    periodKey: string;
    averageClv: unknown;
    arpu: unknown;
    averageLifetime: unknown;
    studentCount: unknown;
  }>>(Prisma.sql`
    with report_periods as (
      select
        'current'::text as period_key,
        (date_trunc('month', ${today}::date) - interval '11 months')::date as period_start,
        (date_trunc('month', ${today}::date) + interval '1 month')::date as period_end
      union all
      select
        'previous'::text,
        (date_trunc('month', ${today}::date) - interval '23 months')::date,
        (date_trunc('month', ${today}::date) - interval '11 months')::date
    ),
    eligible_students as (
      select
        period.period_key,
        student.id as student_id,
        case
          when student.lifecycle_status = 'STOPPED'::"erp"."StudentLifecycleStatus"
            then student.stopped_at
          when student.lifecycle_status = 'COMPLETED'::"erp"."StudentLifecycleStatus"
            then student.completed_at
        end as closed_at,
        education.education_started_at
      from report_periods period
      join erp.students student
        on student.lifecycle_status in (
          'STOPPED'::"erp"."StudentLifecycleStatus",
          'COMPLETED'::"erp"."StudentLifecycleStatus"
        )
      cross join lateral (
        select min(coalesce(enrollment.first_lesson_at, enrollment.start_date)) as education_started_at
        from erp.enrollments enrollment
        where enrollment.student_id = student.id
      ) education
      where case
          when student.lifecycle_status = 'STOPPED'::"erp"."StudentLifecycleStatus"
            then student.stopped_at
          when student.lifecycle_status = 'COMPLETED'::"erp"."StudentLifecycleStatus"
            then student.completed_at
        end >= period.period_start
        and case
          when student.lifecycle_status = 'STOPPED'::"erp"."StudentLifecycleStatus"
            then student.stopped_at
          when student.lifecycle_status = 'COMPLETED'::"erp"."StudentLifecycleStatus"
            then student.completed_at
        end < period.period_end
        and education.education_started_at is not null
        and exists (
          select 1
          from erp.payments payment
          where payment.student_id = student.id
        )
        and not exists (
          select 1
          from erp.enrollments enrollment
          where enrollment.student_id = student.id
            and enrollment.status in (
              'ACTIVE'::"erp"."EnrollmentStatus",
              'PAUSED'::"erp"."EnrollmentStatus"
            )
        )
    ),
    student_metrics as (
      select
        eligible.period_key,
        eligible.student_id,
        revenue.successful_revenue - refunds.refunded_amount as net_revenue,
        education.active_months
      from eligible_students eligible
      cross join lateral (
        select coalesce(sum(payment.amount), 0) as successful_revenue
        from erp.payments payment
        where payment.student_id = eligible.student_id
      ) revenue
      cross join lateral (
        select coalesce(sum(refund.amount), 0) as refunded_amount
        from erp.refund_adjustments refund
        where refund.student_id = eligible.student_id
          and refund.status = 'PAID'::"erp"."ApprovalStatus"
      ) refunds
      cross join lateral (
        select count(distinct invoice.period_month)::int as active_months
        from erp.invoices invoice
        where invoice.student_id = eligible.student_id
          and invoice.status <> 'VOID'::"erp"."InvoiceStatus"
          and invoice.period_month >= date_trunc('month', eligible.education_started_at)::date
          and invoice.period_month <= date_trunc('month', eligible.closed_at)::date
          and not exists (
            select 1
            from (
              select
                history.new_status,
                history.freeze_reserved,
                history.effective_at,
                lead(history.effective_at, 1, eligible.closed_at + 1) over (
                  order by history.effective_at, history.created_at, history.id
                ) as next_effective_at
              from erp.student_status_history history
              where history.student_id = eligible.student_id
                and history.effective_at <= eligible.closed_at
            ) status_interval
            where status_interval.new_status = 'FROZEN'::"erp"."StudentLifecycleStatus"
              and not status_interval.freeze_reserved
              and status_interval.effective_at <= invoice.period_month
              and status_interval.next_effective_at >= (invoice.period_month + interval '1 month')::date
          )
      ) education
    ),
    period_metrics as (
      select
        period.period_key,
        coalesce(sum(metrics.net_revenue), 0) as net_revenue,
        coalesce(sum(metrics.active_months), 0)::int as active_months,
        count(metrics.student_id)::int as student_count
      from report_periods period
      left join student_metrics metrics on metrics.period_key = period.period_key
      group by period.period_key
    )
    select
      period_key as "periodKey",
      coalesce(net_revenue / nullif(student_count, 0), 0) as "averageClv",
      coalesce(net_revenue / nullif(active_months, 0), 0) as arpu,
      coalesce(active_months::numeric / nullif(student_count, 0), 0) as "averageLifetime",
      student_count as "studentCount"
    from period_metrics
  `);

  const current = rows.find((row) => row.periodKey === "current");
  const previous = rows.find((row) => row.periodKey === "previous");
  const studentCount = toNumber(current?.studentCount);
  const previousStudentCount = toNumber(previous?.studentCount);
  const averageClv = toNumber(current?.averageClv);
  const previousAverageClv = toNumber(previous?.averageClv);
  const hasEnoughData = studentCount >= STUDENT_CLV_MIN_SAMPLE_SIZE;
  const hasComparablePreviousPeriod = previousStudentCount >= STUDENT_CLV_MIN_SAMPLE_SIZE
    && previousAverageClv > 0;

  return {
    averageClv,
    arpu: toNumber(current?.arpu),
    averageLifetime: toNumber(current?.averageLifetime),
    studentCount,
    comparisonPercent: hasEnoughData && hasComparablePreviousPeriod
      ? Math.round(((averageClv - previousAverageClv) / previousAverageClv) * 100)
      : null,
    hasEnoughData,
  };
}

async function getStudentPaymentSummary(
  prisma: ReturnType<typeof getPrisma>,
  input: Parameters<typeof buildStudentWhereSql>[0]
): Promise<StudentPaymentSummary> {
  const whereSql = buildStudentWhereSql(input);
  const [summary] = await prisma.$queryRaw<
    Array<{ totalPaid: unknown; expectedPayment: unknown; futurePayment: unknown; overduePayment: unknown }>
  >(Prisma.sql`
    select
      coalesce(sum(payments.total_paid), 0) as "totalPaid",
      coalesce(sum(balance.due_debt), 0) as "expectedPayment",
      coalesce(sum(balance.future_receivable), 0) as "futurePayment",
      coalesce(sum(balance.overdue_debt), 0) as "overduePayment"
    from erp.students s
    join erp.contacts c on c.id = s.contact_id
    left join lateral (
      select coalesce(sum(payment.amount), 0) as total_paid
      from erp.payments payment
      where payment.student_id = s.id
    ) payments on true
    left join lateral (
      select
        ${buildStudentDueDebtValueSql({
          studentId: Prisma.sql`s.id`,
          asOfDate: input.today,
        })} as due_debt,
        ${buildStudentFutureReceivableValueSql({
          studentId: Prisma.sql`s.id`,
          asOfDate: input.today,
        })} as future_receivable,
        coalesce((
          select sum(invoice.balance_due)
          from erp.invoices invoice
          where invoice.student_id = s.id
            and invoice.status <> 'VOID'::"erp"."InvoiceStatus"
            and invoice.balance_due > 0
            and invoice.due_date < ${input.today}::date
        ), 0) as overdue_debt
    ) balance on true
    ${whereSql}
  `);

  return {
    totalPaid: toNumber(summary?.totalPaid),
    expectedPayment: toNumber(summary?.expectedPayment),
    futurePayment: toNumber(summary?.futurePayment),
    overduePayment: toNumber(summary?.overduePayment),
  };
}

async function getStudentOperationsOverview(
  prisma: ReturnType<typeof getPrisma>,
  today: Date,
): Promise<StudentListData["operations"]> {
  const [row] = await prisma.$queryRaw<StudentOperationsRawRow[]>(Prisma.sql`
    with current_enrollment as (
      select
        e.student_id,
        sum(e.monthly_fee) as monthly_fee,
        min(e.program_id::text)::uuid as program_id,
        case when count(*) filter (where e.teacher_id is null) > 0 then null else min(e.teacher_id::text)::uuid end as teacher_id,
        string_agg(distinct p.name, ', ' order by p.name) as program_name,
        string_agg(distinct t.full_name, ', ' order by t.full_name) filter (where t.full_name is not null) as teacher_name
      from erp.enrollments e
      join erp.programs p on p.id = e.program_id
      left join erp.teachers t on t.id = e.teacher_id
      where e.status in (
        'ACTIVE'::"erp"."EnrollmentStatus",
        'PAUSED'::"erp"."EnrollmentStatus"
      )
      group by e.student_id
    ),
    student_month as (
      select
        s.id,
        s.code,
        c.full_name as student_name,
        coalesce(c.phone_display, '') as phone,
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
            and (i.due_date is null or i.due_date <= ${today}::date)
        ), 0) as invoice_balance,
        ${buildStudentEffectiveDueDateSql()} as next_due_date
      from erp.students s
      join erp.contacts c on c.id = s.contact_id
      left join current_enrollment ce on ce.student_id = s.id
      where s.is_test_data = false
    ),
    student_finance as (
      select
        sm.*,
        greatest(
          sm.invoice_balance,
          0
        ) as balance_due
      from student_month sm
    )
    select
      count(*) filter (where lifecycle_status = 'ACTIVE'::"erp"."StudentLifecycleStatus")::int as "activeCount",
      count(*) filter (where lifecycle_status = 'SLOT_WAITING'::"erp"."StudentLifecycleStatus")::int as "slotWaitingCount",
      count(*) filter (where lifecycle_status in (
        'FROZEN'::"erp"."StudentLifecycleStatus",
        'STOPPED'::"erp"."StudentLifecycleStatus"
      ))::int as "frozenOrStoppedCount",
      count(*) filter (
        where lifecycle_status = 'ACTIVE'::"erp"."StudentLifecycleStatus"
          and balance_due > 0
          and (next_due_date is null or next_due_date <= ${today}::date)
      )::int as "actionableCount",
      coalesce(sum(balance_due) filter (
        where lifecycle_status = 'ACTIVE'::"erp"."StudentLifecycleStatus"
          and balance_due > 0
          and (next_due_date is null or next_due_date <= ${today}::date)
      ), 0) as "actionableAmount",
      count(*) filter (
        where lifecycle_status = 'ACTIVE'::"erp"."StudentLifecycleStatus"
          and balance_due > 0
          and next_due_date < ${today}::date
      )::int as "overdueCount",
      coalesce(sum(balance_due) filter (
        where lifecycle_status = 'ACTIVE'::"erp"."StudentLifecycleStatus"
          and balance_due > 0
          and next_due_date < ${today}::date
      ), 0) as "overdueAmount",
      count(*) filter (
        where lifecycle_status = 'ACTIVE'::"erp"."StudentLifecycleStatus"
          and balance_due > 0
          and next_due_date is null
      )::int as "unscheduledCount",
      count(*) filter (
        where lifecycle_status = 'ACTIVE'::"erp"."StudentLifecycleStatus"
          and balance_due > 0
          and next_due_date = ${today}::date
      )::int as "dueTodayCount",
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', due_rows.id::text,
            'code', due_rows.code,
            'name', due_rows.student_name,
            'phone', due_rows.phone,
            'program', due_rows.program_name,
            'balance', due_rows.balance_due,
            'dueDate', due_rows.next_due_date,
            'overdueDays', 0
          )
          order by due_rows.student_name asc
        )
        from (
          select id, code, student_name, phone, program_name, balance_due, next_due_date
          from student_finance
          where lifecycle_status = 'ACTIVE'::"erp"."StudentLifecycleStatus"
            and balance_due > 0
            and next_due_date = ${today}::date
          order by student_name asc
          limit 20
        ) due_rows
      ), '[]'::jsonb) as "dueTodayStudents",
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', overdue_rows.id::text,
            'code', overdue_rows.code,
            'name', overdue_rows.student_name,
            'phone', overdue_rows.phone,
            'program', overdue_rows.program_name,
            'balance', overdue_rows.balance_due,
            'dueDate', overdue_rows.next_due_date,
            'overdueDays', (${today}::date - overdue_rows.next_due_date)::int
          )
          order by overdue_rows.next_due_date asc, overdue_rows.student_name asc
        )
        from (
          select id, code, student_name, phone, program_name, balance_due, next_due_date
          from student_finance
          where lifecycle_status = 'ACTIVE'::"erp"."StudentLifecycleStatus"
            and balance_due > 0
            and next_due_date < ${today}::date
          order by next_due_date asc, student_name asc
          limit 20
        ) overdue_rows
      ), '[]'::jsonb) as "overdueStudents",
      count(*) filter (
        where lifecycle_status = 'ACTIVE'::"erp"."StudentLifecycleStatus"
          and teacher_id is null
      )::int as "activeWithoutTeacherCount",
      coalesce(sum(monthly_fee) filter (
        where lifecycle_status = 'ACTIVE'::"erp"."StudentLifecycleStatus"
      ), 0) as "expectedAmount",
      coalesce((
        select sum(p.amount)
        from erp.payments p
        where p.paid_at >= date_trunc('month', ${today}::date)
          and p.paid_at < date_trunc('month', ${today}::date) + interval '1 month'
      ), 0) as "collectedAmount",
      coalesce((
        select jsonb_agg(jsonb_build_object('name', grouped.name, 'count', grouped.count) order by grouped.count desc, grouped.name asc)
        from (
          select p.name, count(distinct e.student_id)::int as count
          from erp.enrollments e
          join erp.programs p on p.id = e.program_id
          join erp.students s on s.id = e.student_id
          where e.status = 'ACTIVE'::"erp"."EnrollmentStatus"
            and s.lifecycle_status = 'ACTIVE'::"erp"."StudentLifecycleStatus"
          group by p.id, p.name
        ) grouped
      ), '[]'::jsonb) as programs,
      coalesce((
        select jsonb_agg(jsonb_build_object('name', grouped.name, 'count', grouped.count, 'capacity', grouped.capacity) order by grouped.utilization desc nulls last, grouped.count desc, grouped.name asc)
        from (
          select
            t.full_name as name,
            (count(distinct e.student_id) filter (where s.id is not null))::int as count,
            t.capacity,
            case when t.capacity is not null and t.capacity > 0
              then count(distinct e.student_id) filter (where s.id is not null)::numeric / t.capacity
            end as utilization
          from erp.teachers t
          left join erp.enrollments e on e.teacher_id = t.id and e.status = 'ACTIVE'::"erp"."EnrollmentStatus"
          left join erp.students s on s.id = e.student_id and s.lifecycle_status = 'ACTIVE'::"erp"."StudentLifecycleStatus"
          where t.is_active = true
          group by t.id, t.full_name, t.capacity
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
    unscheduledCount: toNumber(row?.unscheduledCount),
    dueTodayCount: toNumber(row?.dueTodayCount),
    dueTodayStudents: toStudentPaymentAttentionItems(row?.dueTodayStudents),
    overdueStudents: toStudentPaymentAttentionItems(row?.overdueStudents),
    activeWithoutTeacherCount: toNumber(row?.activeWithoutTeacherCount),
    expectedAmount: formatAmount(expectedAmount),
    collectedAmount: formatAmount(collectedAmount),
    collectionRate,
    programs: toOperationsDistribution(row?.programs),
    teachers: toOperationsDistribution(row?.teachers),
  };
}

function toStudentPaymentAttentionItems(value: unknown): StudentPaymentAttentionItem[] {
  return asJsonArray<{
    id: string;
    code: string;
    name: string;
    phone: string | null;
    program: string | null;
    balance: unknown;
    dueDate: Date | string;
    overdueDays: unknown;
  }>(value).map((item) => ({
    id: item.id,
    code: item.code,
    name: item.name,
    phone: item.phone?.trim() || "Telefon qeyd edilməyib",
    program: item.program?.trim() || "Proqram təyin edilməyib",
    balance: formatAmount(item.balance),
    dueDate: formatShortDate(item.dueDate),
    overdueDays: toNumber(item.overdueDays),
  }));
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
          where s.is_test_data = false
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
          where s.is_test_data = false
          group by s.lifecycle_status
        ) summary
      ), '{}'::jsonb) as "summaryBalances",
      coalesce((
        select count(*)::int
        from erp.students s
        where s.is_test_data = false
          and s.lifecycle_status = 'ACTIVE'::"erp"."StudentLifecycleStatus"
          and ${buildStudentDebtDueSql(today)}
      ), 0) as "debtCount",
      coalesce((
        select sum(${buildStudentDueDebtValueSql({
          studentId: Prisma.sql`s.id`,
          asOfDate: today,
        })})
        from erp.students s
        where s.is_test_data = false
          and s.lifecycle_status = 'ACTIVE'::"erp"."StudentLifecycleStatus"
          and ${buildStudentDebtDueSql(today)}
      ), 0) as "debtBalance",
      coalesce((
        select count(*)::int
        from erp.students s
        where s.is_test_data = false
          and s.lifecycle_status = 'ACTIVE'::"erp"."StudentLifecycleStatus"
          and ${buildStudentDebtDueSql(today, true)}
      ), 0) as "overdueDebtCount",
      coalesce((
        select count(*)::int
        from erp.students s
        where s.is_test_data = false
          and s.lifecycle_status = 'ACTIVE'::"erp"."StudentLifecycleStatus"
          and ${buildStudentOutstandingBalanceSql()}
          and ${buildStudentEffectiveDueDateSql()} is null
      ), 0) as "unscheduledDebtCount",
      coalesce((
        select count(*)::int
        from erp.students s
        where s.is_test_data = false
          and s.lifecycle_status in (
          'FROZEN'::"erp"."StudentLifecycleStatus",
          'STOPPED'::"erp"."StudentLifecycleStatus"
        )
          and ${buildStudentOutstandingBalanceSql()}
      ), 0) as "archiveDebtCount",
      coalesce((
        select sum(${buildStudentOutstandingBalanceValueSql({
          studentId: Prisma.sql`s.id`,
        })})
        from erp.students s
        where s.is_test_data = false
          and s.lifecycle_status in (
          'FROZEN'::"erp"."StudentLifecycleStatus",
          'STOPPED'::"erp"."StudentLifecycleStatus"
        )
          and ${buildStudentOutstandingBalanceSql()}
      ), 0) as "archiveDebtBalance",
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', p.id::text,
            'name', p.name,
            'code', p.code,
            'defaultMonthlyFee', p.default_monthly_fee,
            'defaultLessonsPerMonth', p.default_lessons_per_month
            ,'description', p.description
            ,'lessonTopics', coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'id', topic.id::text,
                  'sequence', topic.sequence,
                  'title', topic.title,
                  'materials', coalesce((
                    select jsonb_agg(
                      jsonb_build_object(
                        'id', material.id::text,
                        'track', material.track::text,
                        'subject', material.subject,
                        'objective', material.objective,
                        'homework', material.homework,
                        'imageObjectPath', material.image_object_path
                      )
                      order by case material.track::text
                        when 'H' then 1
                        when 'HB' then 2
                        when 'B' then 3
                        else 4
                      end
                    )
                    from erp.program_lesson_materials material
                    where material.topic_id = topic.id
                  ), '[]'::jsonb)
                )
                order by topic.sequence asc
              )
              from erp.program_lesson_topics topic
              where topic.program_id = p.id
            ), '[]'::jsonb)
            ,'isActive', p.is_active
          )
          order by p.name asc
        )
        from erp.programs p
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
    overdueDebtCount: toNumber(row?.overdueDebtCount),
    unscheduledDebtCount: toNumber(row?.unscheduledDebtCount),
    archiveDebtCount: toNumber(row?.archiveDebtCount),
    archiveDebtBalance: toNumber(row?.archiveDebtBalance),
    programs: asJsonArray<StudentCreateOptionProgramRow>(
      row?.programs
    ).map((program) => ({
      ...program,
      lessonTopics: program.lessonTopics.map((topic) => ({
        ...topic,
        materials: topic.materials.map((material) => ({
          ...material,
          imageUrl: programJourneyImageUrl(material.imageObjectPath),
        })),
      })),
    })),
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

function buildStudentOutstandingBalanceValueSql({
  studentId,
}: {
  studentId: Prisma.Sql;
}) {
  return buildStudentOpenBalanceValueSql({ studentId });
}

function buildStudentOutstandingBalanceSql() {
  return Prisma.sql`${buildStudentOutstandingBalanceValueSql({
    studentId: Prisma.sql`s.id`,
  })} > 0`;
}

function buildStudentEffectiveDueDateSql(studentId: Prisma.Sql = Prisma.sql`s.id`) {
  return buildStudentNextPaymentDateSql(studentId);
}

function buildStudentDebtDueSql(today: Date, overdueOnly = false) {
  const dueDebtSql = buildStudentDueDebtValueSql({
    studentId: Prisma.sql`s.id`,
    asOfDate: today,
  });

  if (!overdueOnly) {
    return Prisma.sql`${dueDebtSql} > 0`;
  }

  return Prisma.sql`(
    ${dueDebtSql} > 0
    and ${buildStudentOldestDebtDueDateSql({
      studentId: Prisma.sql`s.id`,
      asOfDate: today,
    })} < ${today}::date
  )`;
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
  const conditions: Prisma.Sql[] = [Prisma.sql`s.is_test_data = false`];
  const outstandingBalanceSql = buildStudentOutstandingBalanceSql();

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
    conditions.push(
      Prisma.sql`s.lifecycle_status = ${statusFilter}::"erp"."StudentLifecycleStatus"`
    );
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
    conditions.push(Prisma.sql`not ${buildStudentOutstandingBalanceSql()}`);
  }

  if (paymentFilter === "open") {
    conditions.push(Prisma.sql`s.lifecycle_status = 'ACTIVE'::"erp"."StudentLifecycleStatus"`);
    conditions.push(buildStudentDebtDueSql(today));
  }

  if (paymentFilter === "overdue") {
    conditions.push(Prisma.sql`s.lifecycle_status = 'ACTIVE'::"erp"."StudentLifecycleStatus"`);
    conditions.push(buildStudentDebtDueSql(today, true));
  }

  if (paymentFilter === "archive") {
    conditions.push(Prisma.sql`s.lifecycle_status in (
      'FROZEN'::"erp"."StudentLifecycleStatus",
      'STOPPED'::"erp"."StudentLifecycleStatus"
    )`);
    conditions.push(outstandingBalanceSql);
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

function buildStudentSlotsJsonSql(studentId: Prisma.Sql) {
  return Prisma.sql`coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', ordered.id::text,
        'displayName', ordered.display_name,
        'weekday', ordered.weekday::text,
        'shift', ordered.shift::text,
        'startTime', ordered.start_time,
        'endTime', ordered.end_time,
        'room', ordered.room,
        'teacherName', ordered.teacher_name,
        'validFrom', ordered.valid_from,
        'validTo', ordered.valid_to
      )
      order by (ordered.valid_to is null) desc, ordered.valid_from desc, ordered.created_at desc
    )
    from (
      select
        ssa.id,
        ssa.valid_from,
        ssa.valid_to,
        ssa.created_at,
        cs.display_name,
        cs.weekday,
        cs.shift,
        cs.start_time,
        cs.end_time,
        cs.room,
        t.full_name as teacher_name
      from erp.student_schedule_assignments ssa
      join erp.enrollments e on e.id = ssa.enrollment_id
      join erp.class_slots cs on cs.id = ssa.slot_id
      left join erp.teachers t on t.id = cs.teacher_id
      where e.student_id = ${studentId}
    ) ordered
  ), '[]'::jsonb)`;
}

function mapStudentSlot(slot: StudentSlotRecord) {
  const weekdayLabels: Record<string, string> = {
    MONDAY: "Bazar ertəsi",
    TUESDAY: "Çərşənbə axşamı",
    WEDNESDAY: "Çərşənbə",
    THURSDAY: "Cümə axşamı",
    FRIDAY: "Cümə",
    SATURDAY: "Şənbə",
    SUNDAY: "Bazar",
  };
  const shiftLabels: Record<string, string> = {
    MORNING: "Səhər",
    AFTERNOON: "Günorta",
    EVENING: "Axşam",
  };
  const weekday = weekdayLabels[slot.weekday] ?? slot.weekday;
  const shift = shiftLabels[slot.shift] ?? slot.shift;

  return {
    id: slot.id,
    name: slot.displayName?.trim() || `${weekday} · ${shift}`,
    schedule: `${weekday} · ${slot.startTime}–${slot.endTime}`,
    room: slot.room?.trim() || "Otaq təyin edilməyib",
    teacher: slot.teacherName?.trim() || "Müəllim təyin edilməyib",
    period: slot.validTo
      ? `${formatShortDate(slot.validFrom)} – ${formatShortDate(slot.validTo)}`
      : `${formatShortDate(slot.validFrom)} – davam edir`,
    isActive: slot.validTo === null,
  };
}

function toOperationsDistribution(value: unknown) {
  const rows = asJsonArray<{ name: string; count: unknown; capacity?: unknown }>(value).map((item) => ({
    name: item.name,
    count: toNumber(item.count),
    capacity: item.capacity === null || item.capacity === undefined ? null : toNumber(item.capacity),
  }));
  const total = rows.reduce((sum, item) => sum + item.count, 0);

  return rows.map((item) => ({
    ...item,
    percentage: total > 0 ? Math.round((item.count / total) * 100) : 0,
    utilization: item.capacity && item.capacity > 0
      ? Math.round((item.count / item.capacity) * 100)
      : null,
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

function formatClvLifetime(value: number) {
  return clvLifetimeFormatter.format(value);
}

function formatClvComparison(value: number | null) {
  if (value === null) {
    return "əvvəlki dövr üçün məlumat azdır";
  }

  if (value === 0) {
    return "əvvəlki dövrlə eyni";
  }

  return `əvvəlki dövrə görə ${value > 0 ? "+" : ""}${value}%`;
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
        s.freeze_reserved as "freezeReserved",
        s.billing_anchor_date as "billingAnchorDate",
        s.original_first_lesson_at as "originalFirstLessonAt",
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
      ps."billingAnchorDate",
      ps."originalFirstLessonAt",
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
      inv.due_debt as "dueDebt",
      inv.future_receivable as "futureReceivable",
      coalesce((select sum(p.amount) from erp.payments p where p.student_id = ps.id and date_trunc('month', p.paid_at) = date_trunc('month', ${today}::date)), 0) as "currentMonthPaid",
      inv.next_due_date as "nextDueDate",
      clv.total_paid as "totalPaid",
      clv.paid_months as "paidMonths",
      clv.credit_balance as "creditBalance",
      clv_history.monthly_payments as "monthlyPayments",
      inv.invoices,
      ${buildStudentSlotsJsonSql(Prisma.sql`ps.id`)} as slots,
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
        ${buildStudentDueDebtValueSql({
          studentId: Prisma.sql`ps.id`,
          asOfDate: today,
        })} as due_debt,
        ${buildStudentFutureReceivableValueSql({
          studentId: Prisma.sql`ps.id`,
          asOfDate: today,
        })} as future_receivable,
        ${buildStudentEffectiveDueDateSql(Prisma.sql`ps.id`)} as next_due_date,
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
          ) ordered
        ), '[]'::jsonb) as invoices
    ) inv on true
    left join lateral (
      select
        coalesce(sum(p.amount), 0) as total_paid,
        count(distinct p.payment_month) filter (
          where p.schedule_type = 'MONTHLY'::"erp"."PaymentScheduleType"
        )::int as paid_months,
        coalesce(sum(greatest(
          p.amount - coalesce((
            select sum(pa.amount_allocated)
            from erp.payment_allocations pa
            where pa.payment_id = p.id
          ), 0),
          0
        )), 0) as credit_balance
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
  const dueDebt = toNumber(student.dueDebt);
  const futureReceivable = toNumber(student.futureReceivable);
  const totalPaid = toNumber(student.totalPaid);
  const currentMonthPaid = toNumber(student.currentMonthPaid);
  const paidMonths = toNumber(student.paidMonths);
  const creditBalance = toNumber(student.creditBalance);
  const nextPaymentAt = student.nextDueDate
    ? new Date(student.nextDueDate as Date)
    : null;
  const lifecycleStatus = lifecycleMeta[student.lifecycleStatus as StudentLifecycleStatus];
  const paymentStatus = student.lifecycleStatus === StudentLifecycleStatus.COMPLETED
    ? { code: "PAID" as const, label: "Öhdəlik yoxdur", tone: "success" as const }
    : resolveStudentPaymentStatus({
        balance: dueDebt > 0 ? dueDebt : futureReceivable,
        nextPaymentAt,
        today,
        hasBillingRecord: asJsonArray<StudentInvoiceRecord>(student.invoices).length > 0,
      });
  const overdueDays = getOverdueDays(
    nextPaymentAt ?? undefined,
    today
  );
  const defaultPaymentAmount =
    dueDebt > 0
      ? formatDecimalInput(dueDebt)
      : futureReceivable > 0
        ? formatDecimalInput(futureReceivable)
      : student.monthlyFee
        ? formatDecimalInput(student.monthlyFee)
        : "";

  const canAssignStudentManager = scopeFor(actor.permissions, "student.update") === "ALL";
  const [options, reminders, managers, packages, packageUsageRows] = await Promise.all([
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
    prisma.enrollment.findMany({
      where: {
        studentId,
        status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.PAUSED] },
      },
      orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        status: true,
        firstLessonAt: true,
        monthlyFee: true,
        lessonsPerMonth: true,
        program: { select: { name: true } },
        teacher: { select: { fullName: true } },
      },
    }),
    prisma.$queryRaw<StudentPackageUsageRaw[]>(Prisma.sql`
      select
        e.id::text as "enrollmentId",
        coalesce(nullif(e.lessons_per_month, 0), p.default_lessons_per_month)::int as "totalLessons",
        coalesce(active_cycle.cycle_start, date_trunc('month', ${today}::date)::date) as "periodStart",
        coalesce(
          active_cycle.cycle_end,
          (date_trunc('month', ${today}::date) + interval '1 month - 1 day')::date
        ) as "periodEnd",
        case
          when active_cycle.id is null then 'CALENDAR_MONTH'
          else 'BILLING_CYCLE'
        end as "periodSource",
        (
          select count(*)::int
          from erp.attendance_records ar
          join erp.slot_sessions ss on ss.id = ar.session_id
          where ar.enrollment_id = e.id
            and ar.status = 'PRESENT'::"erp"."AttendanceMark"
            and ss.session_date >= coalesce(
              active_cycle.cycle_start,
              date_trunc('month', ${today}::date)::date
            )
            and ss.session_date <= coalesce(
              active_cycle.cycle_end,
              (date_trunc('month', ${today}::date) + interval '1 month - 1 day')::date
            )
        ) as "usedLessons"
      from erp.enrollments e
      join erp.programs p on p.id = e.program_id
      left join lateral (
        select cycle.id, cycle.cycle_start, cycle.cycle_end
        from erp.student_billing_cycles cycle
        where cycle.enrollment_id = e.id
          and cycle.cycle_start <= ${today}::date
          and cycle.cycle_end >= ${today}::date
        order by cycle.cycle_start desc
        limit 1
      ) active_cycle on true
      where e.student_id = ${studentId}::uuid
        and e.status in (
          'ACTIVE'::"erp"."EnrollmentStatus",
          'PAUSED'::"erp"."EnrollmentStatus"
        )
    `),
  ]);
  const packageUsageByEnrollment = new Map(
    packageUsageRows.map((usage) => [usage.enrollmentId, usage]),
  );

  const programs = options.programs.filter((program) => program.isActive).map((program) => ({
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
      canRecordPayment:
        actor.permissions.has("billing.payment.create")
        && student.lifecycleStatus !== StudentLifecycleStatus.COMPLETED,
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
      balance: formatAmount(dueDebt),
      dueDebt: formatAmount(dueDebt),
      futureReceivable: formatAmount(futureReceivable),
      hasDueDebt: dueDebt > 0,
      hasFutureReceivable: futureReceivable > 0,
      lifecycleStatusValue: student.lifecycleStatus as StudentLifecycleStatus,
      freezeReserved: student.freezeReserved,
      lifecycleStatus: student.freezeReserved ? "Dondurulub — yer rezervdir" : lifecycleStatus.label,
      lifecycleTone: lifecycleStatus.tone,
      paymentStatus: paymentStatus.label,
      paymentTone: paymentStatus.tone,
      paidThisMonth: formatAmount(currentMonthPaid),
      lastContact: `Qeydiyyat: ${formatShortDate(student.registeredAt as Date)}`,
      clv: {
        totalPaid: formatAmount(totalPaid),
        paidMonths,
        creditBalance: formatAmount(creditBalance),
        hasCredit: creditBalance > 0,
      },
      detail: {
        email: student.contactEmail ?? "",
        mobileAccount: student.mobileAccountId && student.mobileLoginEmail && student.mobileAccountStatus
          ? {
              loginEmail: student.mobileLoginEmail,
              status: student.mobileAccountStatus,
              invitedAt: student.mobileInvitedAt ? formatShortDate(student.mobileInvitedAt) : "—",
              lastInviteSentAt: student.mobileLastInviteSentAt
                ? formatShortDate(student.mobileLastInviteSentAt)
                : "—",
              activatedAt: student.mobileActivatedAt
                ? formatShortDate(student.mobileActivatedAt)
                : "",
            }
          : null,
        source: student.source ?? "",
        educationLevel: student.educationLevel ?? "",
        managerId: student.managerId ?? "",
        manager: student.managerName ?? "Təyin edilməyib",
        campaignId: student.campaignId ?? "",
        campaign: student.campaignName ?? "Təyin edilməyib",
        enrollmentId: student.enrollmentId ?? "",
        hasEditableEnrollment: packages.length > 0,
        programId: student.programId ?? "",
        teacherId: student.teacherId ?? "",
        discountType: student.discountType ?? "",
        lessonsPerMonth: student.lessonsPerMonth?.toString() ?? "",
        firstLessonDate: student.firstLessonAt
          ? formatDateInput(new Date(student.firstLessonAt))
          : "",
        overallFirstLessonDate: student.originalFirstLessonAt
          ? formatDateInput(new Date(student.originalFirstLessonAt))
          : "",
        billingAnchorDate: student.billingAnchorDate
          ? formatDateInput(new Date(student.billingAnchorDate))
          : "",
        registeredDate: formatDateInput(new Date(student.registeredAt as Date)),
        registeredAt: formatShortDate(student.registeredAt as Date),
        notes: student.notes ?? "Qeyd yoxdur",
        billingPaused: student.billingPaused ? "Dayandırılıb" : "Aktivdir",
        reminderDefaultDate: getBakuDateInput(),
        reminders,
        paymentDefaultAmount: defaultPaymentAmount,
        paymentDefaultDate: formatDateInput(new Date()),
        paymentDefaultMonth: formatDateInput(
          student.nextDueDate ? new Date(student.nextDueDate) : new Date(),
        ).slice(0, 7),
        monthlyFee: formatNonNegativeDecimalInput(student.monthlyFee),
        monthlyFeeLabel: student.monthlyFee === null || student.monthlyFee === undefined
          ? "Təyin edilməyib"
          : formatAmount(student.monthlyFee),
        packages: packages.map((enrollment) => {
          const rawUsage = packageUsageByEnrollment.get(enrollment.id);
          const usage = calculatePackageLessonUsage(
            rawUsage?.totalLessons ?? enrollment.lessonsPerMonth ?? null,
            toNumber(rawUsage?.usedLessons),
          );
          return {
            id: enrollment.id,
            program: enrollment.program.name,
            teacher: enrollment.teacher?.fullName ?? "Müəllim təyin edilməyib",
            firstLessonDate: enrollment.firstLessonAt
              ? formatShortDate(enrollment.firstLessonAt)
              : "Təsdiqlənməyib",
            monthlyFee: formatAmount(enrollment.monthlyFee),
            lessonsPerMonth: usage.totalLessons?.toString() ?? "—",
            usedLessons: usage.usedLessons,
            remainingLessons: usage.remainingLessons,
            overLimitLessons: usage.overLimitLessons,
            usagePeriod: rawUsage
              ? `${formatShortDate(rawUsage.periodStart)}–${formatShortDate(rawUsage.periodEnd)}`
              : "Cari ay",
            usagePeriodSource: rawUsage?.periodSource === "BILLING_CYCLE"
              ? "Paket dövrü"
              : "Təqvim ayı",
            status: enrollment.status === EnrollmentStatus.PAUSED
              ? student.lifecycleStatus === StudentLifecycleStatus.SLOT_WAITING ? "Slot gözləyir" : "Dondurulub"
              : "Aktiv",
          };
        }),
        invoices: asJsonArray<StudentInvoiceRecord>(student.invoices).map((invoice) => {
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
        slots: asJsonArray<StudentSlotRecord>(student.slots).map(mapStudentSlot),
        payments: asJsonArray<StudentPaymentRecord>(student.payments).map((payment) => ({
          id: payment.id,
          amount: formatAmount(payment.amount),
          paidAt: formatShortDate(payment.paidAt),
          paymentMonth: formatMonthInput(payment.paymentMonth),
          nextPaymentDate: payment.scheduleType === "ONE_TIME"
            ? "Tam ödənilib"
            : student.nextDueDate
              ? formatShortDate(student.nextDueDate)
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
