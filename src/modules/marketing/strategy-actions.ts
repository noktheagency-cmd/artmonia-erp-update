"use server";

import { revalidatePath, updateTag } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { writeAuditLog } from "@/modules/audit/audit-service";
import { erpCacheTags } from "@/modules/shared/cache-tags";
import { requireMutationActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";

const optionalUuid = z.preprocess(
  (value) => (typeof value === "string" && value.trim() ? value.trim() : undefined),
  z.string().uuid().optional(),
);

const moneyValue = z.preprocess(
  (value) => (typeof value === "string" && value.trim() ? value.trim() : "0"),
  z.coerce.number().min(0).max(999_999_999),
);

const goalValue = z.preprocess(
  (value) => (typeof value === "string" && value.trim() ? value.trim() : "0"),
  z.coerce.number().int().min(0).max(10_000_000),
);

const strategySchema = z.object({
  id: optionalUuid,
  name: z.string().trim().min(2, "Strategiya adı ən azı 2 simvol olmalıdır").max(120),
  month: z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/),
  objective: z.string().trim().min(5, "Məqsəd ən azı 5 simvol olmalıdır").max(600),
  status: z.enum(["DRAFT", "ACTIVE", "COMPLETED"]),
  responsibleUserId: optionalUuid,
  salesGoal: goalValue,
  leadGoal: goalValue,
  revenueGoal: moneyValue,
  budget: moneyValue,
  notes: z.preprocess(
    (value) => (typeof value === "string" && value.trim() ? value.trim() : undefined),
    z.string().max(1200).optional(),
  ),
});

const expenseSchema = z.object({
  strategyId: z.string().uuid(),
  title: z.string().trim().min(2, "Xərc adı ən azı 2 simvol olmalıdır").max(120),
  category: z.enum(["PRODUCTION", "INFLUENCER", "PRINT", "EVENT", "SOFTWARE", "OTHER"]),
  amount: moneyValue.refine((value) => value > 0, "Xərc məbləği 0-dan böyük olmalıdır"),
  spentOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.preprocess(
    (value) => (typeof value === "string" && value.trim() ? value.trim() : undefined),
    z.string().max(600).optional(),
  ),
});

export async function saveMarketingStrategyAction(formData: FormData) {
  const actor = await requireMutationActor("marketing.manage");
  const input = strategySchema.parse(Object.fromEntries(formData));
  const prisma = getPrisma();
  const month = new Date(`${input.month}-01T00:00:00.000Z`);

  try {
    await prisma.$transaction(async (tx) => {
      const responsible = input.responsibleUserId
        ? await tx.user.findFirst({
            where: { id: input.responsibleUserId, isActive: true },
            select: { id: true },
          })
        : null;
      if (input.responsibleUserId && !responsible) throw new Error("Məsul şəxs tapılmadı");

      const data = {
        name: input.name,
        month,
        objective: input.objective,
        status: input.status,
        responsibleUserId: input.responsibleUserId ?? null,
        salesGoal: input.salesGoal,
        leadGoal: input.leadGoal,
        revenueGoal: input.revenueGoal,
        budget: input.budget,
        notes: input.notes ?? null,
      };

      if (input.id) {
        const current = await tx.marketingStrategy.findUnique({ where: { id: input.id } });
        if (!current) throw new Error("Strategiya tapılmadı");
        const updated = await tx.marketingStrategy.update({
          where: { id: input.id },
          data,
          select: { id: true, name: true, month: true, status: true },
        });
        await writeAuditLog(tx, {
          actorUserId: actor.id,
          action: "marketing.strategy.update",
          entityType: "marketing_strategy",
          entityId: updated.id,
          before: { name: current.name, month: current.month.toISOString(), status: current.status },
          after: { name: updated.name, month: updated.month.toISOString(), status: updated.status },
          reason: "Aylıq marketing strategiyası yeniləndi",
        });
        return;
      }

      const created = await tx.marketingStrategy.create({
        data: { ...data, createdById: actor.id },
        select: { id: true, name: true, month: true, status: true },
      });
      await writeAuditLog(tx, {
        actorUserId: actor.id,
        action: "marketing.strategy.create",
        entityType: "marketing_strategy",
        entityId: created.id,
        after: { name: created.name, month: created.month.toISOString(), status: created.status },
        reason: "Yeni aylıq marketing strategiyası yaradıldı",
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new Error("Bu ay üçün eyni adlı strategiya artıq mövcuddur");
    }
    throw error;
  }

  invalidateMarketing();
}

export async function addMarketingStrategyExpenseAction(formData: FormData) {
  const actor = await requireMutationActor("marketing.manage");
  const input = expenseSchema.parse(Object.fromEntries(formData));
  const prisma = getPrisma();

  await prisma.$transaction(async (tx) => {
    const strategy = await tx.marketingStrategy.findUnique({
      where: { id: input.strategyId },
      select: { id: true, month: true },
    });
    if (!strategy) throw new Error("Strategiya tapılmadı");
    const strategyMonth = strategy.month.toISOString().slice(0, 7);
    if (!input.spentOn.startsWith(strategyMonth)) {
      throw new Error("Xərc tarixi strategiyanın ayına uyğun olmalıdır");
    }

    const created = await tx.marketingStrategyExpense.create({
      data: {
        strategyId: input.strategyId,
        title: input.title,
        category: input.category,
        amount: input.amount,
        spentOn: new Date(`${input.spentOn}T00:00:00.000Z`),
        notes: input.notes ?? null,
        createdById: actor.id,
      },
      select: { id: true, title: true, amount: true, spentOn: true },
    });
    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "marketing.strategy.expense.create",
      entityType: "marketing_strategy_expense",
      entityId: created.id,
      after: {
        strategyId: input.strategyId,
        title: created.title,
        amount: created.amount.toString(),
        spentOn: created.spentOn.toISOString(),
      },
      reason: "Marketing strategiyasına əlavə xərc daxil edildi",
    });
  });

  invalidateMarketing();
}

function invalidateMarketing() {
  revalidatePath("/marketing");
  updateTag(erpCacheTags.marketing);
}
