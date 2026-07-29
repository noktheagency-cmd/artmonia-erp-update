import { Prisma } from "@/generated/prisma/client";
import { formatAmount, formatCount, toNumber } from "@/modules/shared/format";
import { formFilterString } from "@/modules/shared/form-values";
import { getStudentPaymentMethodLabel } from "@/modules/students/payment-method";
import {
  calculateWorkshopParticipantFinance,
  type WorkshopPaymentState,
} from "@/modules/workshops/finance-rules";
import { requireErpActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";

type StatusTone = "success" | "warning" | "danger" | "neutral" | "info";
export type WorkshopKind = "WORKSHOP" | "MASTERCLASS";
export type WorkshopStatus = "DRAFT" | "SCHEDULED" | "ACTIVE" | "COMPLETED" | "CANCELLED";
export type ParticipantPaymentState = WorkshopPaymentState;

export type WorkshopFilters = {
  q?: string;
  type?: string;
  status?: string;
  dateRange?: string;
  from?: string;
  to?: string;
  instructor?: string;
  room?: string;
  collection?: string;
  profitability?: string;
  sort?: string;
  page?: string;
  pageSize?: string;
  selected?: string;
};

export type WorkshopDetailFilters = {
  tab?: string;
  q?: string;
  paymentState?: string;
  participantType?: string;
  page?: string;
  pageSize?: string;
};

export type WorkshopEventRow = {
  id: string;
  title: string;
  eventType: string;
  eventTypeKind: WorkshopKind;
  eventTypeLabel: string;
  status: WorkshopStatus;
  statusLabel: string;
  statusTone: StatusTone;
  date: string;
  dateValue: string;
  time: string;
  duration: string;
  durationMinutes: number;
  room: string;
  instructor: string;
  capacity: number | null;
  entryPrice: string;
  entryPriceInput: string;
  revenue: string;
  revenueValue: number;
  expense: string;
  expenseValue: number;
  netProfit: string;
  netProfitValue: number;
  expected: string;
  expectedValue: number;
  potentialRevenue: string;
  potentialRevenueValue: number;
  participantCount: number;
  paidCount: number;
  advanceCount: number;
  unpaidCount: number;
  giftCount: number;
  fillRate: number;
  note: string;
};

export type WorkshopParticipantRow = {
  id: string;
  eventId: string;
  studentId: string;
  kind: "student" | "guest";
  fullName: string;
  phone: string;
  email: string;
  listPrice: string;
  listPriceInput: string;
  discountAmount: string;
  discountAmountInput: string;
  netPrice: string;
  paid: string;
  paidValue: number;
  balance: string;
  balanceValue: number;
  paymentState: ParticipantPaymentState;
  paymentLabel: string;
  paymentTone: StatusTone;
  isGift: boolean;
  note: string;
  assignedAt: string;
  cancelledAt: string;
};

export type WorkshopPaymentRow = {
  id: string;
  eventId: string;
  participantId: string;
  participantName: string;
  amount: string;
  amountInput: string;
  amountValue: number;
  paidAt: string;
  paidAtValue: string;
  method: string;
  methodValue: string;
  payerName: string;
  receipt: string;
  receiptFilePath: string;
  note: string;
  statusLabel: string;
  statusTone: StatusTone;
  voidReason: string;
};

export type WorkshopExpenseRow = {
  id: string;
  eventId: string;
  categoryId: string;
  category: string;
  amount: string;
  amountInput: string;
  amountValue: number;
  expenseDate: string;
  expenseDateValue: string;
  method: string;
  methodValue: string;
  vendor: string;
  receipt: string;
  receiptFilePath: string;
  description: string;
  statusLabel: string;
  statusTone: StatusTone;
  voidReason: string;
};

export type WorkshopData = {
  defaultDate: string;
  permissions: WorkshopPermissions;
  filters: NormalizedWorkshopFilters & { activeCount: number };
  filterOptions: {
    types: Array<{ value: string; label: string }>;
    instructors: Array<{ value: string; label: string }>;
    rooms: Array<{ value: string; label: string }>;
  };
  kpis: Array<{ label: string; value: string; helper: string; tone: StatusTone }>;
  summary: {
    revenue: string;
    expense: string;
    netProfit: string;
    expected: string;
    participantCount: string;
  };
  events: WorkshopEventRow[];
  selectedEvent: WorkshopEventRow | null;
  pagination: Pagination;
};

export type WorkshopDetailData = {
  defaultDate: string;
  permissions: WorkshopPermissions;
  activeTab: "overview" | "participants" | "payments" | "expenses" | "details";
  event: WorkshopEventRow;
  summary: {
    revenue: string;
    expense: string;
    netProfit: string;
    expected: string;
  };
  participants: WorkshopParticipantRow[];
  payments: WorkshopPaymentRow[];
  expenses: WorkshopExpenseRow[];
  students: WorkshopStudentOption[];
  categories: Array<{ id: string; name: string; description: string }>;
  eventTypes: Array<{ value: string; label: string }>;
  participantFilters: {
    query: string;
    paymentState: string;
    participantType: string;
    page: number;
    pageSize: number;
  };
  participantPagination: Pagination;
};

type WorkshopPermissions = {
  canManage: boolean;
  canViewFinance: boolean;
  canManageFinance: boolean;
};

export type WorkshopStudentOption = {
  id: string;
  name: string;
  code: string;
  phone: string;
  program: string;
  teacher: string;
  label: string;
};

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPrevious: boolean;
  hasNext: boolean;
};

