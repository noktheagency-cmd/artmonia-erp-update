"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AppRole, FinanceSalaryMode, HrLookupKind, Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/server/db/prisma";
import { requireMutationActor } from "@/server/auth/actor";
import { writeAuditLog } from "@/modules/audit/audit-service";
import { recalculateTeacherPayoutsForMonth } from "@/modules/hr/teacher-payroll";
import {
  PublicActionError,
  safeServerAction,
} from "@/server/actions/safe-action";
import { getSupabaseAdminClient } from "@/server/supabase/admin";

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

async function createEmployeeActionImpl(formData: FormData) {
  const actor = await requireMutationActor("hr.employee.manage");
  const input = employeeSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) throw new PublicActionError(input.error.issues[0]?.message ?? "İşçi məlumatları düzgün deyil");
  const employee = await getPrisma().hrEmployee.create({
    data: { ...input.data, salaryMode: input.data.salaryMode as FinanceSalaryMode, salaryPercent: input.data.salaryMode === "PERCENT" ? input.data.salaryPercent : null, salaryAmount: input.data.salaryMode === "STATIC" ? input.data.salaryAmount : 0, email: input.data.email || null, phone: input.data.phone || null, note: input.data.note || null, createdById: actor.id },
  });
  revalidatePath("/hr");
  return { id: employee.id };
}

async function updateEmployeeActionImpl(formData: FormData) {
  const actor = await requireMutationActor("hr.employee.manage");
  const input = employeeSchema.and(z.object({ id: z.string().uuid() })).parse(Object.fromEntries(formData));
  const before = await getPrisma().hrEmployee.findUnique({ where: { id: input.id } });
  if (!before) throw new PublicActionError("İşçi tapılmadı", "NOT_FOUND");
  const { id, ...rawData } = input;
  const data = { ...rawData, salaryMode: rawData.salaryMode as FinanceSalaryMode, salaryPercent: rawData.salaryMode === "PERCENT" ? rawData.salaryPercent : null, salaryAmount: rawData.salaryMode === "STATIC" ? rawData.salaryAmount : 0 };
  await getPrisma().$transaction(async (tx) => {
    await tx.hrEmployee.update({ where: { id }, data: { ...data, email: data.email || null, phone: data.phone || null, note: data.note || null } });
    await writeAuditLog(tx, { actorUserId: actor.id, action: "hr.employee.update", entityType: "hr_employee", entityId: id, before, after: data, reason: "İşçi profili yeniləndi" });
  });
  revalidatePath("/hr");
  revalidatePath("/tasks");
}

async function createHrLookupActionImpl(formData: FormData) {
  await requireMutationActor("hr.employee.manage");
  const input = z.object({
    kind: z.enum(["DEPARTMENT", "POSITION"]),
    name: z.string().trim().min(2).max(80).refine((value) => value !== "__new", "Rezerv olunmuş dəyər istifadə edilə bilməz"),
  }).parse(Object.fromEntries(formData));
  await getPrisma().hrLookupOption.upsert({
    where: { kind_name: { kind: input.kind as HrLookupKind, name: input.name } },
    create: { kind: input.kind as HrLookupKind, name: input.name },
    update: { isActive: true },
  });
  revalidatePath("/hr");
  return { name: input.name };
}

