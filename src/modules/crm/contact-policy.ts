import { z } from "zod";
import { dailyReportWindow } from "@/modules/dashboard/daily-report-policy";
import { nextActionTypeOptions } from "./follow-up";

export const contactChannels = { PHONE: "Telefon", WHATSAPP: "WhatsApp", IN_PERSON: "Üzbəüz", OTHER: "Digər" };
export const contactOutcomes = { TALKED: "Danışıldı", UNANSWERED: "Cavabsız" };
export const contactSchema = z.object({
  idempotencyKey: z.string().uuid(), leadId: z.string().uuid(),
  channel: z.enum(["PHONE", "WHATSAPP", "IN_PERSON", "OTHER"]),
  outcome: z.enum(["TALKED", "UNANSWERED"]),
  occurredAt: z.iso.datetime({ offset: true }),
  nextActionType: z.enum(nextActionTypeOptions),
  nextDate: z.iso.date(),
  note: z.string().trim().max(500).default(""),
});

export function assertContactTime(occurredAt: Date, now = new Date()) {
  if (occurredAt > now || dailyReportWindow(occurredAt).date !== dailyReportWindow(now).date) {
    throw new Error("Əlaqə nəticəsi üçün bugünkü faktiki vaxtı seçin. Keçmiş gün düzəlişi ayrıca yoxlanmalıdır.");
  }
}

export function nextUnansweredDate(firstAttempt: Date, now = new Date(), attempts = 0) {
  const first = dailyReportWindow(firstAttempt).start.getTime();
  const today = dailyReportWindow(now).start.getTime();
  if (today === first && attempts < 2) return dailyReportWindow(now).date;
  const offset = today < first + 3 * 86_400_000 ? 3 : 7;
  return dailyReportWindow(new Date(Math.max(today + 86_400_000, first + offset * 86_400_000))).date;
}
