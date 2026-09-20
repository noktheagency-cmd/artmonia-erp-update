import type { EffectivePermissions, PermissionCode } from "@/server/rbac/permissions";

const dailyReportViewers = new Set([
  "f74ddcf3-fed2-4d36-86e5-5e75ab94f225", // Vaqif
  "d0fb9ad2-ec06-4bc6-8dc9-5c037775486a", // İsmət
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
