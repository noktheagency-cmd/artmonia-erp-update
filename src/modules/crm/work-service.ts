import type { Prisma } from "@/generated/prisma/client";

export async function syncLeadWorkPlan(tx: Prisma.TransactionClient, input: {
  leadId: string; ownerId: string; kind: string | null; plannedAt: Date | null; closed?: boolean;
}, now = new Date()) {
  const current = await tx.leadWorkItem.findMany({ where: {
    leadId: input.leadId, source: "PRIMARY", completedAt: null, cancelledAt: null,
  } });
  if (!input.closed && current.length === 1 && current[0].ownerId === input.ownerId
    && current[0].kind === input.kind && current[0].plannedAt.getTime() === input.plannedAt?.getTime()) return;
  if (current.length) await tx.leadWorkItem.updateMany({ where: { id: { in: current.map((row) => row.id) } }, data: { cancelledAt: now, result: "REPLANNED" } });
  if (!input.closed && input.kind && input.plannedAt) await tx.leadWorkItem.create({ data: {
    leadId: input.leadId, ownerId: input.ownerId, kind: input.kind, plannedAt: input.plannedAt,
  } });
}
