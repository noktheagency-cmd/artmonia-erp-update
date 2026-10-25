import type { Prisma } from "@/generated/prisma/client";
import type { ErpActor } from "@/server/auth/actor";
import { assertPermission } from "@/server/rbac/permissions";
import { PublicActionError } from "@/server/actions/public-action-error";
import { writeAuditLog } from "@/modules/audit/audit-service";
import { assertCanAccessLead } from "./access";

const MAX_DELETE_HISTORY_ROWS = 500;
const HISTORY_ERROR = "Faktiki əlaqə, görüş və ya tamamlanmış əməliyyat tarixçəsi olan müraciət silinə bilməz. Səbəbi yazaraq İtirilib seçin.";

/** The caller must wrap this operation in a database transaction. */
export async function deleteLeadWithPlans(
  tx: Prisma.TransactionClient,
  input: { leadId: string; reason: string },
  actor: ErpActor,
) {
  assertPermission(actor.permissions, "crm.lead.delete");
  const reason = input.reason.trim();
  if (!reason || reason.length > 500) throw new PublicActionError("Silinmə açıqlaması 1–500 simvol olmalıdır.");

  // Child inserts need the parent FK lock; concurrent contact/meeting/conversion
  // writes cannot add facts between the eligibility check and deletion.
  await tx.$queryRaw`select id from erp.leads where id = ${input.leadId}::uuid for update`;
  const lead = await tx.lead.findUnique({
    where: { id: input.leadId },
    include: {
      contact: { select: { fullName: true, phoneDisplay: true } },
      _count: { select: { contactEvents: true, appointments: true, courseSales: true, workItems: true, stageHistory: true } },
    },
  });
  assertCanAccessLead(actor, lead, "crm.lead.delete");
  if (lead.convertedStudentId || lead.stage === "REGISTERED" || lead._count.courseSales) {
    throw new PublicActionError("Tələbəyə və ya satışa bağlı müraciət silinə bilməz.");
  }
  if (lead._count.contactEvents || lead._count.appointments) throw new PublicActionError(HISTORY_ERROR);
  if (lead._count.workItems + lead._count.stageHistory > MAX_DELETE_HISTORY_ROWS) {
    throw new PublicActionError("Tarixçəsi böyük olan müraciət üçün İtirilib statusunu seçin.");
  }

  const [workItems, stageHistory, tasks] = await Promise.all([
    tx.leadWorkItem.findMany({ where: { leadId: lead.id }, orderBy: { id: "asc" }, take: MAX_DELETE_HISTORY_ROWS + 1 }),
    tx.leadStageHistory.findMany({ where: { leadId: lead.id }, orderBy: { id: "asc" }, take: MAX_DELETE_HISTORY_ROWS + 1 }),
    tx.task.findMany({ where: { entityType: "lead", entityId: lead.id }, orderBy: { id: "asc" }, take: MAX_DELETE_HISTORY_ROWS + 1 }),
  ]);
  if (workItems.length + stageHistory.length + tasks.length > MAX_DELETE_HISTORY_ROWS) {
    throw new PublicActionError("Tarixçəsi böyük olan müraciət üçün İtirilib statusunu seçin.");
  }
  if (workItems.some((row) => row.completedAt || row.completedById || (row.result && !row.cancelledAt))
    || tasks.some((row) => row.completedAt || row.status === "DONE")) {
    throw new PublicActionError(HISTORY_ERROR);
  }

  await writeAuditLog(tx, {
    actorUserId: actor.id,
    action: "lead.delete",
    entityType: "lead",
    entityId: lead.id,
    reason,
    before: {
      ...lead,
      createdAt: lead.createdAt.toISOString(),
      updatedAt: lead.updatedAt.toISOString(),
      nextFollowUpAt: lead.nextFollowUpAt?.toISOString() ?? null,
      workItems: workItems.map((row) => ({ ...row,
        plannedAt: row.plannedAt.toISOString(), createdAt: row.createdAt.toISOString(),
        completedAt: row.completedAt?.toISOString() ?? null, cancelledAt: row.cancelledAt?.toISOString() ?? null,
      })),
      stageHistory: stageHistory.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
      tasks: tasks.map((row) => ({ ...row, dueAt: row.dueAt?.toISOString() ?? null,
        completedAt: row.completedAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
      })),
    },
  });

  const deletedPlans = await tx.leadWorkItem.deleteMany({
    where: { leadId: lead.id, completedAt: null, completedById: null, OR: [{ result: null }, { cancelledAt: { not: null } }] },
  });
  const deletedTasks = await tx.task.deleteMany({
    where: { entityType: "lead", entityId: lead.id, completedAt: null, status: { not: "DONE" } },
  });
  if (deletedPlans.count !== workItems.length || deletedTasks.count !== tasks.length) {
    throw new PublicActionError("Müraciətin planı dəyişib. Səhifəni yeniləyib yenidən cəhd edin.");
  }
  await tx.lead.delete({ where: { id: lead.id } });
  // Shared contacts and contacts referenced by factual history stay intact.
  await tx.contact.deleteMany({ where: {
    id: lead.contactId, leads: { none: {} }, students: { none: {} },
    teacherProfiles: { none: {} }, studentRelationships: { none: {} }, factualLeadContacts: { none: {} },
  } });
}
