import type { EffectivePermissions, PermissionCode } from "@/server/rbac/permissions";
import { z } from "zod";

const dailyReportViewers = new Set([
  "f74ddcf3-fed2-4d36-86e5-5e75ab94f225", // Vaqif
  "d0fb9ad2-ec06-4bc6-8dc9-5c037775486a", // İsmət
  "e070d1cc-346f-4111-8a90-8b33d9e05b8e", // Pashanur
]);

export function canReadDailyReport(id: string, permissions: EffectivePermissions) {
  const required: PermissionCode[] = [
    "dashboard.owner.read", "crm.lead.read", "student.read", "billing.payment.read", "task.read",
  ];
  return dailyReportViewers.has(id) && required.every((permission) => permissions.get(permission) === "ALL");
}

export function dailyReportWindow(now = new Date()) {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baku", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const start = new Date(`${date}T00:00:00+04:00`);
  const end = new Date(start.getTime() + 86_400_000);
  return { date, start, end, tomorrowEnd: new Date(end.getTime() + 86_400_000), nextDate: new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10) };
}

/** Inclusive of today, using Baku calendar days rather than a rolling 72 hours. */
export function recentDailyReportDates(now = new Date()) {
  const { start } = dailyReportWindow(now);
  return [0, 1, 2].map((offset) => dailyReportWindow(new Date(start.getTime() - offset * 86_400_000)).date);
}

export type DailyReportFilter = { from?: string; to?: string; managerId?: string };
export function filteredDailyReportWindow(requestedDate?: string | DailyReportFilter, now = new Date()) {
  const availableDates = recentDailyReportDates(now);
  const input = typeof requestedDate === "string" ? { from: requestedDate, to: requestedDate } : requestedDate ?? {};
  const from = z.iso.date().parse(input.from ?? availableDates[0]);
  const to = z.iso.date().parse(input.to ?? from);
  const first = dailyReportWindow(new Date(`${from}T12:00:00+04:00`));
  const last = dailyReportWindow(new Date(`${to}T12:00:00+04:00`));
  if (from > to || to > availableDates[0] || last.end.getTime() - first.start.getTime() > 31 * 86_400_000) throw new Error("Keçmişdən bu günədək ən çox 31 günlük aralıq seçin.");
  const managerId = input.managerId ? z.string().uuid().parse(input.managerId) : undefined;
  return { ...last, date: from, from, to, start: first.start, availableDates, managerId };
}
