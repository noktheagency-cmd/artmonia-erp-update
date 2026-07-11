"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AppRole, FinanceSalaryMode, HrLookupKind } from "@/generated/prisma/client";
import { getPrisma } from "@/server/db/prisma";
import { requireMutationActor } from "@/server/auth/actor";
import { writeAuditLog } from "@/modules/audit/audit-service";
import { recalculateTeacherPayoutsForMonth } from "@/modules/hr/teacher-payroll";

const teacherAccountSchema = z.object({
  teacherId: z.string().uuid(),
  userId: z.union([z.string().uuid(), z.literal("")]),
});

const employeeSchema = z.object({
  id: z.string().uuid().optional(),
  fullName: z.string().trim().min(2).max(120),
  email: z.union([z.string().trim().email(), z.literal("")]),
  phone: z.string().trim().max(40),
  department: z.string().trim().min(2).max(80),
  position: z.string().trim().min(2).max(100),
  hireDate: z.coerce.date(),
  status: z.enum(["ACTIVE", "PROBATION", "ON_LEAVE", "INACTIVE"]),
  contractType: z.enum(["FULL_TIME", "PART_TIME", "CONTRACTOR"]),
  salaryMode: z.enum(["STATIC", "PERCENT"]),
  salaryAmount: z.coerce.number().nonnegative().max(250_000),
  salaryPercent: z.coerce.number().nonnegative().max(100),
  note: z.string().trim().max(1000),
}).superRefine((value, context) => {
  if (value.salaryMode === "STATIC" && value.salaryAmount <= 0) context.addIssue({ code: "custom", path: ["salaryAmount"], message: "Statik maaş sıfırdan böyük olmalıdır" });
  if (value.salaryMode === "PERCENT" && value.salaryPercent <= 0) context.addIssue({ code: "custom", path: ["salaryPercent"], message: "Faiz sıfırdan böyük olmalıdır" });
});

export async function createEmployeeAction(formData: FormData) {
  const actor = await requireMutationActor("hr.employee.manage");
  const input = employeeSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) throw new Error(input.error.issues[0]?.message ?? "İşçi məlumatları düzgün deyil");
  const employee = await getPrisma().hrEmployee.create({
    data: { ...input.data, salaryMode: input.data.salaryMode as FinanceSalaryMode, salaryPercent: input.data.salaryMode === "PERCENT" ? input.data.salaryPercent : null, salaryAmount: input.data.salaryMode === "STATIC" ? input.data.salaryAmount : 0, email: input.data.email || null, phone: input.data.phone || null, note: input.data.note || null, createdById: actor.id },
  });
  revalidatePath("/hr");
  return { id: employee.id };
}

export async function updateEmployeeAction(formData: FormData) {
  const actor = await requireMutationActor("hr.employee.manage");
  const input = employeeSchema.and(z.object({ id: z.string().uuid() })).parse(Object.fromEntries(formData));
  const before = await getPrisma().hrEmployee.findUnique({ where: { id: input.id } });
  if (!before) throw new Error("İşçi tapılmadı");
  const { id, ...rawData } = input;
  const data = { ...rawData, salaryMode: rawData.salaryMode as FinanceSalaryMode, salaryPercent: rawData.salaryMode === "PERCENT" ? rawData.salaryPercent : null, salaryAmount: rawData.salaryMode === "STATIC" ? rawData.salaryAmount : 0 };
  await getPrisma().$transaction(async (tx) => {
    await tx.hrEmployee.update({ where: { id }, data: { ...data, email: data.email || null, phone: data.phone || null, note: data.note || null } });
    await writeAuditLog(tx, { actorUserId: actor.id, action: "hr.employee.update", entityType: "hr_employee", entityId: id, before, after: data, reason: "İşçi profili yeniləndi" });
  });
  revalidatePath("/hr");
}

export async function createHrLookupAction(formData: FormData) {
  await requireMutationActor("hr.employee.manage");
  const input = z.object({ kind: z.enum(["DEPARTMENT", "POSITION"]), name: z.string().trim().min(2).max(80) }).parse(Object.fromEntries(formData));
  await getPrisma().hrLookupOption.upsert({
    where: { kind_name: { kind: input.kind as HrLookupKind, name: input.name } },
    create: { kind: input.kind as HrLookupKind, name: input.name },
    update: { isActive: true },
  });
  revalidatePath("/hr");
  return { name: input.name };
}

export async function updateTeacherSalaryRuleAction(formData: FormData) {
  const actor = await requireMutationActor("teacher.rule.manage");
  const input = z.object({ teacherId: z.string().uuid(), salaryPercent: z.coerce.number().positive().max(100) }).parse(Object.fromEntries(formData));
  const periodMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const prisma = getPrisma();
  await prisma.$transaction(async (tx) => {
    const teacher = await tx.teacher.findUnique({ where: { id: input.teacherId }, select: { id: true } });
    if (!teacher) throw new Error("Müəllim tapılmadı");
    const current = await tx.teacherContractRule.findFirst({ where: { teacherId: teacher.id, validFrom: { lte: periodMonth }, OR: [{ validTo: null }, { validTo: { gte: periodMonth } }] }, orderBy: { validFrom: "desc" } });
    if (current?.validFrom.getTime() === periodMonth.getTime()) {
      await tx.teacherContractRule.update({ where: { id: current.id }, data: { salaryPercent: input.salaryPercent } });
    } else {
      if (current) await tx.teacherContractRule.update({ where: { id: current.id }, data: { validTo: new Date(periodMonth.getTime() - 86_400_000) } });
      await tx.teacherContractRule.create({ data: { teacherId: teacher.id, salaryPercent: input.salaryPercent, validFrom: periodMonth, createdById: actor.id } });
    }
    await writeAuditLog(tx, { actorUserId: actor.id, action: "teacher.salary.rule.update", entityType: "teacher", entityId: teacher.id, before: current ? { salaryPercent: Number(current.salaryPercent) } : null, after: { salaryPercent: input.salaryPercent }, reason: "Müəllim maaş faizi yeniləndi" });
  });
  await recalculateTeacherPayoutsForMonth(periodMonth, actor.id, [input.teacherId]);
  revalidatePath("/hr"); revalidatePath("/finance");
}