type NormalizedWorkshopFilters = {
  query: string;
  type: string;
  status: "all" | WorkshopStatus;
  dateRange: "month" | "all";
  from: string;
  to: string;
  instructor: string;
  room: string;
  collection: "all" | "unpaid" | "advance" | "paid" | "gift";
  profitability: "all" | "profit" | "loss" | "breakeven";
  sort: "upcoming" | "newest" | "revenue" | "expense" | "profit" | "participants";
  page: number;
  pageSize: number;
  selected: string;
};

type EventDbRow = {
  id: string;
  title: string;
  eventType: string;
  eventTypeKind: WorkshopKind;
  status: WorkshopStatus;
  eventDate: Date | string;
  dateValue: string;
  startTime: string;
  durationMinutes: number;
  room: string | null;
  instructor: string | null;
  capacity: number | null;
  entryPrice: unknown;
  note: string | null;
  participantCount: unknown;
  paidCount: unknown;
  advanceCount: unknown;
  unpaidCount: unknown;
  giftCount: unknown;
  potentialRevenue: unknown;
  revenue: unknown;
  expense: unknown;
  totalCount?: unknown;
};

type SummaryDbRow = {
  revenue: unknown;
  expense: unknown;
  potentialRevenue: unknown;
  participantCount: unknown;
  eventCount: unknown;
  activeEventCount: unknown;
  completedEventCount: unknown;
};

type ParticipantDbRow = {
  id: string;
  eventId: string;
  studentId: string | null;
  fullName: string;
  phone: string | null;
  email: string | null;
  listPrice: unknown;
  discountAmount: unknown;
  isGift: boolean;
  note: string | null;
  assignedAt: Date | string;
  cancelledAt: Date | string | null;
  paid: unknown;
  totalCount: unknown;
};

type PaymentDbRow = {
  id: string;
  eventId: string;
  participantId: string;
  participantName: string;
  amount: unknown;
  paidAt: Date | string;
  paidAtValue: string;
  method: string;
  payerName: string | null;
  receiptFileName: string | null;
  receiptFilePath: string | null;
  receiptReference: string | null;
  note: string | null;
  voidedAt: Date | string | null;
  voidReason: string | null;
};

type ExpenseDbRow = {
  id: string;
  eventId: string;
  categoryId: string;
  category: string;
  amount: unknown;
  expenseDate: Date | string;
  expenseDateValue: string;
  method: string;
  vendor: string | null;
  receiptFileName: string | null;
  receiptFilePath: string | null;
  receiptReference: string | null;
  description: string | null;
  voidedAt: Date | string | null;
  voidReason: string | null;
};

type StudentDbRow = {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  program: string | null;
  teacher: string | null;
};

const eventAggregateCte = Prisma.sql`
  with participant_totals as (
    select
      wp.event_id,
      count(*) filter (where wp.cancelled_at is null)::int as participant_count,
      count(*) filter (where wp.cancelled_at is null and wp.is_gift = true)::int as gift_count,
      coalesce(sum(case when wp.cancelled_at is null and wp.is_gift = false
        then greatest(wp.list_price - wp.discount_amount, 0) else 0 end), 0) as potential_revenue
    from erp.workshop_participants wp
    group by wp.event_id
  ),
  participant_paid as (
    select wp.id as participant_id, wp.event_id,
      coalesce(sum(pay.amount) filter (where pay.voided_at is null), 0) as paid
    from erp.workshop_participants wp
    left join erp.workshop_payments pay on pay.participant_id = wp.id
    group by wp.id
  ),
  participant_states as (
    select
      wp.event_id,
      count(*) filter (where wp.cancelled_at is null and wp.is_gift = false and pp.paid >= greatest(wp.list_price - wp.discount_amount, 0))::int as paid_count,
      count(*) filter (where wp.cancelled_at is null and wp.is_gift = false and pp.paid > 0 and pp.paid < greatest(wp.list_price - wp.discount_amount, 0))::int as advance_count,
      count(*) filter (where wp.cancelled_at is null and wp.is_gift = false and pp.paid = 0)::int as unpaid_count
    from erp.workshop_participants wp
    join participant_paid pp on pp.participant_id = wp.id
    group by wp.event_id
  ),
  payment_totals as (
    select event_id, coalesce(sum(amount) filter (where voided_at is null), 0) as revenue
    from erp.workshop_payments
    group by event_id
  ),
  expense_totals as (
    select workshop_event_id as event_id,
      coalesce(sum(amount) filter (where voided_at is null), 0) as expense
    from erp.finance_expenses
    where workshop_event_id is not null
    group by workshop_event_id
  ),
  event_rows as (
    select
      we.*,
      coalesce(pt.participant_count, 0)::int as participant_count,
      coalesce(ps.paid_count, 0)::int as paid_count,
      coalesce(ps.advance_count, 0)::int as advance_count,
      coalesce(ps.unpaid_count, 0)::int as unpaid_count,
      coalesce(pt.gift_count, 0)::int as gift_count,
      coalesce(pt.potential_revenue, 0) as potential_revenue,
      coalesce(pay.revenue, 0) as revenue,
      coalesce(exp.expense, 0) as expense
    from erp.workshop_events we
    left join participant_totals pt on pt.event_id = we.id
    left join participant_states ps on ps.event_id = we.id
    left join payment_totals pay on pay.event_id = we.id
    left join expense_totals exp on exp.event_id = we.id
  )
`;

