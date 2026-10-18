"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { requireErpActor, requireMutationActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";
import { safeServerAction, PublicActionError } from "@/server/actions/safe-action";
import { writeAuditLog } from "@/modules/audit/audit-service";
import { erpCacheTags } from "@/modules/shared/cache-tags";
import { assertCanAccessLead, assertCanEditLead } from "./access";
import { assertContactTime, contactSchema, nextUnansweredDate } from "./contact-policy";
import { syncLeadWorkPlan } from "./work-service";
import { dailyReportWindow } from "@/modules/dashboard/daily-report-policy";

export const listContactEvents = safeServerAction(async (leadId: string) => {
  const actor = await requireErpActor("crm.lead.read");
  const id = z.string().uuid().parse(leadId);
  const db = getPrisma();
  assertCanAccessLead(actor, await db.lead.findUnique({ where: { id } }), "crm.lead.read");
  const rows = await db.leadContactEvent.findMany({ where: { leadId: id }, orderBy: { occurredAt: "desc" }, take: 30 });
  const lastTalk = await db.leadContactEvent.findFirst({
    where: { leadId: id, channel: "PHONE", outcome: "TALKED" },
    orderBy: { occurredAt: "desc" },
  });
  const unanswered = {
    leadId: id,
    channel: "PHONE",
    outcome: "UNANSWERED",
    ...(lastTalk ? { occurredAt: { gt: lastTalk.occurredAt } } : {}),
  };
  const [firstAttempt, attempts] = await Promise.all([db.leadContactEvent.findFirst({ where: unanswered, orderBy: { occurredAt: "asc" } }), db.leadContactEvent.count({ where: unanswered })]);
  return { rows: rows.map((row) => ({ id: row.id, channel: row.channel, outcome: row.outcome, occurredAt: row.occurredAt.toISOString(), note: row.note })),
    suggestedDate: nextUnansweredDate(firstAttempt?.occurredAt ?? new Date(), new Date(), attempts) };
}, "Əlaqə tarixçəsi yüklənmədi.");

export const saveContactEvent = safeServerAction(async (form: FormData) => {
  const actor = await requireMutationActor("crm.lead.update");
  const input = contactSchema.parse(Object.fromEntries(form));
  const occurredAt = new Date(input.occurredAt);
  assertContactTime(occurredAt);
  if (input.nextDate < dailyReportWindow().date) throw new PublicActionError("Növbəti iş üçün keçmiş tarix seçilə bilməz.");
  await getPrisma().$transaction(async (tx) => {
    await tx.$queryRaw`select id from erp.leads where id = ${input.leadId}::uuid for update`;
    const lead = await tx.lead.findUnique({ where: { id: input.leadId } });
    assertCanEditLead(actor, lead);
    if (lead.stage === "REGISTERED" || lead.stage === "LOST") throw new PublicActionError("Bu müraciət artıq bağlanıb.");
    if (!lead.programInterestId) throw new PublicActionError("Əvvəl müraciətin proqramını tamamlayın.");
    const previous = await tx.leadContactEvent.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (previous) {
      if (previous.leadId !== lead.id || previous.actorId !== actor.id || previous.channel !== input.channel || previous.outcome !== input.outcome || previous.note !== (input.note || null)) throw new PublicActionError("Əməliyyat açarı fərqli əlaqə qeydinə aiddir.");
      const audit = await tx.auditLog.findFirst({ where: { entityId: lead.id, action: "lead.contact.record", afterJson: { path: ["contactEventId"], equals: previous.id } } });
      const saved = audit?.afterJson as { nextDate?: string; nextActionType?: string } | undefined;
      if (saved?.nextDate !== input.nextDate || saved?.nextActionType !== input.nextActionType) throw new PublicActionError("Təkrar əməliyyatın planı fərqlidir.");
      return;
    }
    const event = await tx.leadContactEvent.create({ data: {
      leadId: lead.id, contactId: lead.contactId, actorId: actor.id, channel: input.channel,
      outcome: input.outcome, occurredAt, note: input.note || null, idempotencyKey: input.idempotencyKey,
    } });
    // An unanswered attempt completes performed work too; it is not a successful conversation.
    await tx.leadWorkItem.updateMany({ where: { leadId: lead.id, source: "PRIMARY", completedAt: null, cancelledAt: null,
      createdAt: { lte: occurredAt } }, data: { completedAt: occurredAt, completedById: actor.id, result: input.outcome } });
    const plannedAt = new Date(`${input.nextDate}T12:00:00+04:00`);
    const ownerId = lead.managerId ?? actor.id;
    await syncLeadWorkPlan(tx, { leadId: lead.id, ownerId, kind: input.nextActionType, plannedAt });
    await tx.lead.update({ where: { id: lead.id }, data: { managerId: ownerId, nextActionType: input.nextActionType, nextFollowUpAt: plannedAt } });
    await writeAuditLog(tx, { actorUserId: actor.id, action: "lead.contact.record", entityType: "lead", entityId: lead.id,
      after: { contactEventId: event.id, channel: input.channel, outcome: input.outcome, occurredAt: input.occurredAt, nextDate: input.nextDate, nextActionType: input.nextActionType }, reason: input.note || null });
  });
  revalidatePath("/crm"); revalidatePath("/dashboard");
  updateTag(erpCacheTags.crm);
}, "Əlaqə nəticəsi yadda saxlanılmadı.");