async function updateTeacherSalaryRuleActionImpl(formData: FormData) {
  const actor = await requireMutationActor("teacher.rule.manage");
  const input = z.object({ teacherId: z.string().uuid(), salaryPercent: z.coerce.number().positive().max(100) }).parse(Object.fromEntries(formData));
  const periodMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const prisma = getPrisma();
  await prisma.$transaction(async (tx) => {
    const teacher = await tx.teacher.findUnique({ where: { id: input.teacherId }, select: { id: true } });
    if (!teacher) throw new PublicActionError("Müəllim tapılmadı", "NOT_FOUND");
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
  salaryPercent: z.preprocess(
    (value) => value === "" || value == null ? undefined : value,
    z.coerce.number().positive().max(100).optional(),
  ),
});

async function createTeacherActionImpl(formData: FormData) {
  const actor = await requireMutationActor("teacher.rule.manage");
  const input = teacherProfileSchema.omit({ id: true }).parse(Object.fromEntries(formData));
  const salaryPercent = input.salaryPercent;
  if (!salaryPercent) throw new PublicActionError("Maaş faizi tələb olunur");
  const periodMonth = currentMonth();
  const teacher = await getPrisma().$transaction(async (tx) => {
    const created = await tx.teacher.create({ data: { fullName: input.fullName, phone: input.phone || null, capacity: input.capacity } });
    await tx.teacherContractRule.create({ data: { teacherId: created.id, salaryPercent, validFrom: periodMonth, createdById: actor.id } });
    await writeAuditLog(tx, { actorUserId: actor.id, action: "teacher.create", entityType: "teacher", entityId: created.id, after: input, reason: "Müəllim profili yaradıldı" });
    return created;
  });
  await recalculateTeacherPayoutsForMonth(periodMonth, actor.id, [teacher.id]);
  revalidatePath("/hr"); revalidatePath("/groups"); revalidatePath("/finance");
  return { id: teacher.id };
}

async function updateTeacherActionImpl(formData: FormData) {
  const actor = await requireMutationActor("teacher.rule.manage");
  const input = teacherProfileSchema.required({ id: true }).parse(Object.fromEntries(formData));
  const periodMonth = currentMonth();
  await getPrisma().$transaction(async (tx) => {
    const before = await tx.teacher.findUnique({ where: { id: input.id } });
    if (!before) throw new PublicActionError("Müəllim tapılmadı", "NOT_FOUND");
    await tx.teacher.update({ where: { id: input.id }, data: { fullName: input.fullName, phone: input.phone || null, capacity: input.capacity } });
    await tx.hrEmployee.updateMany({
      where: { teacherId: input.id },
      data: { fullName: input.fullName, phone: input.phone || null },
    });
    if (input.salaryPercent) {
      const rule = await tx.teacherContractRule.findFirst({ where: { teacherId: input.id, validFrom: { lte: periodMonth }, OR: [{ validTo: null }, { validTo: { gte: periodMonth } }] }, orderBy: { validFrom: "desc" } });
      if (rule?.validFrom.getTime() === periodMonth.getTime()) await tx.teacherContractRule.update({ where: { id: rule.id }, data: { salaryPercent: input.salaryPercent } });
      else {
        if (rule) await tx.teacherContractRule.update({ where: { id: rule.id }, data: { validTo: new Date(periodMonth.getTime() - 86_400_000) } });
        await tx.teacherContractRule.create({ data: { teacherId: input.id, salaryPercent: input.salaryPercent, validFrom: periodMonth, createdById: actor.id } });
      }
    }
    await writeAuditLog(tx, { actorUserId: actor.id, action: "teacher.update", entityType: "teacher", entityId: input.id, before, after: input, reason: "Müəllim profili yeniləndi" });
  });
  await recalculateTeacherPayoutsForMonth(periodMonth, actor.id, [input.id]);
  revalidatePath("/hr"); revalidatePath("/groups"); revalidatePath("/finance");
}

async function deleteTeacherActionImpl(formData: FormData) {
  const actor = await requireMutationActor("teacher.rule.manage");
  const id = z.string().uuid().parse(formData.get("id"));
  await getPrisma().$transaction(async (tx) => {
    const teacher = await tx.teacher.findUnique({
      where: { id },
      include: {
        hrEmployee: { include: { user: { include: { roles: { include: { role: true } } } } } },
        user: { include: { roles: { include: { role: true } } } },
      },
    });
    if (!teacher) throw new PublicActionError("Müəllim tapılmadı", "NOT_FOUND");
    await assertTeacherCanBeRemoved(tx, id);

    const userId = teacher.userId ?? teacher.hrEmployee?.userId ?? null;
    const teacherRole = userId
      ? await tx.role.findUnique({ where: { code: AppRole.TEACHER } })
      : null;
    const linkedUser = teacher.user ?? teacher.hrEmployee?.user ?? null;
    const otherRoleNames = linkedUser?.roles
      .map(({ role }) => role)
      .filter((role) => role.code !== AppRole.TEACHER)
      .map((role) => role.name) ?? [];

    if (teacher.hrEmployee) {
      await tx.hrEmployee.update({
        where: { id: teacher.hrEmployee.id },
        data: {
          teacherId: null,
          staffType: "EMPLOYEE",
          position: teacher.hrEmployee.position === "Müəllim"
            ? otherRoleNames[0] ?? "Əməkdaş"
            : teacher.hrEmployee.position,
        },
      });
    }
    if (userId && teacherRole) {
      await tx.userRole.deleteMany({ where: { userId, roleId: teacherRole.id } });
    }
    await tx.teacher.delete({ where: { id } });
    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "teacher.delete",
      entityType: "teacher",
      entityId: id,
      before: {
        fullName: teacher.fullName,
        isActive: teacher.isActive,
        userId,
        roles: linkedUser?.roles.map(({ role }) => role.name) ?? [],
      },
      after: {
        teacherProfileDeleted: true,
        preservedRoles: otherRoleNames,
        hrEmployeeId: teacher.hrEmployee?.id ?? null,
      },
      reason: "Müəllim profili silindi; istifadəçi hesabı və digər rollar qorundu",
    });
  });
  revalidatePath("/hr"); revalidatePath("/groups"); revalidatePath("/finance");
}

