"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { bakuLocalDateTimeToUtc } from "@/modules/attendance/attendance-time";
import { writeAuditLog } from "@/modules/audit/audit-service";
import { safeServerAction } from "@/server/actions/safe-action";
import { requireMutationActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";

const localDateTimeSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/);
const announcementSchema = z.object({
  id: z.preprocess((value) => value || undefined, z.string().uuid().optional()),
  programId: z.preprocess((value) => value || null, z.string().uuid().nullable()),
  title: z.string().trim().min(2).max(160),
  body: z.string().trim().min(2).max(2000),
  publishedAt: localDateTimeSchema,
  expiresAt: z.preprocess((value) => value || null, localDateTimeSchema.nullable()),
  isActive: z.preprocess((value) => value === "true" || value === "on", z.boolean()),
}).refine((value) => !value.expiresAt || value.expiresAt > value.publishedAt, {
  path: ["expiresAt"],
  message: "Bitmə vaxtı paylaşım vaxtından sonra olmalıdır",
});

async function saveAcademyAnnouncementImpl(formData: FormData) {
  const actor = await requireMutationActor("group.manage");
  const input = announcementSchema.parse(Object.fromEntries(formData));
  const prisma = getPrisma();
  const data = {
    programId: input.programId,
    title: input.title,
    body: input.body,
    publishedAt: parseBakuDateTime(input.publishedAt),
    expiresAt: input.expiresAt ? parseBakuDateTime(input.expiresAt) : null,
    isActive: input.isActive,
    updatedById: actor.id,
  };

  const announcement = await prisma.$transaction(async (tx) => {
    const current = input.id
      ? await tx.academyAnnouncement.findUnique({ where: { id: input.id } })
      : null;
    if (input.id && !current) throw new Error("Elan tapılmadı");
    const saved = current
      ? await tx.academyAnnouncement.update({ where: { id: current.id }, data })
      : await tx.academyAnnouncement.create({
          data: { ...data, createdById: actor.id },
        });
    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: current ? "academy_announcement.update" : "academy_announcement.create",
      entityType: "academy_announcement",
      entityId: saved.id,
      before: current as unknown as Prisma.InputJsonValue ?? undefined,
      after: saved as unknown as Prisma.InputJsonValue,
      reason: current ? "Mobil akademiya elanı yeniləndi" : "Mobil akademiya elanı yaradıldı",
    });
    return saved;
  });
  revalidatePath("/groups");
  return { id: announcement.id };
}

async function toggleAcademyAnnouncementImpl(formData: FormData) {
  const actor = await requireMutationActor("group.manage");
  const input = z.object({
    id: z.string().uuid(),
    isActive: z.enum(["true", "false"]).transform((value) => value === "true"),
  }).parse(Object.fromEntries(formData));
  const prisma = getPrisma();
  await prisma.$transaction(async (tx) => {
    const current = await tx.academyAnnouncement.findUnique({ where: { id: input.id } });
    if (!current) throw new Error("Elan tapılmadı");
    const updated = await tx.academyAnnouncement.update({
      where: { id: current.id },
      data: { isActive: input.isActive, updatedById: actor.id },
    });
    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "academy_announcement.status.update",
      entityType: "academy_announcement",
      entityId: updated.id,
      before: { isActive: current.isActive },
      after: { isActive: updated.isActive },
      reason: updated.isActive ? "Mobil elan aktivləşdirildi" : "Mobil elan deaktiv edildi",
    });
  });
  revalidatePath("/groups");
}

function parseBakuDateTime(value: string) {
  return bakuLocalDateTimeToUtc(value.slice(0, 10), value.slice(11, 16));
}

export const saveAcademyAnnouncementAction = safeServerAction(
  saveAcademyAnnouncementImpl,
  "Elanı saxlamaq mümkün olmadı.",
);
export const toggleAcademyAnnouncementAction = safeServerAction(
  toggleAcademyAnnouncementImpl,
  "Elanın statusunu dəyişmək mümkün olmadı.",
);