export async function getWorkshopData(input: WorkshopFilters = {}): Promise<WorkshopData> {
  const actor = await requireErpActor("workshop.read");
  const prisma = getPrisma();
  const filters = normalizeWorkshopFilters(input);
  const permissions = getWorkshopPermissions(actor.permissions);
  const conditions = buildEventConditions(filters);
  const whereSql = conditions.length > 0
    ? Prisma.sql`where ${Prisma.join(conditions, " and ")}`
    : Prisma.empty;
  const sortSql = getEventSortSql(filters.sort);
  const offset = (filters.page - 1) * filters.pageSize;

  const [rows, summaryRows, optionRows] = await Promise.all([
    prisma.$queryRaw<EventDbRow[]>(Prisma.sql`
      ${eventAggregateCte}
      select
        er.id::text as "id", er.title,
        coalesce(er.category, er.event_type::text) as "eventType",
        er.event_type::text as "eventTypeKind",
        er.status::text as "status", er.event_date as "eventDate",
        to_char(er.event_date, 'YYYY-MM-DD') as "dateValue", er.start_time as "startTime",
        er.duration_minutes as "durationMinutes", er.room, er.instructor, er.capacity,
        er.entry_price as "entryPrice", er.note,
        er.participant_count as "participantCount", er.paid_count as "paidCount",
        er.advance_count as "advanceCount", er.unpaid_count as "unpaidCount",
        er.gift_count as "giftCount", er.potential_revenue as "potentialRevenue",
        er.revenue, er.expense, count(*) over()::int as "totalCount"
      from event_rows er
      ${whereSql}
      order by ${sortSql}
      limit ${filters.pageSize} offset ${offset}
    `),
    prisma.$queryRaw<SummaryDbRow[]>(Prisma.sql`
      ${eventAggregateCte}
      select coalesce(sum(er.revenue), 0) as revenue,
        coalesce(sum(er.expense), 0) as expense,
        coalesce(sum(er.potential_revenue), 0) as "potentialRevenue",
        coalesce(sum(er.participant_count), 0)::int as "participantCount",
        count(*)::int as "eventCount",
        count(*) filter (where er.status = 'ACTIVE'::"erp"."WorkshopEventStatus")::int as "activeEventCount",
        count(*) filter (where er.status = 'COMPLETED'::"erp"."WorkshopEventStatus")::int as "completedEventCount"
      from event_rows er ${whereSql}
    `),
    prisma.$queryRaw<Array<{ eventType: string; instructor: string | null; room: string | null }>>(Prisma.sql`
      select distinct coalesce(category, event_type::text) as "eventType", instructor, room
      from erp.workshop_events
      order by "eventType", instructor nulls last, room nulls last
    `),
  ]);

  const mapped = rows.map((row) => mapEventRow(row, permissions.canViewFinance));
  const summaryRow = summaryRows[0] ?? {
    revenue: 0,
    expense: 0,
    potentialRevenue: 0,
    participantCount: 0,
    eventCount: 0,
    activeEventCount: 0,
    completedEventCount: 0,
  };
  const revenue = permissions.canViewFinance ? toNumber(summaryRow.revenue) : 0;
  const expense = permissions.canViewFinance ? toNumber(summaryRow.expense) : 0;
  const potential = permissions.canViewFinance ? toNumber(summaryRow.potentialRevenue) : 0;
  const participants = toNumber(summaryRow.participantCount);
  const total = toNumber(rows[0]?.totalCount ?? 0);
  const selectedEvent = mapped.find((event) => event.id === filters.selected) ?? mapped[0] ?? null;
  const activeCount = [
    filters.query,
    filters.type !== "all" ? filters.type : "",
    filters.status !== "all" ? filters.status : "",
    filters.instructor,
    filters.room,
    filters.collection !== "all" ? filters.collection : "",
    filters.profitability !== "all" ? filters.profitability : "",
  ].filter(Boolean).length + (filters.dateRange === "all" ? 0 : 1);

  return {
    defaultDate: toDateInput(new Date()),
    permissions,
    filters: { ...filters, activeCount },
    filterOptions: {
      types: uniqueEventTypeOptions(optionRows.map((row) => row.eventType)),
      instructors: uniqueOptions(optionRows.map((row) => row.instructor)),
      rooms: uniqueOptions(optionRows.map((row) => row.room)),
    },
    summary: {
      revenue: financeAmount(revenue, permissions.canViewFinance),
      expense: financeAmount(expense, permissions.canViewFinance),
      netProfit: financeAmount(revenue - expense, permissions.canViewFinance),
      expected: financeAmount(Math.max(potential - revenue, 0), permissions.canViewFinance),
      participantCount: formatCount(participants),
    },
    kpis: [
      { label: "Aktiv tədbirlər", value: formatCount(toNumber(summaryRow.activeEventCount)), helper: "Cari görünüşdə aktiv olanlar", tone: "success" },
      { label: "Tamamlanmış tədbirlər", value: formatCount(toNumber(summaryRow.completedEventCount)), helper: "Cari görünüşdə tamamlananlar", tone: "info" },
      { label: "Dövriyyə", value: financeAmount(revenue, permissions.canViewFinance), helper: "Qəbul edilmiş aktiv ödənişlər", tone: "success" },
      { label: "Xərclər", value: financeAmount(expense, permissions.canViewFinance), helper: "Tədbirlərə bağlanan xərclər", tone: expense > revenue ? "danger" : "neutral" },
      { label: "Xalis mənfəət", value: financeAmount(revenue - expense, permissions.canViewFinance), helper: permissions.canViewFinance ? `${formatAmount(Math.max(potential - revenue, 0))} gözlənilir` : "Maliyyə icazəsi tələb olunur", tone: revenue - expense >= 0 ? "success" : "danger" },
      { label: "İştirakçılar", value: formatCount(participants), helper: `${formatCount(toNumber(summaryRow.eventCount))} tədbir üzrə`, tone: "info" },
    ],
    events: mapped,
    selectedEvent,
    pagination: makePagination(filters.page, filters.pageSize, total),
  };
}

