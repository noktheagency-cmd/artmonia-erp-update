import { z } from "zod";

// Resolved ERP account IDs: names/emails and general admin roles cannot grant this permission.
export const BILLING_DEADLINE_EDITORS = new Set([
  "f74ddcf3-fed2-4d36-86e5-5e75ab94f225", // Vaqif
  "d0fb9ad2-ec06-4bc6-8dc9-5c037775486a", // İsmet
]);
export const canEditBillingDeadline = (userId: string) =>
  BILLING_DEADLINE_EDITORS.has(userId);
export const deadlineRuleSchema = z.object({
  studentId: z.string().uuid(),
  requestId: z.string().uuid(),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  mode: z.enum(["FROM_MONTH", "ONLY_MONTH"]),
  day: z.coerce.number().int().min(1).max(31),
  reason: z.string().trim().min(3, "Dəyişiklik səbəbini yazın").max(1000),
});
export type DeadlineRuleInput = z.infer<typeof deadlineRuleSchema>;
export function deadlineForMonth(month: string, day: number) {
  const [year, monthNumber] = month.slice(0, 7).split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return `${month.slice(0, 7)}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}
