"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { writeAuditLog } from "@/modules/audit/audit-service";
import { requireMutationActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";
import { getSupabaseAdminClient } from "@/server/supabase/admin";
import {
  PublicActionError,
  safeServerAction,
} from "@/server/actions/safe-action";

const createNotificationSchema = z.object({
  employeeId: z.string().uuid(),
  category: z.enum(["RULE_VIOLATION", "PERFORMANCE_WARNING", "INFORMATION", "APPRECIATION", "MANUAL"]),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]),
  title: z.string().trim().min(4).max(140),
  message: z.string().trim().min(12).max(3000),
});

async function createHrStaffNotificationActionImpl(formData: FormData) {
  const actor = await requireMutationActor("hr.employee.manage");
  const input = createNotificationSchema.parse(Object.fromEntries(formData));
  const employee = await getPrisma().hrEmployee.findUnique({ where: { id: input.employeeId }, select: { id: true, fullName: true } });
  if (!employee) throw new PublicActionError("Əməkdaş profili tapılmadı", "NOT_FOUND");

  const notification = await getPrisma().$transaction(async (tx) => {
    const created = await tx.hrStaffNotification.create({ data: { ...input, creatorUserId: actor.id } });
    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "hr.notification.send",
      entityType: "hr_employee",
      entityId: employee.id,
      after: { notificationId: created.id, category: created.category, priority: created.priority, title: created.title } as Prisma.InputJsonValue,
      reason: `${employee.fullName} üçün HR bildirişi göndərildi`,
    });
    return created;
  });

  revalidateProfile(input.employeeId);
  await broadcastNotificationChange(input.employeeId);
  return { id: notification.id };
}

const statusSchema = z.object({
  notificationId: z.string().uuid(),
  status: z.enum(["READ", "ACKNOWLEDGED", "RESOLVED"]),
});

async function updateHrStaffNotificationStatusActionImpl(formData: FormData) {
  const actor = await requireMutationActor();
  const input = statusSchema.parse(Object.fromEntries(formData));
  const current = await getPrisma().hrStaffNotification.findUnique({
    where: { id: input.notificationId },
    include: { employee: { select: { id: true, userId: true } } },
  });
  if (!current) throw new PublicActionError("Bildiriş tapılmadı", "NOT_FOUND");

  const isOwner = current.employee.userId === actor.id;
  const canManage = actor.permissions.has("hr.employee.manage");
  if (!isOwner && !canManage) throw new PublicActionError("Bu bildirişi yeniləmək icazəniz yoxdur", "FORBIDDEN");
  if (input.status === "ACKNOWLEDGED" && !isOwner) throw new PublicActionError("Bildirişi yalnız qəbul edən təsdiqləyə bilər", "FORBIDDEN");
  if (input.status === "RESOLVED" && !canManage) throw new PublicActionError("Bildirişi yalnız HR bağlaya bilər", "FORBIDDEN");

  const now = new Date();
  await getPrisma().$transaction(async (tx) => {
    const updated = await tx.hrStaffNotification.update({
      where: { id: current.id },
      data: {
        status: input.status,
        readAt: input.status === "READ" ? current.readAt ?? now : current.readAt,
        acknowledgedAt: input.status === "ACKNOWLEDGED" ? current.acknowledgedAt ?? now : current.acknowledgedAt,
        resolvedAt: input.status === "RESOLVED" ? current.resolvedAt ?? now : current.resolvedAt,
      },
    });
    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "hr.notification.status.update",
      entityType: "hr_employee",
      entityId: current.employee.id,
      before: { notificationId: current.id, status: current.status },
      after: { notificationId: updated.id, status: updated.status },
      reason: `Bildiriş statusu ${updated.status} olaraq yeniləndi`,
    });
  });

  revalidateProfile(current.employee.id);
  await broadcastNotificationChange(current.employee.id);
}

export const createHrStaffNotificationAction = safeServerAction(
  createHrStaffNotificationActionImpl,
  "Bildiriş göndərilə bilmədi.",
);

export const updateHrStaffNotificationStatusAction = safeServerAction(
  updateHrStaffNotificationStatusActionImpl,
  "Bildiriş statusu yenilənə bilmədi.",
);

function revalidateProfile(employeeId: string) {
  revalidatePath(`/hr/${employeeId}`);
  revalidatePath("/profile");
  revalidatePath("/hr");
}

async function broadcastNotificationChange(employeeId: string) {
  try {
    const client = getSupabaseAdminClient();
    const channel = client.channel("hr-notifications");
    await channel.send({ type: "broadcast", event: "changed", payload: { employeeId } });
    await client.removeChannel(channel);
  } catch {
    // Database write is authoritative; realtime is a progressive enhancement.
  }
}