export async function getWorkshopDetailData(
  eventId: string,
  input: WorkshopDetailFilters = {}
): Promise<WorkshopDetailData | null> {
  const actor = await requireErpActor("workshop.read");
  const prisma = getPrisma();
  const permissions = getWorkshopPermissions(actor.permissions);
  const filters = normalizeDetailFilters(input);
  const participantConditions: Prisma.Sql[] = [Prisma.sql`wp.event_id = ${eventId}::uuid`];
  if (filters.query) {
    const like = `%${filters.query}%`;
    participantConditions.push(Prisma.sql`(wp.full_name ilike ${like} or coalesce(wp.phone, '') ilike ${like})`);
  }
  if (filters.participantType === "student") participantConditions.push(Prisma.sql`wp.student_id is not null`);
  if (filters.participantType === "guest") participantConditions.push(Prisma.sql`wp.student_id is null`);
  if (filters.paymentState === "cancelled") participantConditions.push(Prisma.sql`wp.cancelled_at is not null`);
  else participantConditions.push(Prisma.sql`wp.cancelled_at is null`);
  if (filters.paymentState === "gift") participantConditions.push(Prisma.sql`wp.is_gift = true`);
  if (filters.paymentState === "unpaid") participantConditions.push(Prisma.sql`wp.is_gift = false and coalesce(pt.paid, 0) = 0`);
  if (filters.paymentState === "advance") participantConditions.push(Prisma.sql`wp.is_gift = false and coalesce(pt.paid, 0) > 0 and coalesce(pt.paid, 0) < greatest(wp.list_price - wp.discount_amount, 0)`);
  if (filters.paymentState === "paid") participantConditions.push(Prisma.sql`wp.is_gift = false and coalesce(pt.paid, 0) >= greatest(wp.list_price - wp.discount_amount, 0)`);
  const participantWhere = Prisma.sql`where ${Prisma.join(participantConditions, " and ")}`;
  const participantOffset = (filters.page - 1) * filters.pageSize;

  const [eventRows, participantRows, paymentRows, expenseRows, students, categories, eventTypeRows] = await Promise.all([
    prisma.$queryRaw<EventDbRow[]>(Prisma.sql`
      ${eventAggregateCte}
      select er.id::text as "id", er.title,
        coalesce(er.category, er.event_type::text) as "eventType",
        er.event_type::text as "eventTypeKind",
        er.status::text as "status", er.event_date as "eventDate",
        to_char(er.event_date, 'YYYY-MM-DD') as "dateValue", er.start_time as "startTime",
        er.duration_minutes as "durationMinutes", er.room, er.instructor, er.capacity,
        er.entry_price as "entryPrice", er.note,
        er.participant_count as "participantCount", er.paid_count as "paidCount",
        er.advance_count as "advanceCount", er.unpaid_count as "unpaidCount",
        er.gift_count as "giftCount", er.potential_revenue as "potentialRevenue",
        er.revenue, er.expense
      from event_rows er where er.id = ${eventId}::uuid limit 1
    `),
    prisma.$queryRaw<ParticipantDbRow[]>(Prisma.sql`
      with payment_totals as (
        select participant_id, coalesce(sum(amount) filter (where voided_at is null), 0) as paid
        from erp.workshop_payments group by participant_id
      )
      select wp.id::text as id, wp.event_id::text as "eventId", wp.student_id::text as "studentId",
        wp.full_name as "fullName", wp.phone, wp.email, wp.list_price as "listPrice",
        wp.discount_amount as "discountAmount", wp.is_gift as "isGift", wp.note,
        wp.assigned_at as "assignedAt", wp.cancelled_at as "cancelledAt",
        coalesce(pt.paid, 0) as paid, count(*) over()::int as "totalCount"
      from erp.workshop_participants wp
      left join payment_totals pt on pt.participant_id = wp.id
      ${participantWhere}
      order by wp.cancelled_at nulls first, wp.assigned_at desc
      limit ${filters.pageSize} offset ${participantOffset}
    `),
    permissions.canViewFinance && (filters.tab === "payments" || filters.tab === "overview")
      ? prisma.$queryRaw<PaymentDbRow[]>(Prisma.sql`
          select pay.id::text as id, pay.event_id::text as "eventId",
            pay.participant_id::text as "participantId", wp.full_name as "participantName",
            pay.amount, pay.paid_at as "paidAt", to_char(pay.paid_at, 'YYYY-MM-DD') as "paidAtValue",
            pay.method::text as method, pay.payer_name as "payerName",
            pay.receipt_file_name as "receiptFileName", pay.receipt_file_path as "receiptFilePath",
            pay.receipt_reference as "receiptReference", pay.note,
            pay.voided_at as "voidedAt", pay.void_reason as "voidReason"
          from erp.workshop_payments pay
          join erp.workshop_participants wp on wp.id = pay.participant_id
          where pay.event_id = ${eventId}::uuid
          order by pay.voided_at nulls first, pay.paid_at desc, pay.created_at desc limit 120
        `)
      : Promise.resolve([]),
    permissions.canViewFinance && (filters.tab === "expenses" || filters.tab === "overview")
      ? prisma.$queryRaw<ExpenseDbRow[]>(Prisma.sql`
          select fe.id::text as id, fe.workshop_event_id::text as "eventId",
            fe.category_id::text as "categoryId", fec.name as category, fe.amount,
            fe.expense_date as "expenseDate", to_char(fe.expense_date, 'YYYY-MM-DD') as "expenseDateValue",
            fe.method::text as method, fe.vendor, fe.receipt_file_name as "receiptFileName",
            fe.receipt_file_path as "receiptFilePath", fe.receipt_reference as "receiptReference",
            fe.description, fe.voided_at as "voidedAt", fe.void_reason as "voidReason"
          from erp.finance_expenses fe
          join erp.finance_expense_categories fec on fec.id = fe.category_id
          where fe.workshop_event_id = ${eventId}::uuid
          order by fe.voided_at nulls first, fe.expense_date desc, fe.created_at desc limit 120
        `)
      : Promise.resolve([]),
    prisma.$queryRaw<StudentDbRow[]>(Prisma.sql`
      with latest_enrollment as (
        select distinct on (e.student_id) e.student_id, p.name as program, t.full_name as teacher
        from erp.enrollments e
        join erp.programs p on p.id = e.program_id
        left join erp.teachers t on t.id = e.teacher_id
        where e.status in ('ACTIVE'::"erp"."EnrollmentStatus", 'PAUSED'::"erp"."EnrollmentStatus")
        order by e.student_id, e.start_date desc, e.created_at desc
      )
      select s.id::text as id, s.code, c.full_name as name, c.phone_display as phone,
        le.program, le.teacher
      from erp.students s join erp.contacts c on c.id = s.contact_id
      left join latest_enrollment le on le.student_id = s.id
      where s.lifecycle_status <> 'DECLINED'::"erp"."StudentLifecycleStatus"
      order by c.full_name asc limit 500
    `),
    permissions.canManageFinance
      ? prisma.financeExpenseCategory.findMany({ orderBy: [{ isSystem: "desc" }, { name: "asc" }] })
      : Promise.resolve([]),
    prisma.$queryRaw<Array<{ eventType: string }>>(Prisma.sql`
      select distinct coalesce(category, event_type::text) as "eventType"
      from erp.workshop_events
      order by "eventType"
    `),
  ]);

  const eventRow = eventRows[0];
  if (!eventRow) return null;
  const event = mapEventRow(eventRow, permissions.canViewFinance);
  const participantTotal = toNumber(participantRows[0]?.totalCount ?? 0);

  return {
    defaultDate: toDateInput(new Date()),
    permissions,
    activeTab: filters.tab,
    event,
    summary: {
      revenue: event.revenue,
      expense: event.expense,
      netProfit: event.netProfit,
      expected: event.expected,
    },
    participants: participantRows.map(mapParticipantRow),
    payments: paymentRows.map(mapPaymentRow),
    expenses: expenseRows.map(mapExpenseRow),
    students: students.map((student) => ({
      id: student.id,
      name: student.name,
      code: student.code,
      phone: student.phone ?? "",
      program: student.program ?? "Proqram seçilməyib",
      teacher: student.teacher ?? "Müəllim seçilməyib",
      label: `${student.name} / ${student.code}`,
    })),
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
      description: category.description ?? "",
    })),
    eventTypes: uniqueEventTypeOptions(eventTypeRows.map((row) => row.eventType)),
    participantFilters: {
      query: filters.query,
      paymentState: filters.paymentState,
      participantType: filters.participantType,
      page: filters.page,
      pageSize: filters.pageSize,
    },
    participantPagination: makePagination(filters.page, filters.pageSize, participantTotal),
  };
}

