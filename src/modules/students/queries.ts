import {
  InvoiceStatus,
  Prisma,
  StudentLifecycleStatus,
} from "@/generated/prisma/client";
import { unstable_cache } from "next/cache";
import { getPrisma } from "@/server/db/prisma";
import { requireErpActor } from "@/server/auth/actor";
import { formFilterString } from "@/modules/shared/form-values";
import {
  formatAmount,
  formatCount,
  formatShortDate,
  toNumber,
} from "@/modules/shared/format";
import { erpCacheTags } from "@/modules/shared/cache-tags";
import { getStudentPaymentMethodLabel } from "@/modules/students/payment-method";

type SummaryTone = "blue" | "coral" | "yellow" | "mint";
type StudentTone = "success" | "warning" | "danger" | "neutral" | "info";
type StudentPaymentFilter = "all" | "paid" | "open" | "overdue";
type FilterOption = { value: string; label: string };

export type StudentListFilters = {
  q?: string;
  status?: string;
  program?: string;
  teacher?: string;
  payment?: string;
};

export type StudentListData = {
  query: string;
  returnTo: string;
  total: number;
  permissions: {
    canCreateStudent: boolean;
    canConvertLead: boolean;
    canRecordPayment: boolean;
  };
  createOptions: {
    leads: Array<{
      id: string;
      name: string;
      phone: string;
      source: string;
      programId: string;
      managerId: string;
      note: string;
    }>;
    programs: Array<{
      id: string;
      name: string;
      monthlyFee: string;
      lessonsPerMonth: string;
    }>;
    teachers: Array<{ id: string; fullName: string }>;
    managers: Array<{ id: string; fullName: string }>;
    defaultRegisteredDate: string;
    defaultStartDate: string;
    defaultDueDate: string;
    defaultPaymentDate: string;
    defaultPaymentMonth: string;
  };
  filters: {
    status: string;
    program: string;
    teacher: string;
    payment: StudentPaymentFilter;
    activeCount: number;
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
    tone: SummaryTone;
  }>;
  students: Array<{
    id: string;
    code: string;
    name: string;
    phone: string;
    program: string;
    teacher: string;
    dueDate: string;
    balance: string;
    lifecycleStatus: string;
    lifecycleTone: StudentTone;
    paymentStatus: string;
    paymentTone: StudentTone;
    lastContact: string;
    detail: {
      manager: string;
      registeredAt: string;
      notes: string;
      billingPaused: string;
      paymentDefaultAmount: string;
      paymentDefaultDate: string;
      paymentDefaultMonth: string;
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
        method: string;
        note: string;
        createdBy: string;
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

const UNASSIGNED_TEACHER = "unassigned";

type StudentListCacheInput = {
  search: string;
  statusFilter: StudentLifecycleStatus | "";
  programFilter: string;
  teacherFilter: string;
  paymentFilter: StudentPaymentFilter;
  today: string;
};

type StudentListRawData = {
  rows: StudentListQueryRow[];
  options: StudentCreateOptionRows;
};

const lifecycleMeta: Record<
  StudentLifecycleStatus,
  { label: string; tone: StudentTone }
> = {
  [StudentLifecycleStatus.ACTIVE]: { label: "Aktiv", tone: "success" },
  [StudentLifecycleStatus.DEBT]: { label: "Borclu", tone: "danger" },
  [StudentLifecycleStatus.GROUP_WAITING]: {
    label: "Qrup gözləyir",
    tone: "warning",
  },
  [StudentLifecycleStatus.FROZEN]: { label: "Dondurulub", tone: "info" },
  [StudentLifecycleStatus.STOPPED]: { label: "Dayandırılıb", tone: "neutral" },
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
  [StudentLifecycleStatus.GROUP_WAITING]: {
    label: "Qrup gözləyir",
    tone: "yellow",
    delta: "Qrup təyinatı",
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
  [StudentLifecycleStatus.COMPLETED]: {
    label: "Tamamlayıb",
    tone: "mint",
    delta: "Məzun",
  },
};

const paymentOptions: Array<FilterOption & { value: StudentPaymentFilter }> = [
  { value: "all", label: "Bütün ödənişlər" },
  { value: "paid", label: "Ödənilib" },
  { value: "open", label: "Açıq borc" },
  { value: "overdue", label: "Gecikmiş borc" },
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
  const programFilter = formFilterString(input.program);
  const teacherFilter = formFilterString(input.teacher);
  const paymentFilter = normalizePaymentFilter(input.payment);
  const today = startOfToday();
  const { rows, options } = await readStudentListRawData({
    search,
    statusFilter,
    programFilter,
    teacherFilter,
    paymentFilter,
    today: today.toISOString(),
  });
  const { programs, teachers, managers, leads: convertibleLeads } = options;

  const summaryCounts = new Map(
    Object.entries(options.summaryCounts).map(([status, count]) => [
      status as StudentLifecycleStatus,
      count,
    ])
  );
  const visibleStatuses = [
    StudentLifecycleStatus.ACTIVE,
    StudentLifecycleStatus.DEBT,
    StudentLifecycleStatus.GROUP_WAITING,
    StudentLifecycleStatus.FROZEN,
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
    programFilter,
    teacherFilter,
    paymentFilter !== "all" ? paymentFilter : "",
  ].filter(Boolean).length;

  return {
    query: search,
    returnTo: buildStudentsUrl({
      q: search,
      status: statusFilter,
      program: programFilter,
      teacher: teacherFilter,
      payment: paymentFilter,
    }),
    total: rows[0]?.totalCount ?? 0,
    permissions: {
      canCreateStudent: actor.permissions.has("student.create"),
      canConvertLead: actor.permissions.has("crm.lead.convert"),
      canRecordPayment: actor.permissions.has("billing.payment.create"),
    },
    createOptions: {
      leads: convertibleLeads,
      programs: programs.map((program) => ({
        id: program.id,
        name: program.name,
        monthlyFee: formatDecimalInput(program.defaultMonthlyFee),
        lessonsPerMonth: program.defaultLessonsPerMonth?.toString() ?? "",
      })),
      teachers,
      managers,
      defaultRegisteredDate: formatDateInput(new Date()),
      defaultStartDate: formatDateInput(new Date()),
      defaultDueDate: formatDateInput(addDays(new Date(), 7)),
      defaultPaymentDate: formatDateInput(new Date()),
      defaultPaymentMonth: formatMonthInput(new Date()),
    },
    filters: {
      status: statusFilter,
      program: programFilter,
      teacher: teacherFilter,
      payment: paymentFilter,
      activeCount,
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
    statusSummary: visibleStatuses.map((status) => ({
      label: summaryMeta[status].label,
      value: formatCount(summaryCounts.get(status) ?? 0),
      delta: summaryMeta[status].delta,
      tone: summaryMeta[status].tone,
    })),
    students: rows.map((student) => {
      const balance = toNumber(student.balanceDue);
      const lifecycleStatus = lifecycleMeta[student.lifecycleStatus];
      const paymentStatus = getPaymentStatus(
        balance,
        student.nextDueDate ? new Date(student.nextDueDate) : undefined,
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
        program: student.programName ?? "Proqram yoxdur",
        teacher: student.teacherName ?? "Təyin edilməyib",
        dueDate: student.nextDueDate ? formatShortDate(student.nextDueDate) : "Ödənilib",
        balance: formatAmount(balance),
        lifecycleStatus: lifecycleStatus.label,
        lifecycleTone: lifecycleStatus.tone,
        paymentStatus: paymentStatus.label,
        paymentTone: paymentStatus.tone,
        lastContact: `Qeydiyyat: ${formatShortDate(student.registeredAt)}`,
        detail: {
          manager: student.managerName ?? "Təyin edilməyib",
          registeredAt: formatShortDate(student.registeredAt),
          notes: student.notes ?? "Qeyd yoxdur",
          billingPaused: student.billingPaused ? "Dayandırılıb" : "Aktivdir",
          paymentDefaultAmount: defaultPaymentAmount,
          paymentDefaultDate: formatDateInput(new Date()),
          paymentDefaultMonth: formatMonthInput(new Date()),
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
            method: getStudentPaymentMethodLabel(payment.method),
            note: payment.note ?? "-",
            createdBy: payment.createdByName ?? "Sistem",
          })),
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
  balanceDue: unknown;
  nextDueDate: Date | string | null;
  totalCount: number;
  invoices: StudentInvoiceRecord[];
  payments: StudentPaymentRecord[];
  timeline: StudentTimelineRecord[];
};

type StudentListRawRow = Omit<
  StudentListQueryRow,
  "lifecycleStatus" | "totalCount" | "invoices" | "payments" | "timeline"
> & {
  lifecycleStatus: string;
  totalCount: unknown;
  invoices: unknown;
  payments: unknown;
  timeline: unknown;
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
  method: string;
  note: string | null;
  createdByName: string | null;
};

type StudentTimelineRecord = {
  id: string;
  newStatus: StudentLifecycleStatus;
  reason: string;
  note: string | null;
  effectiveAt: Date | string;
  changedByName: string | null;
};

async function getStudentRows(
  prisma: ReturnType<typeof getPrisma>,
  input: {
    search: string;
    statusFilter: StudentLifecycleStatus | "";
    programFilter: string;
    teacherFilter: string;
    paymentFilter: StudentPaymentFilter;
    today: Date;
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
      limit 50
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
      inv.balance_due as "balanceDue",
      inv.next_due_date as "nextDueDate",
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
        coalesce((
          select sum(i.balance_due)
          from erp.invoices i
          where i.student_id = ps.id
            and i.status <> 'VOID'::"erp"."InvoiceStatus"
            and i.balance_due > 0
        ), 0) as balance_due,
        (
          select i.due_date
          from erp.invoices i
          where i.student_id = ps.id
            and i.status <> 'VOID'::"erp"."InvoiceStatus"
            and i.balance_due > 0
          order by i.due_date asc, i.created_at asc
          limit 1
        ) as next_due_date,
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
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', ordered.id::text,
          'amount', ordered.amount,
          'paidAt', ordered.paid_at,
          'paymentMonth', ordered.payment_month,
          'method', ordered.method::text,
          'note', ordered.note,
          'createdByName', ordered.created_by_name
        )
        order by ordered.paid_at desc, ordered.created_at desc
      ), '[]'::jsonb) as payments
      from (
        select p.id, p.amount, p.paid_at, p.payment_month, p.method, p.note, p.created_at, u.full_name as created_by_name
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
    timeline: asJsonArray<StudentTimelineRecord>(row.timeline).map((item) => ({
      ...item,
      newStatus: item.newStatus as StudentLifecycleStatus,
    })),
  }));
}

type StudentCreateOptionRows = {
  summaryCounts: Record<string, number>;
  programs: Array<{
    id: string;
    name: string;
    defaultMonthlyFee: unknown;
    defaultLessonsPerMonth: number | null;
  }>;
  teachers: Array<{ id: string; fullName: string }>;
  managers: Array<{ id: string; fullName: string }>;
  leads: StudentListData["createOptions"]["leads"];
};

type StudentCreateOptionsRawRow = {
  summaryCounts: unknown;
  programs: unknown;
  teachers: unknown;
  managers: unknown;
  leads: unknown;
};

const getCachedStudentListRawData = unstable_cache(
  async (input: StudentListCacheInput) => getStudentListRawData(input),
  ["student-list-data"],
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
  const [rows, options] = await Promise.all([
    getStudentRows(prisma, {
      search: input.search,
      statusFilter: input.statusFilter,
      programFilter: input.programFilter,
      teacherFilter: input.teacherFilter,
      paymentFilter: input.paymentFilter,
      today: new Date(input.today),
    }),
    getStudentCreateOptions(prisma),
  ]);

  return { rows, options };
}

async function getStudentCreateOptions(
  prisma: ReturnType<typeof getPrisma>
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
        select jsonb_agg(
          jsonb_build_object(
            'id', p.id::text,
            'name', p.name,
            'defaultMonthlyFee', p.default_monthly_fee,
            'defaultLessonsPerMonth', p.default_lessons_per_month
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
        select jsonb_agg(
          jsonb_build_object(
            'id', u.id::text,
            'fullName', u.full_name
          )
          order by u.full_name asc
        )
        from erp.users u
        where u.is_active = true
      ), '[]'::jsonb) as "managers",
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', ordered.id,
            'name', ordered.name,
            'phone', ordered.phone,
            'source', ordered.source,
            'programId', ordered.program_id,
            'managerId', ordered.manager_id,
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
            coalesce(l.program_interest_id::text, '') as program_id,
            coalesce(l.manager_id::text, '') as manager_id,
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
    programs: asJsonArray<StudentCreateOptionRows["programs"][number]>(
      row?.programs
    ),
    teachers: asJsonArray<StudentCreateOptionRows["teachers"][number]>(
      row?.teachers
    ),
    managers: asJsonArray<StudentCreateOptionRows["managers"][number]>(
      row?.managers
    ),
    leads: asJsonArray<StudentCreateOptionRows["leads"][number]>(row?.leads),
  };
}

function buildStudentWhereSql({
  search,
  statusFilter,
  programFilter,
  teacherFilter,
  paymentFilter,
  today,
}: {
  search: string;
  statusFilter: StudentLifecycleStatus | "";
  programFilter: string;
  teacherFilter: string;
  paymentFilter: StudentPaymentFilter;
  today: Date;
}) {
  const conditions: Prisma.Sql[] = [Prisma.sql`true`];

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
    conditions.push(Prisma.sql`not exists (
      select 1
      from erp.invoices i
      where i.student_id = s.id
        and i.status <> 'VOID'::"erp"."InvoiceStatus"
        and i.balance_due > 0
    )`);
  }

  if (paymentFilter === "open") {
    conditions.push(Prisma.sql`exists (
      select 1
      from erp.invoices i
      where i.student_id = s.id
        and i.status <> 'VOID'::"erp"."InvoiceStatus"
        and i.balance_due > 0
    )`);
  }

  if (paymentFilter === "overdue") {
    conditions.push(Prisma.sql`exists (
      select 1
      from erp.invoices i
      where i.student_id = s.id
        and i.status <> 'VOID'::"erp"."InvoiceStatus"
        and i.balance_due > 0
        and i.due_date < ${today}
    )`);
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

function getPaymentStatus(
  balance: number,
  nextDueDate: Date | undefined,
  today: Date
): { label: string; tone: StudentTone } {
  if (balance <= 0) {
    return { label: "Ödənilib", tone: "success" };
  }

  if (nextDueDate && nextDueDate < today) {
    return { label: "Gecikmiş borc", tone: "danger" };
  }

  return { label: "Açıq borc", tone: "warning" };
}

function buildStudentsUrl({
  q,
  status,
  program,
  teacher,
  payment,
}: {
  q: string;
  status: StudentLifecycleStatus | "";
  program: string;
  teacher: string;
  payment: StudentPaymentFilter;
}) {
  const params = new URLSearchParams();

  if (q) {
    params.set("q", q);
  }

  if (status) {
    params.set("status", status);
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

function addDays(value: Date, amount: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + amount);
  return next;
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function isMissingIncrementalCacheError(error: unknown) {
  return error instanceof Error && error.message.includes("incrementalCache missing");
}

export async function getStudentDetailData(studentId: string) {
  const actor = await requireErpActor("student.read");
  const prisma = getPrisma();
  const today = startOfToday();

  const rows = await prisma.$queryRaw<StudentListRawRow[]>(Prisma.sql`
    with paged_students as (
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
        1::int as "totalCount"
      from erp.students s
      join erp.contacts c on c.id = s.contact_id
      left join erp.users u on u.id = s.manager_id
      where s.id = ${studentId}::uuid
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
      inv.balance_due as "balanceDue",
      inv.next_due_date as "nextDueDate",
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
        coalesce((
          select sum(i.balance_due)
          from erp.invoices i
          where i.student_id = ps.id
            and i.status <> 'VOID'::"erp"."InvoiceStatus"
            and i.balance_due > 0
        ), 0) as balance_due,
        (
          select i.due_date
          from erp.invoices i
          where i.student_id = ps.id
            and i.status <> 'VOID'::"erp"."InvoiceStatus"
            and i.balance_due > 0
          order by i.due_date asc, i.created_at asc
          limit 1
        ) as next_due_date,
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
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', ordered.id::text,
          'amount', ordered.amount,
          'paidAt', ordered.paid_at,
          'paymentMonth', ordered.payment_month,
          'method', ordered.method::text,
          'note', ordered.note,
          'createdByName', ordered.created_by_name
        )
        order by ordered.paid_at desc, ordered.created_at desc
      ), '[]'::jsonb) as payments
      from (
        select p.id, p.amount, p.paid_at, p.payment_month, p.method, p.note, p.created_at, u.full_name as created_by_name
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
  const lifecycleStatus = lifecycleMeta[student.lifecycleStatus as StudentLifecycleStatus];
  const paymentStatus = getPaymentStatus(
    balance,
    student.nextDueDate ? new Date(student.nextDueDate as Date) : undefined,
    today
  );
  const defaultPaymentAmount =
    balance > 0
      ? formatDecimalInput(balance)
      : student.monthlyFee
        ? formatDecimalInput(student.monthlyFee)
        : "";

  const options = await getStudentCreateOptions(prisma);

  return {
    returnTo: `/students/${student.id}`,
    permissions: {
      canCreateStudent: actor.permissions.has("student.create"),
      canConvertLead: actor.permissions.has("crm.lead.convert"),
      canRecordPayment: actor.permissions.has("billing.payment.create"),
    },
    createOptions: {
      leads: options.leads,
      programs: options.programs.map((program) => ({
        id: program.id,
        name: program.name,
        monthlyFee: formatDecimalInput(program.defaultMonthlyFee),
        lessonsPerMonth: program.defaultLessonsPerMonth?.toString() ?? "",
      })),
      teachers: options.teachers,
      managers: options.managers,
      defaultRegisteredDate: formatDateInput(new Date()),
      defaultStartDate: formatDateInput(new Date()),
      defaultDueDate: formatDateInput(addDays(new Date(), 7)),
      defaultPaymentDate: formatDateInput(new Date()),
      defaultPaymentMonth: formatMonthInput(new Date()),
    },
    student: {
      id: student.id,
      code: student.code,
      name: student.name,
      phone: student.phone ?? "-",
      program: student.programName ?? "Proqram yoxdur",
      teacher: student.teacherName ?? "Təyin edilməyib",
      dueDate: student.nextDueDate ? formatShortDate(student.nextDueDate as Date) : "Ödənilib",
      balance: formatAmount(balance),
      lifecycleStatus: lifecycleStatus.label,
      lifecycleTone: lifecycleStatus.tone,
      paymentStatus: paymentStatus.label,
      paymentTone: paymentStatus.tone,
      lastContact: `Qeydiyyat: ${formatShortDate(student.registeredAt as Date)}`,
      detail: {
        manager: student.managerName ?? "Təyin edilməyib",
        registeredAt: formatShortDate(student.registeredAt as Date),
        notes: student.notes ?? "Qeyd yoxdur",
        billingPaused: student.billingPaused ? "Dayandırılıb" : "Aktivdir",
        paymentDefaultAmount: defaultPaymentAmount,
        paymentDefaultDate: formatDateInput(new Date()),
        paymentDefaultMonth: formatMonthInput(new Date()),
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
          method: getStudentPaymentMethodLabel(payment.method),
          note: payment.note ?? "-",
          createdBy: payment.createdByName ?? "Sistem",
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