async function assertTeacherCanBeRemoved(tx: Prisma.TransactionClient, teacherId: string) {
  const [activeClassSlots, activeEnrollments, attendanceRecords, bonusCohorts, payouts] = await Promise.all([
    tx.classSlot.count({ where: { teacherId } }),
    tx.enrollment.count({ where: { teacherId, status: "ACTIVE" } }),
    tx.attendanceRecord.count({ where: { teacherId } }),
    tx.hrBonusTeacherCohort.count({ where: { teacherId } }),
    tx.teacherPayout.count({ where: { teacherId } }),
  ]);
  if (activeClassSlots || activeEnrollments) {
    throw new PublicActionError(
      "Müəllimlik statusunu silməzdən əvvəl slot və tələbə təyinatlarını başqa müəllimə keçirin",
      "CONFLICT",
    );
  }
  if (attendanceRecords || bonusCohorts || payouts) {
    throw new PublicActionError(
      "Bu müəllimin maliyyə və ya davamiyyət tarixçəsi var; profil silinə bilməz",
      "CONFLICT",
    );
  }
}

function currentMonth() { const now = new Date(); return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)); }

/** Mirrors teacher-directory active seat count used in HR UI. */
async function countTeacherActiveStudents(teacherId: string) {
  const rows = await getPrisma().$queryRaw<Array<{ count: number }>>(Prisma.sql`
    select count(distinct s.id)::int as count
    from erp.student_schedule_assignments ssa
    join erp.class_slots cs on cs.id = ssa.slot_id
    join erp.enrollments e on e.id = ssa.enrollment_id
    join erp.students s on s.id = e.student_id
    where cs.teacher_id = ${teacherId}::uuid
      and ssa.valid_to is null
      and e.status = 'ACTIVE'::"erp"."EnrollmentStatus"
      and s.lifecycle_status = 'ACTIVE'::"erp"."StudentLifecycleStatus"
      and s.is_test_data = false
  `);
  return Number(rows[0]?.count ?? 0);
}