function buildEventConditions(filters: NormalizedWorkshopFilters) {
  const conditions: Prisma.Sql[] = [];
  if (filters.dateRange !== "all") {
    conditions.push(
      Prisma.sql`er.event_date >= ${new Date(`${filters.from}T00:00:00.000Z`)}`,
      Prisma.sql`er.event_date <= ${new Date(`${filters.to}T00:00:00.000Z`)}`,
    );
  }
  if (filters.query) {
    const like = `%${filters.query}%`;
    conditions.push(Prisma.sql`(
      er.title ilike ${like} or coalesce(er.instructor, '') ilike ${like}
      or coalesce(er.room, '') ilike ${like}
      or exists (
        select 1 from erp.workshop_participants wp
        where wp.event_id = er.id and (wp.full_name ilike ${like} or coalesce(wp.phone, '') ilike ${like})
      )
    )`);
  }
  if (filters.type !== "all") {
    conditions.push(Prisma.sql`(
      er.category = ${filters.type}
      or (er.category is null and er.event_type::text = ${filters.type})
    )`);
  }
  if (filters.status !== "all") conditions.push(Prisma.sql`er.status::text = ${filters.status}`);
  if (filters.instructor) conditions.push(Prisma.sql`er.instructor = ${filters.instructor}`);
  if (filters.room) conditions.push(Prisma.sql`er.room = ${filters.room}`);
  if (filters.collection === "unpaid") conditions.push(Prisma.sql`er.potential_revenue > 0 and er.revenue = 0`);
  if (filters.collection === "advance") conditions.push(Prisma.sql`er.revenue > 0 and er.revenue < er.potential_revenue`);
  if (filters.collection === "paid") conditions.push(Prisma.sql`er.potential_revenue > 0 and er.revenue >= er.potential_revenue`);
  if (filters.collection === "gift") conditions.push(Prisma.sql`er.gift_count > 0`);
  if (filters.profitability === "profit") conditions.push(Prisma.sql`er.revenue - er.expense > 0`);
  if (filters.profitability === "loss") conditions.push(Prisma.sql`er.revenue - er.expense < 0`);
  if (filters.profitability === "breakeven") conditions.push(Prisma.sql`er.revenue - er.expense = 0`);
  return conditions;
}

