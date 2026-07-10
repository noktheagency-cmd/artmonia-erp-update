"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AppRole } from "@/generated/prisma/client";
import { getPrisma } from "@/server/db/prisma";
import { requireMutationActor } from "@/server/auth/actor";
import { writeAuditLog } from "@/modules/audit/audit-service";

const teacherAccountSchema = z.object({
  teacherId: z.string().uuid(),
  userId: z.union([z.string().uuid(), z.literal("")]),
});

export async function linkTeacherAccountAction(formData: FormData) {
  const actor = await requireMutationActor("teacher.account.manage");
  const input = teacherAccountSchema.parse(Object.fromEntries(formData));
  const prisma = getPrisma();

  await prisma.$transaction(async (tx) => {
    const teacher = await tx.teacher.findUnique({ where: { id: input.teacherId } });
    if (!teacher) throw new Error("Müəllim tapılmadı");

    if (input.userId) {
      const user = await tx.user.findFirst({
        where: {
          id: input.userId,
          isActive: true,
          roles: { some: { role: { code: AppRole.TEACHER } } },
        },
      });
      if (!user) throw new Error("Aktiv TEACHER istifadəçisi tapılmadı");
      const alreadyLinked = await tx.teacher.findFirst({
        where: { userId: user.id, id: { not: teacher.id } },
        select: { id: true },
      });
      if (alreadyLinked) throw new Error("Bu ERP hesabı başqa müəllimə bağlıdır");
    }

    await tx.teacher.update({
      where: { id: teacher.id },
      data: { userId: input.userId || null },
    });
    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "teacher.account.link",
      entityType: "teacher",
      entityId: teacher.id,
      before: { userId: teacher.userId },
      after: { userId: input.userId || null },
      reason: input.userId ? "Müəllim ERP hesabına bağlandı" : "Müəllim ERP hesabından ayrıldı",
    });
  });

  revalidatePath("/hr");
  revalidatePath("/groups");
}
