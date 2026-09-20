"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireErpActor, requireMutationActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";
import { safeServerAction, PublicActionError } from "@/server/actions/safe-action";
import { assertCanAccessLead, assertCanEditLead } from "./access";
import { appointmentKey, appointmentSchema, isFutureAppointmentResult } from "./appointment-policy";
import { writeAuditLog } from "@/modules/audit/audit-service";
import { dailyReportWindow } from "@/modules/dashboard/daily-report-policy";

export const listAppointments = safeServerAction(async (leadId: string) => {
  const actor = await requireErpActor("crm.lead.read");
  const id = z.string().uuid().parse(leadId);
  const prisma = getPrisma();
  assertCanAccessLead(actor, await prisma.lead.findUnique({ where: { id } }), "crm.lead.read");
  const rows = await prisma.task.findMany({ where: { entityType: "lead", entityId: id, type: "lead_appointment" }, orderBy: { dueAt: "desc" }, take: 30,
    select: { id: true, title: true, dueAt: true, completionNote: true, description: true } });
  return rows.map((row) => ({ id: row.id, kind: row.description === "TRIAL" ? "TRIAL" as const : "CONSULTATION" as const, date: row.dueAt ? dailyReportWindow(row.dueAt).date : "", outcome: appointmentSchema.shape.outcome.catch("SCHEDULED").parse(row.completionNote) }));
}, "Görüşlər yüklənmədi.");

export const saveAppointment = safeServerAction(async (formData: FormData) => {
  const actor = await requireMutationActor("crm.lead.update");
  const input = appointmentSchema.parse(Object.fromEntries(formData));
  if (isFutureAppointmentResult(input, dailyReportWindow().date)) {
    throw new PublicActionError("Gələcək görüş üçün nəticə qeyd edilə bilməz.");
  }
  await getPrisma().$transaction(async (tx) => {
    // Serialize edits to the same lead, including retries of the same appointment.
    await tx.$queryRaw`select id from erp.leads where id = ${input.leadId}::uuid for update`;
    const lead = await tx.lead.findUnique({ where: { id: input.leadId } });
    assertCanEditLead(actor, lead);
    const key = appointmentKey(input);
    const before = await tx.task.findUnique({ where: { idempotencyKey: key } });
    const status = input.outcome === "SCHEDULED" ? "OPEN" : input.outcome === "CANCELLED" ? "CANCELLED" : "DONE";
    const data = { title: input.kind === "TRIAL" ? "Sınaq dərsi" : "Konsultasiya", description: input.kind, type: "lead_appointment", entityType: "lead", entityId: lead.id, ownerUserId: lead.managerId,
      dueAt: new Date(`${input.date}T12:00:00+04:00`), completionNote: input.outcome, status, completedAt: status === "DONE" ? new Date() : null } as const;
    const saved = await tx.task.upsert({ where: { idempotencyKey: key }, create: { ...data, idempotencyKey: key, createdById: actor.id }, update: data });
    await writeAuditLog(tx, { actorUserId: actor.id, action: "lead.appointment.save", entityType: "lead", entityId: lead.id,
      before: before ? { outcome: before.completionNote } : null, after: { ...input, appointmentId: saved.id } });
  });
  revalidatePath("/crm");
  revalidatePath("/dashboard");
}, "Görüş yadda saxlanılmadı.");
