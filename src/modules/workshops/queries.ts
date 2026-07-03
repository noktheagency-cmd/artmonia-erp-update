import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/server/db/prisma";
import { requireErpActor } from "@/server/auth/actor";
import { formatAmount, formatCount, toNumber } from "@/modules/shared/format";
import { getStudentPaymentMethodLabel } from "@/modules/students/payment-method";

type StatusTone = "success" | "warning" | "danger" | "neutral" | "info";
type WorkshopKind = "WORKSHOP" | "MASTERCLASS";
type WorkshopStatus = "DRAFT" | "SCHEDULED" | "COMPLETED" | "CANCELLED";

export type WorkshopEventRow = {
  id: string;
  title: string;
  eventType: WorkshopKind;
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
  potentialRevenue: string;
  potentialRevenueValue: number;
  remainingRevenue: string;
  participantCount: number;
  paidCount: number;
  discountedCount: number;
  giftCount: number;
  fillRate: number;
  note: string;
};

export type WorkshopParticipantRow = {
  id: string;
  eventId: string;
  eventTitle: string;
  eventDate: string;
  eventTypeLabel: string;
  studentId: string;
  fullName: string;
  phone: string;
  listPrice: string;
  amountPaid: string;
  amountPaidValue: number;
  discountAmount: string;
  paymentMethod: string;
  isPaid: boolean;
  isDiscounted: boolean;
  isGift: boolean;
  paymentLabel: string;
  paymentTone: StatusTone;
  note: string;
  assignedAt: string;
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

export type WorkshopData = {
  defaultDate: string;
  permissions: {
    canManage: boolean;
  };
  summary: {
    revenue: string;
    potentialRevenue: string;
    unpaidRevenue: string;
    eventCount: string;
    participantCount: string;
    giftCount: string;
  };
  kpis: Array<{
    label: string;
    value: string;
    helper: string;
    tone: StatusTone;
  }>;
  events: WorkshopEventRow[];
  participants: WorkshopParticipantRow[];
  students: WorkshopStudentOption[];
  eventOptions: Array<{
    value: string;
    label: string;
    searchText: string;
    price: string;
  }>;
};

type EventDbRow = {
  id: string;
  title: string;
  eventType: WorkshopKind;
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
  discountedCount: unknown;
  giftCount: unknown;
  revenue: unknown;
};

type ParticipantDbRow = {
  id: string;
  eventId: string;
  eventTitle: string;
  eventDate: Date | string;
  eventType: WorkshopKind;
  studentId: string | null;
  fullName: string;
  phone: string | null;
  listPrice: unknown;
  amountPaid: unknown;
  discountAmount: unknown;
  paymentMethod: string;
  isPaid: boolean;
  isDiscounted: boolean;
  isGift: boolean;
  note: string | null;
  assignedAt: Date | string;
};

type StudentDbRow = {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  program: string | null;
  teacher: string | null;
};

const upcomingStatuses = ["DRAFT", "SCHEDULED"];

export async function getWorkshopData(): Promise<WorkshopData> {
  const actor = await requireErpActor("workshop.read");
  const prisma = getPrisma();

  const [eventRows, participantRows, studentRows] = await Promise.all([
    prisma.$queryRaw<EventDbRow[]>(Prisma.sql`
      select
        we.id::text as "id",
        we.title,
        we.event_type::text as "eventType",
        we.status::text as "status",
        we.event_date as "eventDate",
        to_char(we.event_date, 'YYYY-MM-DD') as "dateValue",
        we.start_time as "startTime",
        we.duration_minutes as "durationMinutes",
        we.room,
        we.instructor,
        we.capacity,
        we.entry_price as "entryPrice",
        we.note,
        coalesce(count(wp.id), 0)::int as "participantCount",
        coalesce(count(wp.id) filter (where wp.is_paid = true and wp.is_gift = false), 0)::int as "paidCount",
        coalesce(count(wp.id) filter (where wp.is_discounted = true), 0)::int as "discountedCount",
        coalesce(count(wp.id) filter (where wp.is_gift = true), 0)::int as "giftCount",
        coalesce(sum(wp.amount_paid) filter (where wp.is_paid = true and wp.is_gift = false), 0) as "revenue"
      from erp.workshop_events we
      left join erp.workshop_participants wp on wp.event_id = we.id
      group by we.id
      order by
        case when we.status in ('DRAFT'::"erp"."WorkshopEventStatus", 'SCHEDULED'::"erp"."WorkshopEventStatus") then 0 else 1 end,
        we.event_date asc,
        we.start_time asc,
        we.created_at desc
      limit 80
    `),
    prisma.$queryRaw<ParticipantDbRow[]>(Prisma.sql`
      select
        wp.id::text as "id",
        wp.event_id::text as "eventId",
        we.title as "eventTitle",
        we.event_date as "eventDate",
        we.event_type::text as "eventType",
        wp.student_id::text as "studentId",
        wp.full_name as "fullName",
        wp.phone,
        wp.list_price as "listPrice",
        wp.amount_paid as "amountPaid",
        wp.discount_amount as "discountAmount",
        wp.payment_method::text as "paymentMethod",
        wp.is_paid as "isPaid",
        wp.is_discounted as "isDiscounted",
        wp.is_gift as "isGift",
        wp.note,
        wp.assigned_at as "assignedAt"
      from erp.workshop_participants wp
      join erp.workshop_events we on we.id = wp.event_id
      order by wp.assigned_at desc
      limit 240
    `),
    prisma.$queryRaw<StudentDbRow[]>(Prisma.sql`
      with latest_enrollment as (
        select distinct on (e.student_id)
          e.student_id,
          p.name as program,
          t.full_name as teacher
        from erp.enrollments e
        join erp.programs p on p.id = e.program_id
        left join erp.teachers t on t.id = e.teacher_id
        where e.status in ('ACTIVE'::"erp"."EnrollmentStatus", 'PAUSED'::"erp"."EnrollmentStatus")
        order by e.student_id, e.start_date desc, e.created_at desc
      )
      select
        s.id::text as "id",
        s.code,
        c.full_name as "name",
        c.phone_display as "phone",
        le.program,
        le.teacher
      from erp.students s
      join erp.contacts c on c.id = s.contact_id
      left join latest_enrollment le on le.student_id = s.id
      where s.lifecycle_status <> 'DECLINED'::"erp"."StudentLifecycleStatus"
      order by c.full_name asc, s.code asc
      limit 350
    `),
  ]);

  const events = eventRows.map(mapEventRow);
  const participants = participantRows.map(mapParticipantRow);
  const revenue = events.reduce((sum, event) => sum + event.revenueValue, 0);
  const potentialRevenue = events.reduce((sum, event) => sum + event.potentialRevenueValue, 0);
  const giftCount = participants.filter((participant) => participant.isGift).length;
  const unpaidRevenue = Math.max(potentialRevenue - revenue, 0);

  return {
    defaultDate: toDateInput(new Date()),
    permissions: {
      canManage: actor.permissions.has("workshop.manage"),
    },
    summary: {
      revenue: formatAmount(revenue),
      potentialRevenue: formatAmount(potentialRevenue),
      unpaidRevenue: formatAmount(unpaidRevenue),
      eventCount: formatCount(events.length),
      participantCount: formatCount(participants.length),
      giftCount: formatCount(giftCount),
    },
    kpis: [
      {
        label: "Tədbir gəliri",
        value: formatAmount(revenue),
        helper: `${formatCount(participants.filter((item) => item.isPaid && !item.isGift).length)} ödənişli iştirakçı`,
        tone: "success",
      },
      {
        label: "Potensial",
        value: formatAmount(potentialRevenue),
        helper: "List qiyməti ilə hesablanır",
        tone: "info",
      },
      {
        label: "İştirakçılar",
        value: formatCount(participants.length),
        helper: `${formatCount(giftCount)} hədiyyə, ${formatCount(participants.filter((item) => item.isDiscounted).length)} endirimli`,
        tone: "neutral",
      },
      {
        label: "Açıq tədbirlər",
        value: formatCount(events.filter((event) => upcomingStatuses.includes(event.status)).length),
        helper: `${formatCount(events.length)} ümumi tədbir`,
        tone: "warning",
      },
    ],
    events,
    participants,
    students: studentRows.map((student) => ({
      id: student.id,
      name: student.name,
      code: student.code,
      phone: student.phone ?? "",
      program: student.program ?? "Proqram seçilməyib",
      teacher: student.teacher ?? "Müəllim seçilməyib",
      label: `${student.name} / ${student.code}`,
    })),
    eventOptions: events.map((event) => ({
      value: event.id,
      label: `${event.title} / ${event.eventTypeLabel} / ${event.date}`,
      searchText: [event.room, event.instructor, event.statusLabel, event.entryPrice].join(" "),
      price: event.entryPriceInput,
    })),
  };
}

function mapEventRow(row: EventDbRow): WorkshopEventRow {
  const entryPrice = toNumber(row.entryPrice);
  const participantCount = toNumber(row.participantCount);
  const revenue = toNumber(row.revenue);
  const potentialRevenue = entryPrice * participantCount;
  const capacity = row.capacity ?? null;
  const fillRate = capacity && capacity > 0 ? Math.min(100, Math.round((participantCount / capacity) * 100)) : 0;

  return {
    id: row.id,
    title: row.title,
    eventType: row.eventType,
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
    entryPrice: formatAmount(entryPrice),
    entryPriceInput: formatDecimalInput(entryPrice),
    revenue: formatAmount(revenue),
    revenueValue: revenue,
    potentialRevenue: formatAmount(potentialRevenue),
    potentialRevenueValue: potentialRevenue,
    remainingRevenue: formatAmount(Math.max(potentialRevenue - revenue, 0)),
    participantCount,
    paidCount: toNumber(row.paidCount),
    discountedCount: toNumber(row.discountedCount),
    giftCount: toNumber(row.giftCount),
    fillRate,
    note: row.note ?? "",
  };
}

function mapParticipantRow(row: ParticipantDbRow): WorkshopParticipantRow {
  const amountPaid = toNumber(row.amountPaid);
  const payment = getPaymentState(row);

  return {
    id: row.id,
    eventId: row.eventId,
    eventTitle: row.eventTitle,
    eventDate: formatDisplayDate(row.eventDate),
    eventTypeLabel: formatEventType(row.eventType),
    studentId: row.studentId ?? "",
    fullName: row.fullName,
    phone: row.phone ?? "-",
    listPrice: formatAmount(row.listPrice),
    amountPaid: formatAmount(amountPaid),
    amountPaidValue: amountPaid,
    discountAmount: formatAmount(row.discountAmount),
    paymentMethod: getStudentPaymentMethodLabel(row.paymentMethod),
    isPaid: row.isPaid,
    isDiscounted: row.isDiscounted,
    isGift: row.isGift,
    paymentLabel: payment.label,
    paymentTone: payment.tone,
    note: row.note ?? "",
    assignedAt: formatDateTime(row.assignedAt),
  };
}

function getPaymentState(row: Pick<ParticipantDbRow, "isGift" | "isPaid" | "isDiscounted">) {
  if (row.isGift) {
    return { label: "Hədiyyə", tone: "info" as const };
  }

  if (row.isPaid && row.isDiscounted) {
    return { label: "Endirimli ödəniş", tone: "warning" as const };
  }

  if (row.isPaid) {
    return { label: "Ödənilib", tone: "success" as const };
  }

  return { label: "Ödənilməyib", tone: "neutral" as const };
}

export function formatEventType(value: WorkshopKind | string) {
  return value === "MASTERCLASS" ? "Masterclass" : "Workshop";
}

function formatEventStatus(value: WorkshopStatus) {
  switch (value) {
    case "DRAFT":
      return "Qaralama";
    case "COMPLETED":
      return "Tamamlandı";
    case "CANCELLED":
      return "Ləğv edildi";
    default:
      return "Planlı";
  }
}

function getEventStatusTone(value: WorkshopStatus): StatusTone {
  if (value === "COMPLETED") {
    return "success";
  }

  if (value === "CANCELLED") {
    return "danger";
  }

  if (value === "DRAFT") {
    return "warning";
  }

  return "info";
}

function formatDecimalInput(value: unknown) {
  const amount = toNumber(value);
  return amount > 0 ? amount.toFixed(2) : "";
}

function toDateInput(value: Date) {
  return [
    value.getFullYear().toString(),
    (value.getMonth() + 1).toString().padStart(2, "0"),
    value.getDate().toString().padStart(2, "0"),
  ].join("-");
}

function formatDisplayDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("az-AZ", {
    day: "2-digit",
    month: "short",
  }).format(date);
}

function formatDateTime(value: Date | string) {
  return new Intl.DateTimeFormat("az-AZ", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