const teacherProfileSchema = z.object({
  id: z.string().uuid().optional(),
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(40),
  capacity: z.coerce.number().int().positive().max(500),
  salaryPercent: z.coerce.number().positive().max(100),
});

export async function createTeacherAction(formData: FormData) {
  const actor = await requireMutationActor("teacher.rule.manage");
  const input = teacherProfileSchema.omit({ id: true }).parse(Object.fromEntries(formData));
  const periodMonth = currentMonth();
  const teacher = await getPrisma().$transaction(async (tx) => {
    const created = await tx.teacher.create({ data: { fullName: input.fullName, phone: input.phone || null, capacity: input.capacity } });
    await tx.teacherContractRule.create({ data: { teacherId: created.id, salaryPercent: input.salaryPercent, validFrom: periodMonth, createdById: actor.id } });
    await writeAuditLog(tx, { actorUserId: actor.id, action: "teacher.create", entityType: "teacher", entityId: created.id, after: input, reason: "Müəllim profili yaradıldı" });
    return created;
  });
  await recalculateTeacherPayoutsForMonth(periodMonth, actor.id, [teacher.id]);
  revalidatePath("/hr"); revalidatePath("/groups"); revalidatePath("/finance");
  return { id: teacher.id };
}

export async function updateTeacherAction(formData: FormData) {
  const actor = await requireMutationActor("teacher.rule.manage");
  const input = teacherProfileSchema.required({ id: true }).parse(Object.fromEntries(formData));
  const periodMonth = currentMonth();
  await getPrisma().$transaction(async (tx) => {
    const before = await tx.teacher.findUnique({ where: { id: input.id } });
    if (!before) throw new Error("Müəllim tapılmadı");
    await tx.teacher.update({ where: { id: input.id }, data: { fullName: input.fullName, phone: input.phone || null, capacity: input.capacity, isActive: true } });
    const rule = await tx.teacherContractRule.findFirst({ where: { teacherId: input.id, validFrom: { lte: periodMonth }, OR: [{ validTo: null }, { validTo: { gte: periodMonth } }] }, orderBy: { validFrom: "desc" } });
    if (rule?.validFrom.getTime() === periodMonth.getTime()) await tx.teacherContractRule.update({ where: { id: rule.id }, data: { salaryPercent: input.salaryPercent } });
    else {
      if (rule) await tx.teacherContractRule.update({ where: { id: rule.id }, data: { validTo: new Date(periodMonth.getTime() - 86_400_000) } });
      await tx.teacherContractRule.create({ data: { teacherId: input.id, salaryPercent: input.salaryPercent, validFrom: periodMonth, createdById: actor.id } });
    }
    await writeAuditLog(tx, { actorUserId: actor.id, action: "teacher.update", entityType: "teacher", entityId: input.id, before, after: input, reason: "Müəllim profili yeniləndi" });
  });
  await recalculateTeacherPayoutsForMonth(periodMonth, actor.id, [input.id]);
  revalidatePath("/hr"); revalidatePath("/groups"); revalidatePath("/finance");
}

export async function archiveTeacherAction(formData: FormData) {
  const actor = await requireMutationActor("teacher.rule.manage");
  const id = z.string().uuid().parse(formData.get("id"));
  await getPrisma().$transaction(async (tx) => {
    const before = await tx.teacher.findUnique({ where: { id } });
    if (!before) throw new Error("Müəllim tapılmadı");
    await tx.teacher.update({ where: { id }, data: { isActive: false } });
    await writeAuditLog(tx, { actorUserId: actor.id, action: "teacher.archive", entityType: "teacher", entityId: id, before, after: { isActive: false }, reason: "Müəllim profili passiv edildi" });
  });
  revalidatePath("/hr"); revalidatePath("/groups"); revalidatePath("/finance");
}

function currentMonth() { const now = new Date(); return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)); }

export async function deleteEmployeeAction(formData: FormData) {
  const actor = await requireMutationActor("hr.employee.manage");
  const id = z.string().uuid().parse(formData.get("id"));
  const before = await getPrisma().hrEmployee.findUnique({ where: { id } });
  if (!before) throw new Error("İşçi tapılmadı");
  await getPrisma().$transaction(async (tx) => {
    await tx.hrEmployee.delete({ where: { id } });
    await writeAuditLog(tx, { actorUserId: actor.id, action: "hr.employee.delete", entityType: "hr_employee", entityId: id, before, after: null, reason: "İşçi profili silindi" });
  });
  revalidatePath("/hr");
}

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
