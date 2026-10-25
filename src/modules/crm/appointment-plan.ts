import type { Lead, Prisma } from "@/generated/prisma/client";
import { PublicActionError } from "@/server/actions/public-action-error";
import { isMeetingReminder } from "./appointment-history";
import type { z } from "zod";
import type { appointmentSchema } from "./appointment-policy";

type AppointmentInput = z.infer<typeof appointmentSchema>;
type MeetingPlanLead = Pick<Lead, "id" | "managerId" | "stage" | "convertedStudentId" | "nextActionType" | "nextFollowUpAt">;

export function assertAppointmentReplay(previous: Record<string, unknown>, input: AppointmentInput, actorId: string, savedActorId: string | null) {
  if (savedActorId !== actorId) throw new PublicActionError("Əməliyyat açarı başqa əməkdaşa aiddir.");
  for (const field of ["leadId", "leadPlanAt", "date", "time", "kind", "outcome", "teacherId", "occurredDate", "occurredTime", "reason"] as const) {
    if ((previous[field] ?? "") !== (input[field] ?? "")) throw new PublicActionError("Təkrar görüş əməliyyatının məlumatları fərqlidir.");
  }
  const requestedId = Object.hasOwn(previous, "requestedAppointmentId")
    ? previous.requestedAppointmentId
    : input.appointmentId ? previous.appointmentId : null;
  if ((requestedId ?? "") !== (input.appointmentId ?? "")) throw new PublicActionError("Təkrar görüş əməliyyatının məlumatları fərqlidir.");
}

/** Caller must authorize the editor and hold the lead row lock in this transaction. */
export async function materializeLeadMeetingPlan(tx: Prisma.TransactionClient, lead: MeetingPlanLead, input: AppointmentInput) {
  const plannedAt = lead.nextFollowUpAt;
  const kind = lead.nextActionType === "TRIAL_LESSON_REMINDER" ? "TRIAL" : "CONSULTATION";
  if (!input.leadPlanAt || input.appointmentId || !["ATTENDED", "NO_SHOW"].includes(input.outcome)
    || !plannedAt || !lead.managerId || lead.id !== input.leadId
    || !isMeetingReminder(lead.nextActionType) || lead.convertedStudentId || ["REGISTERED", "LOST"].includes(lead.stage)
    || plannedAt.toISOString() !== input.leadPlanAt || input.kind !== kind) {
    throw new PublicActionError("Görüş planı dəyişib və ya artıq tamamlanıb. Bölməni yenidən açın.", "CONFLICT");
  }
  // Match the read model: a recorded meeting takes precedence over a profile reminder.
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baku" }).format(plannedAt);
  const dayStart = new Date(`${date}T00:00:00+04:00`);
  const existing = await tx.crmAppointment.findFirst({
    where: { leadId: lead.id, OR: [
      { outcome: "SCHEDULED" },
      { plannedAt: { gte: dayStart, lt: new Date(dayStart.getTime() + 86_400_000) } },
    ] },
    select: { id: true },
  });
  if (existing) throw new PublicActionError("Görüş qeydi artıq mövcuddur. Bölməni yenidən açın.", "CONFLICT");
  const previousWork = await tx.leadWorkItem.findFirst({
    where: { leadId: lead.id, source: "PRIMARY", kind: kind === "TRIAL" ? "TRIAL_LESSON_REMINDER" : "CONSULTATION_REMINDER", plannedAt, completedAt: null, cancelledAt: null },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true },
  });
  const work = previousWork ?? await tx.leadWorkItem.create({
    data: { leadId: lead.id, ownerId: lead.managerId, kind: "APPOINTMENT", source: "APPOINTMENT", plannedAt },
  });
  return tx.crmAppointment.create({
    data: {
      leadId: lead.id, ownerId: lead.managerId, kind, plannedAt,
      teacherId: input.teacherId, reminderWorkId: work.id,
      idempotencyKey: `lead-plan:${lead.id}:${plannedAt.toISOString()}`,
    },
  });
}
