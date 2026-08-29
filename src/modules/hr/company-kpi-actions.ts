"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { writeAuditLog } from "@/modules/audit/audit-service";
import { safeServerAction, PublicActionError } from "@/server/actions/safe-action";
import { requireMutationActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";

const nonNegativeInteger = z.coerce.number().int().nonnegative().max(10_000_000);
const targetSchema = z.object({
  periodMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Ay düzgün seçilməyib"),
  activeStudents: nonNegativeInteger,
  newSales: nonNegativeInteger,
  churn: nonNegativeInteger,
  leads: nonNegativeInteger,
  conversion: z.coerce.number().nonnegative().max(100),
  revenue: z.coerce.number().nonnegative().max(1_000_000_000),
});

async function saveCompanyKpiTargetsActionImpl(formData: FormData) {
  const actor = await requireMutationActor("hr.company_kpi.manage");
  const parsed = targetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    throw new PublicActionError(parsed.error.issues[0]?.message ?? "Hədəf göstəriciləri düzgün deyil");
  }

  const input = parsed.data;
  const periodMonth = new Date(`${input.periodMonth}-01T00:00:00.000Z`);
  const prisma = getPrisma();
  const before = await prisma.companyMonthlyTarget.findUnique({
    where: { periodMonth },
    select: {
      id: true,
      activeStudentsTarget: true,
      newSalesTarget: true,
      churnMaxTarget: true,
      leadTarget: true,
      conversionTarget: true,
      revenueTarget: true,
    },
  });

  const saved = await prisma.$transaction(async (tx) => {
    const target = await tx.companyMonthlyTarget.upsert({
      where: { periodMonth },
      create: {
        periodMonth,
        activeStudentsTarget: input.activeStudents,
        newSalesTarget: input.newSales,
        churnMaxTarget: input.churn,
        leadTarget: input.leads,
        conversionTarget: input.conversion,
        revenueTarget: input.revenue,
        createdById: actor.id,
        updatedById: actor.id,
      },
      update: {
        activeStudentsTarget: input.activeStudents,
        newSalesTarget: input.newSales,
        churnMaxTarget: input.churn,
        leadTarget: input.leads,
        conversionTarget: input.conversion,
        revenueTarget: input.revenue,
        updatedById: actor.id,
      },
      select: {
        id: true,
        activeStudentsTarget: true,
        newSalesTarget: true,
        churnMaxTarget: true,
        leadTarget: true,
        conversionTarget: true,
        revenueTarget: true,
      },
    });

    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: before ? "hr.company_kpi.update" : "hr.company_kpi.create",
      entityType: "company_monthly_target",
      entityId: target.id,
      before: before ? targetAuditValue(before) : null,
      after: targetAuditValue(target),
      reason: `${input.periodMonth} şirkət KPI hədəfləri yadda saxlanıldı`,
    });

    return target;
  });

  revalidatePath("/hr");
  return { id: saved.id };
}

function targetAuditValue(target: {
  activeStudentsTarget: number;
  newSalesTarget: number;
  churnMaxTarget: number;
  leadTarget: number;
  conversionTarget: Prisma.Decimal;
  revenueTarget: Prisma.Decimal;
}): Prisma.InputJsonValue {
  return {
    activeStudents: target.activeStudentsTarget,
    newSales: target.newSalesTarget,
    churn: target.churnMaxTarget,
    leads: target.leadTarget,
    conversion: Number(target.conversionTarget),
    revenue: Number(target.revenueTarget),
  };
}

export const saveCompanyKpiTargetsAction = safeServerAction(
  saveCompanyKpiTargetsActionImpl,
  "Şirkət KPI hədəfləri yadda saxlanmadı.",
);
