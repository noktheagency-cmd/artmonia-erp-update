"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getPrisma } from "@/server/db/prisma";
import { requireMutationActor } from "@/server/auth/actor";
import { optionalFormString } from "@/modules/shared/form-values";
import { writeAuditLog } from "@/modules/audit/audit-service";
import { PublicActionError, safeServerAction } from "@/server/actions/safe-action";

const optionalText = (max: number) =>
  z.preprocess(optionalFormString, z.string().max(max).optional());

const programSchema = z.object({
  id: z.preprocess(optionalFormString, z.string().uuid().optional()),
  name: z.string().trim().min(2).max(120),
  code: optionalText(40),
  monthlyFee: z.preprocess((value) => Number(String(value).replace(",", ".")), z.number().min(0).max(100_000)),
  lessonsPerMonth: z.preprocess(optionalFormString, z.coerce.number().int().positive().max(120).optional()),
  description: optionalText(500),
  lessonTopics: optionalText(25_000),
});

const deleteProgramSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
});

async function saveProgramActionImpl(formData: FormData) {
  await requireMutationActor("settings.manage");
  const input = programSchema.parse(Object.fromEntries(formData));
  const lessonTopics = z.array(z.string().trim().min(2).max(200)).max(120).parse(
    (input.lessonTopics ?? "")
      .split(/\r?\n/)
      .map((topic) => topic.trim())
      .filter(Boolean),
  );
  const prisma = getPrisma();
  const data = {
    name: input.name,
    code: input.code ?? null,
    defaultMonthlyFee: input.monthlyFee,
    defaultLessonsPerMonth: input.lessonsPerMonth ?? null,
    description: input.description ?? null,
    isActive: true,
  };

  await prisma.$transaction(async (tx) => {
    const program = input.id
      ? await tx.program.update({ where: { id: input.id }, data, select: { id: true } })
      : await tx.program.create({ data, select: { id: true } });

    await tx.programLessonTopic.deleteMany({ where: { programId: program.id } });
    if (lessonTopics.length) {
      await tx.programLessonTopic.createMany({
        data: lessonTopics.map((title, index) => ({
          programId: program.id,
          sequence: index + 1,
          title,
        })),
      });
    }
  });

  revalidatePath("/students");
}

async function deleteProgramActionImpl(formData: FormData) {
  const actor = await requireMutationActor("settings.manage");
  const input = deleteProgramSchema.parse(Object.fromEntries(formData));
  const prisma = getPrisma();

  await prisma.$transaction(async (tx) => {
    const program = await tx.program.findUnique({
      where: { id: input.id },
      select: {
        id: true,
        name: true,
        code: true,
        defaultMonthlyFee: true,
        defaultLessonsPerMonth: true,
        description: true,
        isActive: true,
      },
    });
    if (!program) throw new PublicActionError("Proqram tapılmadı", "NOT_FOUND");

    const usage = await tx.enrollment.count({ where: { programId: program.id } });
    if (usage > 0) {
      throw new PublicActionError(
        "Proqramı silməzdən əvvəl tələbə təyinatlarını başqa proqrama keçirin",
        "CONFLICT",
      );
    }

    await tx.program.delete({ where: { id: program.id } });
    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "program.delete",
      entityType: "program",
      entityId: program.id,
      before: {
        name: program.name,
        code: program.code,
        monthlyFee: program.defaultMonthlyFee.toString(),
        lessonsPerMonth: program.defaultLessonsPerMonth,
        description: program.description,
        isActive: program.isActive,
      },
      after: { permanentlyDeleted: true },
      reason: input.reason,
    });
  });
  revalidatePath("/students");
}

export const saveProgramAction = safeServerAction(
  saveProgramActionImpl,
  "Proqram saxlanmadı.",
);
export const deleteProgramAction = safeServerAction(
  deleteProgramActionImpl,
  "Proqram silinmədi.",
);
