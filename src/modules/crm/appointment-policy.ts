import { z } from "zod";

export const appointmentSchema = z.object({
  leadId: z.string().uuid(),
  date: z.iso.date(),
  kind: z.enum(["CONSULTATION", "TRIAL"]),
  outcome: z.enum(["SCHEDULED", "ATTENDED", "NO_SHOW", "CANCELLED"]),
});
export function appointmentKey(input: z.infer<typeof appointmentSchema>) {
  return `lead-appointment:${input.leadId}:${input.date}:${input.kind}`;
}
export function isFutureAppointmentResult(input: z.infer<typeof appointmentSchema>, today: string) {
  return (input.outcome === "ATTENDED" || input.outcome === "NO_SHOW") && input.date > today;
}
export const appointmentOutcomeLabels = { SCHEDULED: "Təyin edildi", ATTENDED: "Baş tutdu", NO_SHOW: "Gəlmədi", CANCELLED: "Ləğv edildi" };
