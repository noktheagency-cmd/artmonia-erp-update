import { Prisma } from "@/generated/prisma/client";
import type { ErpActor } from "@/server/auth/actor";
import { scopeFor } from "@/server/rbac/permissions";
import { PublicActionError } from "@/server/actions/public-action-error";
import { assertCanAccessLead } from "@/modules/crm/access";

export async function assertAdmissionLeadActor(tx: Prisma.TransactionClient, actor: ErpActor, leadId?: string) {
  if (!leadId) return;
  const lead = await tx.lead.findUnique({ where: { id: leadId } });
  assertCanAccessLead(actor, lead, "crm.lead.read");
  assertCanAccessLead(actor, lead, "crm.lead.convert");
}

export async function lockPaymentStudent(tx: Prisma.TransactionClient, actor: ErpActor, studentId: string) {
  await tx.$queryRaw`select id from erp.students where id=${studentId}::uuid for update`;
  const student = await tx.student.findUnique({ where: { id: studentId }, select: { managerId: true } });
  if (!student || (scopeFor(actor.permissions,"billing.payment.create") !== "ALL" && student.managerId !== actor.id)) throw new PublicActionError("Bu tələbənin ödənişini dəyişmək icazəniz yoxdur.", "FORBIDDEN");
}

export async function replayPayment(tx: Prisma.TransactionClient, input: {
  idempotencyKey: string; studentId: string; amount: number; paidAt: Date; method: string; scheduleType: string; receiptPurpose: string; actorId: string;
}) {
  const prior = await tx.payment.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (!prior) return null;
  if (prior.studentId !== input.studentId || prior.createdById !== input.actorId || !prior.amount.equals(new Prisma.Decimal(input.amount))
    || prior.paidAt.getTime() !== input.paidAt.getTime() || prior.method !== input.method || prior.scheduleType !== input.scheduleType || prior.receiptPurpose !== input.receiptPurpose)
    throw new PublicActionError("Təkrar ödənişin məlumatları əvvəlki əməliyyatla uyğun deyil.");
  return prior;
}