async function deleteEmployeeActionImpl(formData: FormData) {
  const actor = await requireMutationActor("hr.employee.manage");
  const input = z.object({
    id: z.string().uuid(),
    employmentEndedAt: z.string().date(),
    exitReason: z.string().trim().min(3, "İşdən ayrılma səbəbini qeyd edin").max(500),
  }).parse(Object.fromEntries(formData));
  const before = await getPrisma().hrEmployee.findUnique({
    where: { id: input.id },
    include: {
      user: { select: { id: true, authUserId: true, isActive: true } },
      teacher: { select: { id: true, isActive: true } },
    },
  });
  if (!before) throw new PublicActionError("İşçi tapılmadı", "NOT_FOUND");
  if (before.archivedAt) throw new PublicActionError("İşçi artıq arxivdədir", "CONFLICT");

  if (before.teacherId) {
    // Same definition as teacher-directory activeStudentCount: open slot seat +
    // ACTIVE enrollment + ACTIVE student. Historical/paused/stopped leftovers must not block archive.
    const activeStudentCount = await countTeacherActiveStudents(before.teacherId);
    if (activeStudentCount > 0) {
      throw new PublicActionError(
        `Müəllimi arxivləməzdən əvvəl aktiv tələbələri başqa müəllimə keçirin (${activeStudentCount} aktiv tələbə qalıb).`,
        "CONFLICT",
      );
    }
  }

  const employmentEndedAt = new Date(`${input.employmentEndedAt}T00:00:00.000Z`);
  const archivedAt = new Date();
  const userId = before.user?.id ?? null;
  await getPrisma().$transaction(async (tx) => {
    const [leadDisconnect, studentDisconnect, taskDisconnect] = userId
      ? await Promise.all([
          tx.lead.updateMany({
            where: { managerId: userId, stage: { notIn: ["REGISTERED", "LOST"] } },
            data: { managerId: null },
          }),
          tx.student.updateMany({
            where: { managerId: userId, lifecycleStatus: { in: ["SLOT_WAITING", "ACTIVE"] } },
            data: { managerId: null },
          }),
          tx.task.updateMany({
            where: { ownerUserId: userId, status: { in: ["OPEN", "IN_PROGRESS"] } },
            data: { ownerUserId: null },
          }),
        ])
      : [{ count: 0 }, { count: 0 }, { count: 0 }];

    if (before.teacherId) {
      await tx.teacher.update({
        where: { id: before.teacherId },
        data: { isActive: false, userId: null },
      });
    }
    if (userId) {
      await tx.userRole.deleteMany({ where: { userId } });
      await tx.authSessionRecord.updateMany({
        where: { userId, revokedAt: null },
        data: {
          revokedAt: archivedAt,
          revokedById: actor.id,
          revokeReason: `HR arxiv: ${input.exitReason}`,
        },
      });
      await tx.user.update({
        where: { id: userId },
        data: { isActive: false, authUserId: null },
      });
    }
    await tx.hrEmployee.update({
      where: { id: input.id },
      data: {
        status: "INACTIVE",
        employmentEndedAt,
        exitReason: input.exitReason,
        archivedAt,
        archivedById: actor.id,
      },
    });
    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "hr.employee.archive",
      entityType: "hr_employee",
      entityId: input.id,
      before: {
        id: before.id,
        fullName: before.fullName,
        status: before.status,
        userId,
        teacherId: before.teacherId,
      },
      after: {
        status: "INACTIVE",
        employmentEndedAt: input.employmentEndedAt,
        archivedAt: archivedAt.toISOString(),
        disconnectedLeadCount: leadDisconnect.count,
        disconnectedStudentCount: studentDisconnect.count,
        disconnectedTaskCount: taskDisconnect.count,
        accessDisabled: Boolean(userId),
      },
      reason: input.exitReason,
    });
  });
  if (before.user?.authUserId) {
    const { error } = await getSupabaseAdminClient().auth.admin.deleteUser(before.user.authUserId);
    if (error) {
      console.error("Archived employee auth cleanup failed", {
        employeeId: before.id,
        authUserId: before.user.authUserId,
        message: error.message,
      });
    }
  }
  revalidatePath("/hr");
  revalidatePath("/tasks");
  revalidatePath("/crm");
  revalidatePath("/students");
  revalidatePath("/dashboard");
  revalidatePath("/finance");
  return { id: before.id, archived: true };
}