function getEventSortSql(sort: NormalizedWorkshopFilters["sort"]) {
  switch (sort) {
    case "newest": return Prisma.sql`er.event_date desc, er.start_time desc`;
    case "revenue": return Prisma.sql`er.revenue desc, er.event_date desc`;
    case "expense": return Prisma.sql`er.expense desc, er.event_date desc`;
    case "profit": return Prisma.sql`(er.revenue - er.expense) desc, er.event_date desc`;
    case "participants": return Prisma.sql`er.participant_count desc, er.event_date desc`;
    default:
      return Prisma.sql`case when er.status in ('DRAFT'::"erp"."WorkshopEventStatus", 'SCHEDULED'::"erp"."WorkshopEventStatus", 'ACTIVE'::"erp"."WorkshopEventStatus") then 0 else 1 end, er.event_date asc, er.start_time asc`;
  }
}

function mapEventRow(row: EventDbRow, canViewFinance: boolean): WorkshopEventRow {
  const revenue = canViewFinance ? toNumber(row.revenue) : 0;
  const expense = canViewFinance ? toNumber(row.expense) : 0;
  const potential = canViewFinance ? toNumber(row.potentialRevenue) : 0;
  const participantCount = toNumber(row.participantCount);
  const capacity = row.capacity ?? null;
  return {
    id: row.id,
    title: row.title,
    eventType: row.eventType,
    eventTypeKind: row.eventTypeKind,
    eventTypeLabel: formatEventType(row.eventType),
    status: row.status,
    statusLabel: formatEventStatus(row.status),
    statusTone: getEventStatusTone(row.status),
    date: formatDisplayDate(row.eventDate),
    dateValue: row.dateValue,
    time: row.startTime,
    duration: `${row.durationMinutes} dəq`,
    durationMinutes: row.durationMinutes,
    room: row.room ?? "Məkan seçilməyib",
    instructor: row.instructor ?? "Təlimçi seçilməyib",
    capacity,
    entryPrice: financeAmount(toNumber(row.entryPrice), canViewFinance),
    entryPriceInput: formatDecimalInput(row.entryPrice),
    revenue: financeAmount(revenue, canViewFinance),
    revenueValue: revenue,
    expense: financeAmount(expense, canViewFinance),
    expenseValue: expense,
    netProfit: financeAmount(revenue - expense, canViewFinance),
    netProfitValue: revenue - expense,
    expected: financeAmount(Math.max(potential - revenue, 0), canViewFinance),
    expectedValue: Math.max(potential - revenue, 0),
    potentialRevenue: financeAmount(potential, canViewFinance),
    potentialRevenueValue: potential,
    participantCount,
    paidCount: toNumber(row.paidCount),
    advanceCount: toNumber(row.advanceCount),
    unpaidCount: toNumber(row.unpaidCount),
    giftCount: toNumber(row.giftCount),
    fillRate: capacity && capacity > 0 ? Math.min(100, Math.round((participantCount / capacity) * 100)) : 0,
    note: row.note ?? "",
  };
}

