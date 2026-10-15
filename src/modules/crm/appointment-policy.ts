import { z } from "zod";
import { optionalFormString } from "@/modules/shared/form-values";
const optionalId = z.preprocess(optionalFormString, z.string().uuid().optional());
export const appointmentSchema = z.object({
  leadId: z.string().uuid(), idempotencyKey: z.string().uuid(), appointmentId: optionalId,
  date: z.iso.date(), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  kind: z.enum(["CONSULTATION", "TRIAL"]), teacherId: optionalId,
  outcome: z.enum(["SCHEDULED", "ATTENDED", "NO_SHOW", "CANCELLED", "RESCHEDULED"]),
  occurredDate: z.preprocess((value) => value === "" ? undefined : value, z.iso.date().optional()),
  occurredTime: z.preprocess((value) => value === "" ? undefined : value, z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional()),
  reason: z.string().trim().max(500).default(""),
}).superRefine((input, ctx) => {
  if (["ATTENDED", "NO_SHOW"].includes(input.outcome) && (!input.occurredDate || !input.occurredTime)) ctx.addIssue({ code: "custom", message: "Faktiki görüş tarixini və saatını seçin." });
  if (input.outcome === "ATTENDED" && input.kind === "TRIAL" && !input.teacherId) ctx.addIssue({ code: "custom", message: "Sınağı keçirən müəllim seçilməlidir." });
  if (["CANCELLED", "RESCHEDULED"].includes(input.outcome) && !input.reason) ctx.addIssue({ code: "custom", message: "Ləğv və ya təxirə salınma səbəbini yazın." });
});
export const appointmentOutcomeLabels = { SCHEDULED: "Təyin edildi", ATTENDED: "Baş tutdu", NO_SHOW: "Gəlmədi", CANCELLED: "Ləğv edildi", RESCHEDULED: "Təxirə salındı" };
export function appointmentInstant(date: string, time: string) { return new Date(date + "T" + time + ":00+04:00"); }
