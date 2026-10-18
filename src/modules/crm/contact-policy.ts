import { z } from "zod";
import { dailyReportWindow } from "@/modules/dashboard/daily-report-policy";
import { nextActionTypeOptions } from "./follow-up";

export const contactChannels = {
  PHONE: "Telefon",
  WHATSAPP: "WhatsApp",
  IN_PERSON: "Üzbəüz",
  OTHER: "Digər",
} as const;

/** BK-19: distinct factual outcomes — not stage history. */
export const contactOutcomes = {
  TALKED: "Danışıldı",
  ANSWERED_NO_TALK: "Açdı, danışılmadı",
  UNANSWERED: "Cavab vermədi",
  WHATSAPP_SENT: "Yazıldı",
  WHATSAPP_REPLIED: "Cavab verdi",
} as const;

export type ContactChannel = keyof typeof contactChannels;
export type ContactOutcome = keyof typeof contactOutcomes;

const phoneOutcomes = ["TALKED", "ANSWERED_NO_TALK", "UNANSWERED"] as const;
const whatsappOutcomes = ["WHATSAPP_SENT", "WHATSAPP_REPLIED"] as const;
const inPersonOutcomes = ["TALKED", "UNANSWERED"] as const;

export function outcomesForChannel(channel: ContactChannel): ContactOutcome[] {
  if (channel === "PHONE") return [...phoneOutcomes];
  if (channel === "WHATSAPP") return [...whatsappOutcomes];
  if (channel === "IN_PERSON") return [...inPersonOutcomes];
  return ["TALKED", "UNANSWERED"];
}

export function outcomeOptionsForChannel(channel: ContactChannel) {
  return outcomesForChannel(channel).map((value) => ({
    value,
    label: contactOutcomes[value],
  }));
}

/** Real contact for “ümumi əlaqə” — send-only WhatsApp does not count. */
export const realContactOutcomes = [
  "TALKED",
  "ANSWERED_NO_TALK",
  "WHATSAPP_REPLIED",
] as const;

/** Phone answered (talked or not). */
export const phoneAnsweredOutcomes = ["TALKED", "ANSWERED_NO_TALK"] as const;

export const contactSchema = z
  .object({
    idempotencyKey: z.string().uuid(),
    leadId: z.string().uuid(),
    channel: z.enum(["PHONE", "WHATSAPP", "IN_PERSON", "OTHER"]),
    outcome: z.enum([
      "TALKED",
      "ANSWERED_NO_TALK",
      "UNANSWERED",
      "WHATSAPP_SENT",
      "WHATSAPP_REPLIED",
    ]),
    occurredAt: z.iso.datetime({ offset: true }),
    nextActionType: z.enum(nextActionTypeOptions),
    nextDate: z.iso.date(),
    note: z.string().trim().max(500).default(""),
  })
  .superRefine((input, ctx) => {
    const allowed = outcomesForChannel(input.channel);
    if (!allowed.includes(input.outcome)) {
      ctx.addIssue({
        code: "custom",
        path: ["outcome"],
        message: "Seçilən kanal üçün bu nəticə uyğun deyil.",
      });
    }
  });

export function assertContactTime(occurredAt: Date, now = new Date()) {
  if (occurredAt > now || dailyReportWindow(occurredAt).date !== dailyReportWindow(now).date) {
    throw new Error(
      "Əlaqə nəticəsi üçün bugünkü faktiki vaxtı seçin. Keçmiş gün düzəlişi ayrıca yoxlanmalıdır.",
    );
  }
}

export function nextUnansweredDate(firstAttempt: Date, now = new Date(), attempts = 0) {
  const first = dailyReportWindow(firstAttempt).start.getTime();
  const today = dailyReportWindow(now).start.getTime();
  if (today === first && attempts < 2) return dailyReportWindow(now).date;
  const offset = today < first + 3 * 86_400_000 ? 3 : 7;
  return dailyReportWindow(new Date(Math.max(today + 86_400_000, first + offset * 86_400_000))).date;
}

export function isRealContactOutcome(outcome: string) {
  return (realContactOutcomes as readonly string[]).includes(outcome);
}