async function linkTeacherAccountActionImpl(formData: FormData) {
  const actor = await requireMutationActor("teacher.account.manage");
  const input = teacherAccountSchema.parse(Object.fromEntries(formData));
  const prisma = getPrisma();

  await prisma.$transaction(async (tx) => {
    const teacher = await tx.teacher.findUnique({
      where: { id: input.teacherId },
      include: { hrEmployee: { select: { userId: true } } },
    });
    if (!teacher) throw new PublicActionError("Müəllim tapılmadı", "NOT_FOUND");

    if (input.userId) {
      const user = await tx.user.findFirst({
        where: {
          id: input.userId,
          isActive: true,
          roles: { some: { role: { code: AppRole.TEACHER } } },
        },
        include: { hrEmployeeProfile: { select: { teacherId: true } } },
      });
      if (!user) throw new PublicActionError("Aktiv TEACHER istifadəçisi tapılmadı", "NOT_FOUND");
      if (teacher.userId && teacher.userId !== user.id) {
        throw new PublicActionError("Müəllim profili başqa ERP hesabına bağlıdır", "CONFLICT");
      }
      if (teacher.hrEmployee?.userId && teacher.hrEmployee.userId !== user.id) {
        throw new PublicActionError("Müəllimin HR profili başqa ERP hesabına bağlıdır", "CONFLICT");
      }
      if (user.hrEmployeeProfile?.teacherId && user.hrEmployeeProfile.teacherId !== teacher.id) {
        throw new PublicActionError("ERP hesabının HR profili başqa müəllimə bağlıdır", "CONFLICT");
      }
      const alreadyLinked = await tx.teacher.findFirst({
        where: { userId: user.id, id: { not: teacher.id } },
        select: { id: true },
      });
      if (alreadyLinked) throw new PublicActionError("Bu ERP hesabı başqa müəllimə bağlıdır", "CONFLICT");
    } else if (teacher.userId && teacher.hrEmployee?.userId === teacher.userId) {
      const linkedTeacherRole = await tx.userRole.findFirst({
        where: { userId: teacher.userId, role: { code: AppRole.TEACHER } },
        select: { userId: true },
      });
      if (linkedTeacherRole) {
        throw new PublicActionError(
          "Aktiv müəllim rolunu ayırmaq üçün əvvəlcə hesabın TEACHER rolunu dəyişin",
          "CONFLICT",
        );
      }
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
  revalidatePath("/dashboard");
}

export const createEmployeeAction = safeServerAction(
  createEmployeeActionImpl,
  "İşçi yaradıla bilmədi.",
);
export const updateEmployeeAction = safeServerAction(
  updateEmployeeActionImpl,
  "İşçi məlumatları yenilənə bilmədi.",
);
export const createHrLookupAction = safeServerAction(
  createHrLookupActionImpl,
  "Yeni seçim yaradıla bilmədi.",
);
export const updateTeacherSalaryRuleAction = safeServerAction(
  updateTeacherSalaryRuleActionImpl,
  "Müəllim maaş qaydası yenilənə bilmədi.",
);
export const createTeacherAction = safeServerAction(
  createTeacherActionImpl,
  "Müəllim yaradıla bilmədi.",
);
export const updateTeacherAction = safeServerAction(
  updateTeacherActionImpl,
  "Müəllim məlumatları yenilənə bilmədi.",
);
export const deleteTeacherAction = safeServerAction(
  deleteTeacherActionImpl,
  "Müəllim profili silinə bilmədi.",
);
export const deleteEmployeeAction = safeServerAction(
  deleteEmployeeActionImpl,
  "İşçi arxivə göndərilə bilmədi.",
);
export const linkTeacherAccountAction = safeServerAction(
  linkTeacherAccountActionImpl,
  "Müəllim hesabı əlaqələndirilə bilmədi.",
);
