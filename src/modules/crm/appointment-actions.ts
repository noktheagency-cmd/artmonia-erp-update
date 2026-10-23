"use server";
import { z } from "zod";
import { revalidatePath, updateTag } from "next/cache";
import { requireErpActor, requireMutationActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";
import { safeServerAction, PublicActionError } from "@/server/actions/safe-action";
import { assertCanAccessLead, assertCanEditLead } from "./access";
import { appointmentSchema, appointmentInstant } from "./appointment-policy";
import { writeAuditLog } from "@/modules/audit/audit-service";
import { erpCacheTags } from "@/modules/shared/cache-tags";

export const listAppointments = safeServerAction(async (leadId: string) => {
  const actor = await requireErpActor("crm.lead.read");
  const id = z.string().uuid().parse(leadId), db = getPrisma();
  assertCanAccessLead(actor, await db.lead.findUnique({ where: { id } }), "crm.lead.read");
  const [rows, teachers] = await Promise.all([
    db.crmAppointment.findMany({ where: { leadId: id }, orderBy: { plannedAt: "desc" }, take: 30 }),
    db.teacher.findMany({ where: { isActive: true }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" }, take: 300 }),
  ]);
  return { rows: rows.map((row) => ({ id: row.id, kind: row.kind, plannedAt: row.plannedAt.toISOString(), occurredAt: row.occurredAt?.toISOString() ?? null, outcome: row.outcome, teacherId: row.teacherId, isLegacy: row.isLegacy, previousId: row.previousId })), teachers };
}, "Görüşlər yüklənmədi.");

export const saveAppointment = safeServerAction(async (formData: FormData) => {
  const actor = await requireMutationActor("crm.lead.update");
  const input = appointmentSchema.parse(Object.fromEntries(formData));
  const now = new Date(), plannedAt = appointmentInstant(input.date, input.time);
  const occurredAt = input.occurredDate && input.occurredTime ? appointmentInstant(input.occurredDate, input.occurredTime) : null;
  if (occurredAt && occurredAt > now) throw new PublicActionError("Gələcək faktiki nəticə qeyd edilə bilməz.");
  await getPrisma().$transaction(async (tx) => {
    await tx.$queryRaw`select id from erp.leads where id = ${input.leadId}::uuid for update`;
    const lead = await tx.lead.findUnique({ where: { id: input.leadId } });
    assertCanEditLead(actor, lead);
    const replay = await tx.auditLog.findFirst({ where: { entityId: lead.id, action: "lead.appointment.save", afterJson: { path: ["requestKey"], equals: input.idempotencyKey } } });
    if (replay) {
      const previous = replay.afterJson as Record<string, unknown>;
      for (const field of ["leadId","date","time","kind","outcome","teacherId","occurredDate","occurredTime","reason"] as const) if ((previous[field] ?? "") !== (input[field] ?? "")) throw new PublicActionError("Təkrar görüş əməliyyatının məlumatları fərqlidir.");
      if (replay.actorUserId !== actor.id) throw new PublicActionError("Əməliyyat açarı başqa əməkdaşa aiddir.");
      return;
    }
    if (!lead.managerId) throw new PublicActionError("Müraciətin sahibi seçilməlidir.");
    if (input.teacherId && !await tx.teacher.findUnique({ where: { id: input.teacherId, isActive: true } })) throw new PublicActionError("Aktiv müəllim seçin.");
    const before = input.appointmentId ? await tx.crmAppointment.findUnique({ where: { id: input.appointmentId } }) : null;
    if (input.appointmentId && (!before || before.leadId !== lead.id)) throw new PublicActionError("Bu görüş müraciətə aid deyil.");
    if (before?.outcome === "RESCHEDULED") throw new PublicActionError("Təxirə salınmış qeydin yeni görüşünü seçin.");
    if (before && before.outcome !== "SCHEDULED") throw new PublicActionError("Tamamlanmış görüş tarixçəsi saxlanılır. Yeni görüşü ayrıca təyin edin.");
    if (!before && input.outcome === "RESCHEDULED") throw new PublicActionError("Təxirə salmaq üçün əvvəlki görüşü seçin.");
    if (before && input.outcome !== "RESCHEDULED" && (before.plannedAt.getTime() !== plannedAt.getTime() || before.kind !== input.kind)) throw new PublicActionError("Plan tarixi və növünü dəyişmək üçün Təxirə salındı seçin.");
    if (input.outcome === "RESCHEDULED" && plannedAt <= now) throw new PublicActionError("Yeni görüş üçün gələcək tarix və saat seçin.");
    let saved;
    if (input.outcome === "RESCHEDULED" && before) {
      if (before.outcome !== "SCHEDULED") throw new PublicActionError("Yalnız planlı görüş təxirə salına bilər.");
      await tx.crmAppointment.update({ where: { id: before.id }, data: { outcome: "RESCHEDULED", reason: input.reason, occurredAt: null } });
      if (before.reminderWorkId) await tx.leadWorkItem.update({ where: { id: before.reminderWorkId }, data: { cancelledAt: now, result: "RESCHEDULED" } });
      const work = await tx.leadWorkItem.create({ data: { leadId: lead.id, ownerId: lead.managerId, kind: "APPOINTMENT", source: "APPOINTMENT", plannedAt } });
      saved = await tx.crmAppointment.create({ data: { leadId: lead.id, ownerId: lead.managerId, kind: input.kind, plannedAt, teacherId: input.teacherId, previousId: before.id, reminderWorkId: work.id, idempotencyKey: input.idempotencyKey } });
    } else if (before) {
      saved = await tx.crmAppointment.update({ where: { id: before.id }, data: { outcome: input.outcome, occurredAt: ["ATTENDED", "NO_SHOW"].includes(input.outcome) ? occurredAt : null, teacherId: input.teacherId ?? before.teacherId, reason: input.reason || null } });
      if (before.reminderWorkId) await tx.leadWorkItem.update({ where: { id: before.reminderWorkId }, data: { completedAt: ["ATTENDED", "NO_SHOW"].includes(input.outcome) ? occurredAt : null, completedById: ["ATTENDED", "NO_SHOW"].includes(input.outcome) ? actor.id : null, cancelledAt: input.outcome === "CANCELLED" ? now : null, result: input.outcome } });
    } else {
      if (input.outcome !== "SCHEDULED") throw new PublicActionError("Əvvəl görüşü təyin edin, sonra faktiki nəticəni qeyd edin.");
      const work = await tx.leadWorkItem.create({ data: { leadId: lead.id, ownerId: lead.managerId, kind: "APPOINTMENT", source: "APPOINTMENT", plannedAt } });
      saved = await tx.crmAppointment.create({ data: { leadId: lead.id, ownerId: lead.managerId, kind: input.kind, plannedAt, teacherId: input.teacherId, reminderWorkId: work.id, idempotencyKey: input.idempotencyKey } });
    }
    if (input.outcome === "SCHEDULED" && !before && ["NEW", "CONTACTED", "NURTURE"].includes(lead.stage)) {
      await tx.lead.update({ where: { id: lead.id }, data: { stage: "QUALIFIED" } });
      await tx.leadStageHistory.create({
        data: {
          leadId: lead.id,
          oldStage: lead.stage,
          newStage: "QUALIFIED",
          reason: "Görüş təyin edildi",
          changedById: actor.id,
        },
      });
    }
    await writeAuditLog(tx, { actorUserId: actor.id, action: "lead.appointment.save", entityType: "lead", entityId: lead.id,
      before: before ? { id: before.id, plannedAt: before.plannedAt.toISOString(), outcome: before.outcome, occurredAt: before.occurredAt?.toISOString() ?? null } : null,
      after: { ...input, requestKey: input.idempotencyKey, appointmentId: saved.id } });
  }).catch((error: unknown) => {
    if (error instanceof PublicActionError) throw error;
    const message = error instanceof Error ? error.message : "";
    if (message.includes("crm_appointment_values")) {
      throw new PublicActionError("Görüş növü qəbul edilmədi. Səhifəni yeniləyib yenidən cəhd edin.");
    }
    throw error;
  });
  revalidatePath("/crm"); revalidatePath("/dashboard"); updateTag(erpCacheTags.crm);
}, "Görüş yadda saxlanılmadı.");