function mapParticipantRow(row: ParticipantDbRow): WorkshopParticipantRow {
  const finance = calculateWorkshopParticipantFinance({
    listPrice: toNumber(row.listPrice),
    discountAmount: toNumber(row.discountAmount),
    activePaid: toNumber(row.paid),
    isGift: row.isGift,
    isCancelled: Boolean(row.cancelledAt),
  });
  const { listPrice, discountAmount: discount, netPrice, activePaid: paid, balance, state } = finance;
  const presentation = paymentStatePresentation(state);
  return {
    id: row.id,
    eventId: row.eventId,
    studentId: row.studentId ?? "",
    kind: row.studentId ? "student" : "guest",
    fullName: row.fullName,
    phone: row.phone ?? "-",
    email: row.email ?? "-",
    listPrice: formatAmount(listPrice),
    listPriceInput: formatDecimalInput(listPrice),
    discountAmount: formatAmount(discount),
    discountAmountInput: formatDecimalInput(discount),
    netPrice: formatAmount(netPrice),
    paid: formatAmount(paid),
    paidValue: paid,
    balance: formatAmount(balance),
    balanceValue: balance,
    paymentState: state,
    paymentLabel: presentation.label,
    paymentTone: presentation.tone,
    isGift: row.isGift,
    note: row.note ?? "",
    assignedAt: formatDateTime(row.assignedAt),
    cancelledAt: row.cancelledAt ? formatDateTime(row.cancelledAt) : "",
  };
}

function mapPaymentRow(row: PaymentDbRow): WorkshopPaymentRow {
  const isVoided = Boolean(row.voidedAt);
  return {
    id: row.id,
    eventId: row.eventId,
    participantId: row.participantId,
    participantName: row.participantName,
    amount: formatAmount(row.amount),
    amountInput: formatDecimalInput(row.amount),
    amountValue: toNumber(row.amount),
    paidAt: formatDisplayDate(row.paidAt),
    paidAtValue: row.paidAtValue,
    method: getStudentPaymentMethodLabel(row.method),
    methodValue: row.method,
    payerName: row.payerName ?? row.participantName,
    receipt: row.receiptReference ?? row.receiptFileName ?? "-",
    receiptFilePath: row.receiptFilePath ?? "",
    note: row.note ?? "-",
    statusLabel: isVoided ? "Ləğv edilib" : "Aktiv",
    statusTone: isVoided ? "danger" : "success",
    voidReason: row.voidReason ?? "",
  };
}

function mapExpenseRow(row: ExpenseDbRow): WorkshopExpenseRow {
  const isVoided = Boolean(row.voidedAt);
  return {
    id: row.id,
    eventId: row.eventId,
    categoryId: row.categoryId,
    category: row.category,
    amount: formatAmount(row.amount),
    amountInput: formatDecimalInput(row.amount),
    amountValue: toNumber(row.amount),
    expenseDate: formatDisplayDate(row.expenseDate),
    expenseDateValue: row.expenseDateValue,
    method: getStudentPaymentMethodLabel(row.method),
    methodValue: row.method,
    vendor: row.vendor ?? "-",
    receipt: row.receiptReference ?? row.receiptFileName ?? "-",
    receiptFilePath: row.receiptFilePath ?? "",
    description: row.description ?? "-",
    statusLabel: isVoided ? "Ləğv edilib" : "Aktiv",
    statusTone: isVoided ? "danger" : "success",
    voidReason: row.voidReason ?? "",
  };
}

