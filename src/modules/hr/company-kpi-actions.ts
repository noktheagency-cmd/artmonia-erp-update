"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { writeAuditLog } from "@/modules/audit/audit-service";
import { safeServerAction, PublicActionError } from "@/server/actions/safe-action";
import { requireMutationActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";

const nonNegativeInteger = z.coerce.number().int().nonnegative().max(10_000_000);
const monthKeySchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Ay düzgün seçilməyib");
const targetValuesSchema = z.object({
  activeStudents: nonNegativeInteger,
  newSales: nonNegativeInteger,
  churn: nonNegativeInteger,
  leads: nonNegativeInteger,
  conversion: z.coerce.number().nonnegative().max(100),
  revenue: z.coerce.number().nonnegative().max(1_000_000_000),
});
const targetSchema = targetValuesSchema.extend({ periodMonth: monthKeySchema });
const planMonthSchema = targetValuesSchema.extend({ periodMonth: monthKeySchema });
const planSchema = z.object({
  name: z.string().trim().min(3).max(120),
  startMonth: monthKeySchema,
  durationMonths: z.coerce.number().refine((value) => value === 6 || value === 12, "Plan 6 və ya 12 aylıq olmalıdır"),
  totals: z.string().transform((value, context) => parseJsonTargets(value, context)),
  months: z.string().transform((value, context) => {
    try {
      return z.array(planMonthSchema).min(6).max(12).parse(JSON.parse(value));
    } catch {
      context.addIssue({ code: "custom", message: "Aylıq bölgü düzgün deyil" });
      return z.NEVER;
    }
  }),
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

async function saveCompanyKpiPlanActionImpl(formData: FormData) {
  const actor = await requireMutationActor("hr.company_kpi.manage");
  const parsed = planSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    throw new PublicActionError(parsed.error.issues[0]?.message ?? "KPI planı düzgün deyil");
  }
  const input = parsed.data;
  if (input.months.length !== input.durationMonths) {
    throw new PublicActionError("Aylıq bölgünün sayı seçilmiş plan müddətinə uyğun deyil");
  }

  const startMonth = monthDate(input.startMonth);
  const expectedMonths = Array.from({ length: input.durationMonths }, (_, index) => monthKey(addMonths(startMonth, index)));
  if (input.months.some((month, index) => month.periodMonth !== expectedMonths[index])) {
    throw new PublicActionError("Aylıq bölgü ardıcıl aylardan ibarət olmalıdır");
  }
  assertPlanTotals(input.totals, input.months);

  const endMonth = addMonths(startMonth, input.durationMonths - 1);
  const prisma = getPrisma();
  const current = await prisma.companyKpiPlan.findUnique({ where: { startMonth } });
  const overlap = await prisma.companyKpiPlan.findFirst({
    where: {
      id: current ? { not: current.id } : undefined,
      startMonth: { lte: endMonth },
      endMonth: { gte: startMonth },
    },
    select: { name: true },
  });
  if (overlap) throw new PublicActionError(`Bu tarix aralığında artıq “${overlap.name}” planı var`, "CONFLICT");

  const saved = await prisma.$transaction(async (tx) => {
    const plan = await tx.companyKpiPlan.upsert({
      where: { startMonth },
      create: {
        name: input.name,
        startMonth,
        endMonth,
        durationMonths: input.durationMonths,
        ...targetWriteData(input.totals),
        createdById: actor.id,
        updatedById: actor.id,
      },
      update: {
        name: input.name,
        endMonth,
        durationMonths: input.durationMonths,
        ...targetWriteData(input.totals),
        updatedById: actor.id,
      },
    });

    await tx.companyMonthlyTarget.updateMany({ where: { planId: plan.id }, data: { planId: null } });
    for (const month of input.months) {
      const periodMonth = monthDate(month.periodMonth);
      await tx.companyMonthlyTarget.upsert({
        where: { periodMonth },
        create: {
          periodMonth,
          planId: plan.id,
          ...targetWriteData(month),
          createdById: actor.id,
          updatedById: actor.id,
        },
        update: {
          planId: plan.id,
          ...targetWriteData(month),
          updatedById: actor.id,
        },
      });
    }

    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: current ? "hr.company_kpi.plan.update" : "hr.company_kpi.plan.create",
      entityType: "company_kpi_plan",
      entityId: plan.id,
      before: current ? { name: current.name, startMonth: monthKey(current.startMonth), durationMonths: current.durationMonths } : null,
      after: {
        name: input.name,
        startMonth: input.startMonth,
        durationMonths: input.durationMonths,
        totals: input.totals,
        months: input.months,
      } as Prisma.InputJsonValue,
      reason: `${input.durationMonths} aylıq şirkət KPI planı yadda saxlanıldı`,
    });
    return plan;
  });

  revalidatePath("/hr");
  revalidatePath("/dashboard");
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

export const saveCompanyKpiPlanAction = safeServerAction(
  saveCompanyKpiPlanActionImpl,
  "Şirkət KPI planı yadda saxlanmadı.",
);

type TargetValues = z.infer<typeof targetValuesSchema>;

function parseJsonTargets(value: string, context: z.RefinementCtx) {
  try {
    return targetValuesSchema.parse(JSON.parse(value));
  } catch {
    context.addIssue({ code: "custom", message: "Plan hədəfləri düzgün deyil" });
    return z.NEVER;
  }
}

function assertPlanTotals(totals: TargetValues, months: TargetValues[]) {
  const keys = ["activeStudents", "newSales", "churn", "leads", "conversion", "revenue"] as const;
  for (const key of keys) {
    const sum = months.reduce((total, month) => total + month[key], 0);
    if (Math.abs(sum - totals[key]) > 0.011) {
      throw new PublicActionError(`${targetLabel(key)} üzrə aylıq bölgünün cəmi ümumi hədəfə bərabər deyil`);
    }
  }
}

function targetWriteData(value: TargetValues) {
  return {
    activeStudentsTarget: value.activeStudents,
    newSalesTarget: value.newSales,
    churnMaxTarget: value.churn,
    leadTarget: value.leads,
    conversionTarget: value.conversion,
    revenueTarget: value.revenue,
  };
}

function monthDate(value: string) {
  return new Date(`${value}-01T00:00:00.000Z`);
}

function addMonths(value: Date, amount: number) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + amount, 1));
}

function monthKey(value: Date) {
  return value.toISOString().slice(0, 7);
}

function targetLabel(key: keyof TargetValues) {
  return ({
    activeStudents: "Aktiv tələbə",
    newSales: "Yeni satış",
    churn: "Churn",
    leads: "Lead",
    conversion: "Conversion",
    revenue: "Revenue",
  } as const)[key];
}
