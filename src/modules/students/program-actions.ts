"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getPrisma } from "@/server/db/prisma";
import { requireMutationActor } from "@/server/auth/actor";
import { optionalFormString } from "@/modules/shared/form-values";
import { safeServerAction } from "@/server/actions/safe-action";

const optionalText = (max: number) =>
  z.preprocess(optionalFormString, z.string().max(max).optional());

const programSchema = z.object({
  id: z.preprocess(optionalFormString, z.string().uuid().optional()),
  name: z.string().trim().min(2).max(120),
  code: optionalText(40),
  monthlyFee: z.preprocess((value) => Number(String(value).replace(",", ".")), z.number().min(0).max(100_000)),
  lessonsPerMonth: z.preprocess(optionalFormString, z.coerce.number().int().positive().max(120).optional()),
  description: optionalText(500),
  isActive: z.preprocess((value) => value === "true" || value === "on", z.boolean()),
});

async function saveProgramActionImpl(formData: FormData) {
  await requireMutationActor("settings.manage");
  const input = programSchema.parse(Object.fromEntries(formData));
  const prisma = getPrisma();
  const data = {
    name: input.name,
    code: input.code ?? null,
    defaultMonthlyFee: input.monthlyFee,
    defaultLessonsPerMonth: input.lessonsPerMonth ?? null,
    description: input.description ?? null,
    isActive: input.isActive,
  };

  if (input.id) await prisma.program.update({ where: { id: input.id }, data });
  else await prisma.program.create({ data });

  revalidatePath("/students");
}

async function deleteProgramActionImpl(formData: FormData) {
  await requireMutationActor("settings.manage");
  const id = z.string().uuid().parse(formData.get("id"));
  const prisma = getPrisma();
  const usage = await prisma.enrollment.count({ where: { programId: id } });
  if (usage > 0) await prisma.program.update({ where: { id }, data: { isActive: false } });
  else await prisma.program.delete({ where: { id } });
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