function normalizeWorkshopFilters(input: WorkshopFilters): NormalizedWorkshopFilters {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    query: formFilterString(input.q),
    type: normalizeEventTypeFilter(input.type),
    status: ["DRAFT", "SCHEDULED", "ACTIVE", "COMPLETED", "CANCELLED"].includes(input.status ?? "")
      ? input.status as WorkshopStatus : "all",
    dateRange: input.dateRange === "month" ? "month" : "all",
    from: normalizeDateInput(input.from) ?? toDateInput(monthStart),
    to: normalizeDateInput(input.to) ?? toDateInput(monthEnd),
    instructor: formFilterString(input.instructor),
    room: formFilterString(input.room),
    collection: ["unpaid", "advance", "paid", "gift"].includes(input.collection ?? "")
      ? input.collection as NormalizedWorkshopFilters["collection"] : "all",
    profitability: ["profit", "loss", "breakeven"].includes(input.profitability ?? "")
      ? input.profitability as NormalizedWorkshopFilters["profitability"] : "all",
    sort: ["upcoming", "newest", "revenue", "expense", "profit", "participants"].includes(input.sort ?? "")
      ? input.sort as NormalizedWorkshopFilters["sort"] : "upcoming",
    page: boundedInt(input.page, 1, 10_000, 1),
    pageSize: [10, 25, 50, 100].includes(Number(input.pageSize)) ? Number(input.pageSize) : 25,
    selected: formFilterString(input.selected),
  };
}

function normalizeDetailFilters(input: WorkshopDetailFilters) {
  const tabs = ["overview", "participants", "payments", "expenses", "details"] as const;
  const tab = tabs.includes(input.tab as (typeof tabs)[number])
    ? input.tab as (typeof tabs)[number]
    : "overview";
  return {
    tab,
    query: formFilterString(input.q),
    paymentState: ["all", "gift", "unpaid", "advance", "paid", "cancelled"].includes(input.paymentState ?? "")
      ? input.paymentState ?? "all" : "all",
    participantType: ["all", "student", "guest"].includes(input.participantType ?? "")
      ? input.participantType ?? "all" : "all",
    page: boundedInt(input.page, 1, 10_000, 1),
    pageSize: [10, 25, 50, 100].includes(Number(input.pageSize)) ? Number(input.pageSize) : 25,
  };
}

function getWorkshopPermissions(permissions: ReadonlyMap<string, unknown>): WorkshopPermissions {
  return {
    canManage: permissions.has("workshop.manage"),
    canViewFinance: permissions.has("workshop.finance.read"),
    canManageFinance: permissions.has("workshop.finance.manage"),
  };
}

function uniqueOptions(values: Array<string | null>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
    .sort((a, b) => a.localeCompare(b, "az"))
    .map((value) => ({ value, label: value }));
}

function uniqueEventTypeOptions(values: string[]) {
  return [...new Set(["WORKSHOP", "MASTERCLASS", ...values].filter(Boolean))]
    .sort((a, b) => formatEventType(a).localeCompare(formatEventType(b), "az"))
    .map((value) => ({ value, label: formatEventType(value) }));
}

function normalizeEventTypeFilter(value: string | undefined) {
  const normalized = formFilterString(value);
  return normalized && normalized !== "all" ? normalized.slice(0, 80) : "all";
}

function makePagination(page: number, pageSize: number, total: number): Pagination {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return { page, pageSize, total, totalPages, hasPrevious: page > 1, hasNext: page < totalPages };
}

function boundedInt(value: string | undefined, min: number, max: number, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function normalizeDateInput(value: string | undefined) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function paymentStatePresentation(state: ParticipantPaymentState) {
  switch (state) {
    case "GIFT": return { label: "Hədiyyə", tone: "info" as const };
    case "ADVANCE": return { label: "Avans", tone: "warning" as const };
    case "PAID": return { label: "Ödənilib", tone: "success" as const };
    case "CANCELLED": return { label: "Ləğv edilib", tone: "danger" as const };
    default: return { label: "Ödənilməyib", tone: "neutral" as const };
  }
}

export function formatEventType(value: WorkshopKind | string) {
  if (value === "MASTERCLASS") return "Masterclass";
  if (value === "WORKSHOP") return "Workshop";
  return value;
}

function formatEventStatus(value: WorkshopStatus) {
  switch (value) {
    case "DRAFT": return "Qaralama";
    case "ACTIVE": return "Aktiv";
    case "COMPLETED": return "Tamamlandı";
    case "CANCELLED": return "Ləğv edildi";
    default: return "Planlı";
  }
}

function getEventStatusTone(value: WorkshopStatus): StatusTone {
  if (value === "ACTIVE") return "success";
  if (value === "COMPLETED") return "info";
  if (value === "CANCELLED") return "danger";
  if (value === "DRAFT") return "warning";
  return "info";
}

function financeAmount(value: number, canViewFinance: boolean) {
  return canViewFinance ? formatAmount(value) : "—";
}

function formatDecimalInput(value: unknown) {
  const amount = toNumber(value);
  return amount > 0 ? amount.toFixed(2) : "0";
}

function toDateInput(value: Date) {
  return [value.getFullYear(), String(value.getMonth() + 1).padStart(2, "0"), String(value.getDate()).padStart(2, "0")].join("-");
}

function formatDisplayDate(value: Date | string) {
  return new Intl.DateTimeFormat("az-AZ", { day: "2-digit", month: "short", year: "numeric" })
    .format(value instanceof Date ? value : new Date(value));
}

function formatDateTime(value: Date | string) {
  return new Intl.DateTimeFormat("az-AZ", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
    .format(value instanceof Date ? value : new Date(value));
}
