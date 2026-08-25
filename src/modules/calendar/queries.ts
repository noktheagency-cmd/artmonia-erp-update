import { AppRole } from "@/generated/prisma/client";
import { getPrisma } from "@/server/db/prisma";
import type { ErpActor } from "@/server/auth/actor";
import { hasPermission } from "@/server/rbac/permissions";

export const calendarEventKinds = ["task", "workshop", "lesson", "content", "invoice"] as const;

export type CalendarEventKind = (typeof calendarEventKinds)[number];

export type ErpCalendarEvent = {
  id: string;
  kind: CalendarEventKind;
  title: string;
  meta: string;
  date: string;
  time: string;
  href: string;
  status: string;
};

export type ErpCalendarResponse = {
  month: string;
  events: ErpCalendarEvent[];
  counts: Partial<Record<CalendarEventKind, number>>;
};

const weekdayByIndex = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
] as const;

export async function getErpCalendarData(
  actor: ErpActor,
  month: string,
): Promise<ErpCalendarResponse> {
  const prisma = getPrisma();
  const { start, end } = monthBounds(month);
  const canViewAllTasks = actor.roles.includes(AppRole.SUPER_ADMIN);

  const [tasks, workshops, contentItems, invoices, slots, sessions] = await Promise.all([
    hasPermission(actor.permissions, "task.read")
      ? prisma.task.findMany({
          where: {
            ...(canViewAllTasks ? {} : { ownerUserId: actor.id }),
            dueAt: { gte: start, lt: end },
          },
          orderBy: [{ dueAt: "asc" }, { priority: "asc" }],
          take: 300,
          select: {
            id: true,
            title: true,
            dueAt: true,
            status: true,
            priority: true,
            ownerUser: { select: { fullName: true } },
          },
        })
      : Promise.resolve([]),
    hasPermission(actor.permissions, "workshop.read")
      ? prisma.workshopEvent.findMany({
          where: { eventDate: { gte: start, lt: end } },
          orderBy: [{ eventDate: "asc" }, { startTime: "asc" }],
          take: 200,
          select: {
            id: true,
            title: true,
            eventDate: true,
            startTime: true,
            status: true,
            room: true,
            instructor: true,
          },
        })
      : Promise.resolve([]),
    hasPermission(actor.permissions, "marketing.read")
      ? prisma.marketingContentItem.findMany({
          where: { scheduledAt: { gte: start, lt: end } },
          orderBy: { scheduledAt: "asc" },
          take: 250,
          select: {
            id: true,
            title: true,
            platform: true,
            status: true,
            scheduledAt: true,
            responsible: { select: { fullName: true } },
          },
        })
      : Promise.resolve([]),
    hasPermission(actor.permissions, "billing.invoice.read") && hasPermission(actor.permissions, "student.read")
      ? prisma.invoice.findMany({
          where: {
            dueDate: { gte: start, lt: end },
            balanceDue: { gt: 0 },
          },
          orderBy: [{ dueDate: "asc" }, { balanceDue: "desc" }],
          take: 300,
          select: {
            id: true,
            dueDate: true,
            balanceDue: true,
            status: true,
            student: {
              select: {
                id: true,
                code: true,
                contact: { select: { fullName: true } },
              },
            },
          },
        })
      : Promise.resolve([]),
    hasPermission(actor.permissions, "group.read")
      ? prisma.classSlot.findMany({
          where: { validFrom: { lt: end } },
          orderBy: [{ weekday: "asc" }, { startTime: "asc" }],
          take: 250,
          select: {
            id: true,
            displayName: true,
            weekday: true,
            startTime: true,
            endTime: true,
            room: true,
            validFrom: true,
            teacher: { select: { fullName: true } },
          },
        })
      : Promise.resolve([]),
    hasPermission(actor.permissions, "group.read")
      ? prisma.slotSession.findMany({
          where: { sessionDate: { gte: start, lt: end } },
          take: 800,
          select: {
            slotId: true,
            sessionDate: true,
            title: true,
            status: true,
            startTime: true,
            endTime: true,
            locationOverride: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const events: ErpCalendarEvent[] = [
    ...tasks.flatMap((task) => task.dueAt ? [{
      id: `task:${task.id}`,
      kind: "task" as const,
      title: task.title,
      meta: `${task.ownerUser?.fullName ?? "Təyin edilməyib"} · ${priorityLabel(task.priority)}`,
      date: dateKey(task.dueAt),
      time: timeKey(task.dueAt),
      href: `/tasks?task=${task.id}`,
      status: task.status,
    }] : []),
    ...workshops.map((event) => ({
      id: `workshop:${event.id}`,
      kind: "workshop" as const,
      title: event.title,
      meta: [event.instructor, event.room].filter(Boolean).join(" · ") || "Workshop",
      date: dateKey(event.eventDate),
      time: event.startTime,
      href: `/workshops/${event.id}`,
      status: event.status,
    })),
    ...contentItems.flatMap((item) => item.scheduledAt ? [{
      id: `content:${item.id}`,
      kind: "content" as const,
      title: item.title,
      meta: [item.platform, item.responsible?.fullName].filter(Boolean).join(" · "),
      date: bakuDateKey(item.scheduledAt),
      time: bakuTimeKey(item.scheduledAt),
      href: `/marketing?view=content&month=${bakuDateKey(item.scheduledAt).slice(0, 7)}&content=${item.id}`,
      status: item.status,
    }] : []),
    ...invoices.map((invoice) => ({
      id: `invoice:${invoice.id}`,
      kind: "invoice" as const,
      title: invoice.student.contact.fullName,
      meta: `${invoice.student.code} · ${Number(invoice.balanceDue).toFixed(2)} ₼ qalıq`,
      date: dateKey(invoice.dueDate),
      time: "",
      href: `/students/${invoice.student.id}`,
      status: invoice.status,
    })),
    ...buildSlotEvents(slots, sessions, start, end),
  ].sort((left, right) =>
    left.date.localeCompare(right.date)
    || left.time.localeCompare(right.time)
    || left.title.localeCompare(right.title, "az"),
  );

  const counts = events.reduce<ErpCalendarResponse["counts"]>((result, event) => {
    result[event.kind] = (result[event.kind] ?? 0) + 1;
    return result;
  }, {});

  return { month, events, counts };
}

function buildSlotEvents(
  slots: Array<{
    id: string;
    displayName: string | null;
    weekday: (typeof weekdayByIndex)[number];
    startTime: string;
    endTime: string;
    room: string | null;
    validFrom: Date;
    teacher: { fullName: string } | null;
  }>,
  sessions: Array<{
    slotId: string;
    sessionDate: Date;
    title: string | null;
    status: string;
    startTime: string;
    endTime: string;
    locationOverride: string | null;
  }>,
  start: Date,
  end: Date,
) {
  const sessionBySlotDate = new Map(
    sessions.map((session) => [`${session.slotId}:${dateKey(session.sessionDate)}`, session] as const),
  );
  const events: ErpCalendarEvent[] = [];

  for (const slot of slots) {
    const cursor = new Date(Math.max(start.getTime(), slot.validFrom.getTime()));
    cursor.setUTCHours(0, 0, 0, 0);

    while (cursor < end) {
      if (weekdayByIndex[cursor.getUTCDay()] === slot.weekday) {
        const date = dateKey(cursor);
        const session = sessionBySlotDate.get(`${slot.id}:${date}`);
        events.push({
          id: `lesson:${slot.id}:${date}`,
          kind: "lesson",
          title: session?.title || slot.displayName || slot.teacher?.fullName || "Dərs slotu",
          meta: [slot.teacher?.fullName, session?.locationOverride || slot.room, session ? `${session.startTime}–${session.endTime}` : `${slot.startTime}–${slot.endTime}`]
            .filter(Boolean)
            .join(" · "),
          date,
          time: session?.startTime || slot.startTime,
          href: `/groups?slot=${slot.id}&date=${date}&details=1`,
          status: session?.status || "SCHEDULED",
        });
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }

  return events;
}

function monthBounds(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return {
    start: new Date(Date.UTC(year, monthNumber - 1, 1)),
    end: new Date(Date.UTC(year, monthNumber, 1)),
  };
}

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function timeKey(value: Date) {
  const time = value.toISOString().slice(11, 16);
  return time === "00:00" || time === "12:00" ? "" : time;
}

function bakuDateKey(value: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Baku",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function bakuTimeKey(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Baku",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(value);
}

function priorityLabel(value: string) {
  if (value === "URGENT") return "Təcili";
  if (value === "LOW") return "Aşağı prioritet";
  return "Normal prioritet";
}
