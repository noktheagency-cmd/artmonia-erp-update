"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AppRole, FinanceSalaryMode, HrStaffType, Prisma } from "@/generated/prisma/client";
import { isProtectedTeamRole } from "@/lib/protected-roles";
import { writeAuditLog } from "@/modules/audit/audit-service";
import { recalculateTeacherPayoutsForMonth } from "@/modules/hr/teacher-payroll";
import { requireMutationActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";
import { getSupabaseAdminClient } from "@/server/supabase/admin";
import {
  PublicActionError,
  safeServerAction,
} from "@/server/actions/safe-action";
import {
  deleteProfilePhoto,
  uploadProfilePhoto,
} from "@/server/storage/erp-files";

const roleIdsSchema = z.preprocess((value) => {
  if (value == null || value === "") return [];
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}, z.array(z.string().uuid()).max(20));

const staffSchema = z.object({
  id: z.string().uuid().optional(),
  staffType: z.enum(["EMPLOYEE", "TEACHER"]).default("EMPLOYEE"),
  fullName: z.string().trim().min(2).max(120),
  email: z.union([z.string().trim().email(), z.literal("")]),
  phone: z.string().trim().max(40),
  address: z.string().trim().max(240),
  department: z.string().trim().min(2).max(80).refine((value) => value !== "__new", "Departament seçilməlidir"),
  position: z.string().trim().min(2).max(100).refine((value) => value !== "__new", "Vəzifə seçilməlidir"),
  hireDate: z.coerce.date(),
  status: z.enum(["ACTIVE", "PROBATION", "ON_LEAVE", "INACTIVE"]),
  contractType: z.enum(["FULL_TIME", "PART_TIME", "CONTRACTOR"]),
  salaryMode: z.enum(["STATIC", "PERCENT"]),
  salaryAmount: z.coerce.number().nonnegative().max(250_000),
  salaryPercent: z.coerce.number().nonnegative().max(100),
  note: z.string().trim().max(1000),
  teacherCapacity: z.coerce.number().int().nonnegative().max(500).default(0),
  createAccount: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  loginEmail: z.union([z.string().trim().email(), z.literal("")]).default(""),
  password: z.string().max(72).default(""),
  roleIds: roleIdsSchema,
}).superRefine((value, context) => {
  if (value.salaryMode === "STATIC" && value.salaryAmount <= 0) context.addIssue({ code: "custom", path: ["salaryAmount"], message: "Statik maaş sıfırdan böyük olmalıdır" });
  if (value.salaryMode === "PERCENT" && value.salaryPercent <= 0) context.addIssue({ code: "custom", path: ["salaryPercent"], message: "Faiz sıfırdan böyük olmalıdır" });
  if (value.staffType === "TEACHER" && value.teacherCapacity <= 0) context.addIssue({ code: "custom", path: ["teacherCapacity"], message: "Müəllim üçün tələbə tutumu tələb olunur" });
  if (value.staffType === "EMPLOYEE" && value.position === "Müəllim") context.addIssue({ code: "custom", path: ["position"], message: "Müəllimlik statusunu silərkən başqa vəzifə seçilməlidir" });
  if (value.createAccount && !value.loginEmail) context.addIssue({ code: "custom", path: ["loginEmail"], message: "Giriş e-poçtu tələb olunur" });
  if (value.createAccount && value.password.length < 8) context.addIssue({ code: "custom", path: ["password"], message: "Parol ən az 8 simvol olmalıdır" });
  if (value.createAccount && value.roleIds.length === 0) context.addIssue({ code: "custom", path: ["roleIds"], message: "Ən az bir ERP rolu seçilməlidir" });
});

async function createStaffActionImpl(formData: FormData) {
  const actor = await requireMutationActor("hr.employee.manage");
  const parsed = staffSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new PublicActionError(parsed.error.issues[0]?.message ?? "Əməkdaş məlumatları düzgün deyil");
  const input = parsed.data;
  if (input.createAccount && !actor.permissions.has("auth.user.manage")) throw new PublicActionError("ERP giriş hesabı yaratmaq üçün istifadəçi idarəetmə icazəsi tələb olunur", "FORBIDDEN");

  const prisma = getPrisma();
  const [roles, emailOwner, teacherRole] = await Promise.all([
    input.createAccount
      ? prisma.role.findMany({ where: { id: { in: input.roleIds } } })
      : [],
    input.createAccount
      ? prisma.user.findFirst({
          where: { email: { equals: input.loginEmail, mode: "insensitive" } },
          select: { id: true },
        })
      : null,
    input.createAccount && input.staffType === "TEACHER"
      ? prisma.role.findUnique({ where: { code: AppRole.TEACHER } })
      : null,
  ]);
  if (input.createAccount && (roles.length !== input.roleIds.length || roles.some((role) => isProtectedTeamRole(role.code)))) {
    throw new PublicActionError("Seçilmiş rollardan biri tapılmadı və ya təyin edilə bilməz", "NOT_FOUND");
  }
  if (input.createAccount && input.staffType === "TEACHER" && !teacherRole) {
    throw new PublicActionError("Müəllim sistem rolu tapılmadı", "NOT_FOUND");
  }
  const effectiveRoles = teacherRole && !roles.some((role) => role.id === teacherRole.id)
    ? [...roles, teacherRole]
    : roles;
  if (emailOwner) throw new PublicActionError("Bu e-poçt ünvanı ilə giriş hesabı artıq mövcuddur", "DUPLICATE");

  let authUserId: string | null = null;
  let profilePhotoUrl: string | null = null;
  try {
    profilePhotoUrl = await persistProfilePhoto(formData.get("profilePhoto"));
    if (input.createAccount) {
      const { data, error } = await getSupabaseAdminClient().auth.admin.createUser({ email: input.loginEmail, password: input.password, email_confirm: true, user_metadata: { full_name: input.fullName, avatar_url: profilePhotoUrl } });
      if (error || !data.user) throw new PublicActionError(
        error?.message ?? "Supabase giriş hesabı yaradıla bilmədi",
        error?.message && /already|exists|registered/i.test(error.message) ? "DUPLICATE" : "VALIDATION",
      );
      authUserId = data.user.id;
    }
    const result = await prisma.$transaction(async (tx) => {
      const erpUser = authUserId ? await tx.user.create({ data: { authUserId, fullName: input.fullName, email: input.loginEmail, phone: input.phone || null, isActive: true } }) : null;
      if (erpUser && effectiveRoles.length) {
        await tx.userRole.createMany({
          data: effectiveRoles.map((role) => ({ userId: erpUser.id, roleId: role.id })),
        });
      }

      let teacherId: string | null = null;
      if (input.staffType === "TEACHER") {
        const teacher = await tx.teacher.create({ data: { userId: erpUser?.id ?? null, fullName: input.fullName, phone: input.phone || null, capacity: input.teacherCapacity } });
        teacherId = teacher.id;
        if (input.salaryMode === "PERCENT") {
          await tx.teacherContractRule.create({ data: { teacherId, salaryPercent: input.salaryPercent, validFrom: currentMonth(), createdById: actor.id } });
        }
      }

      const employee = await tx.hrEmployee.create({ data: {
        userId: erpUser?.id ?? null,
        teacherId,
        staffType: input.staffType as HrStaffType,
        fullName: input.fullName,
        email: input.email || input.loginEmail || null,
        phone: input.phone || null,
        address: input.address || null,
        department: input.department,
        position: input.staffType === "TEACHER" ? "Müəllim" : input.position,
        hireDate: input.hireDate,
        status: input.status,
        contractType: input.contractType,
        salaryMode: input.salaryMode as FinanceSalaryMode,
        salaryPercent: input.salaryMode === "PERCENT" ? input.salaryPercent : null,
        salaryAmount: input.salaryMode === "STATIC" ? input.salaryAmount : 0,
        profilePhotoUrl,
        note: input.note || null,
        createdById: actor.id,
      } });
      await writeAuditLog(tx, { actorUserId: actor.id, action: "hr.staff.create", entityType: "hr_employee", entityId: employee.id, after: { fullName: employee.fullName, staffType: employee.staffType, email: employee.email, profilePhotoUrl, loginCreated: Boolean(authUserId), roles: effectiveRoles.map((role) => role.name), teacherId } as Prisma.InputJsonValue, reason: input.staffType === "TEACHER" ? "Müəllim əməkdaş profili yaradıldı" : "Əməkdaş profili yaradıldı" });
      return { employeeId: employee.id, teacherId };
    });
    revalidateHr();
    return result;
  } catch (error) {
    if (authUserId) {
      await getSupabaseAdminClient().auth.admin.deleteUser(authUserId).catch(() => undefined);
    }
    if (profilePhotoUrl) await deleteLocalProfilePhoto(profilePhotoUrl);
    throw error;
  }
}

async function updateStaffActionImpl(formData: FormData) {
  const actor = await requireMutationActor("hr.employee.manage");
  const input = staffSchema.required({ id: true }).parse(Object.fromEntries(formData));
  const before = await getPrisma().hrEmployee.findUnique({
    where: { id: input.id },
    include: {
      teacher: true,
      user: { include: { roles: { include: { role: true } } } },
    },
  });
  if (!before) throw new PublicActionError("Əməkdaş tapılmadı", "NOT_FOUND");
  const becomingTeacher = input.staffType === "TEACHER" && !before.teacherId;
  const leavingTeacher = input.staffType === "EMPLOYEE" && Boolean(before.teacherId);
  const shouldUpdateRoles = formData.has("roleIds") && Boolean(before.userId);
  if (shouldUpdateRoles && !actor.permissions.has("auth.user.manage")) {
    throw new PublicActionError("Əməkdaş rollarını dəyişmək üçün istifadəçi idarəetmə icazəsi tələb olunur", "FORBIDDEN");
  }
  if (shouldUpdateRoles && input.roleIds.length === 0 && !leavingTeacher) {
    throw new PublicActionError("Əməkdaş üçün ən az bir rol seçilməlidir");
  }
  const selectedRoles = shouldUpdateRoles
    ? await getPrisma().role.findMany({ where: { id: { in: input.roleIds } } })
    : [];
  const currentProtectedRoles = before.user?.roles
    .map(({ role }) => role)
    .filter((role) => isProtectedTeamRole(role.code)) ?? [];
  const currentProtectedRoleIds = new Set(currentProtectedRoles.map((role) => role.id));
  if (
    shouldUpdateRoles &&
    (selectedRoles.length !== input.roleIds.length ||
      selectedRoles.some((role) => isProtectedTeamRole(role.code) && !currentProtectedRoleIds.has(role.id)))
  ) {
    throw new PublicActionError("Seçilmiş rollardan biri tapılmadı və ya təyin edilə bilməz", "NOT_FOUND");
  }
  const assignableSelectedRoles = selectedRoles.filter((role) => !isProtectedTeamRole(role.code));
  const teacherRole = before.userId
    ? await getPrisma().role.findUnique({ where: { code: AppRole.TEACHER } })
    : null;
  if (before.userId && input.staffType === "TEACHER" && !teacherRole) {
    throw new PublicActionError("Müəllim sistem rolu tapılmadı", "NOT_FOUND");
  }
  const roles = shouldUpdateRoles
    ? input.staffType === "TEACHER"
      ? [...currentProtectedRoles, ...assignableSelectedRoles.filter((role) => role.code !== AppRole.TEACHER), ...(teacherRole ? [teacherRole] : [])]
      : [...currentProtectedRoles, ...assignableSelectedRoles.filter((role) => role.code !== AppRole.TEACHER)]
    : [];

  const uploadedProfilePhotoUrl = await persistProfilePhoto(formData.get("profilePhoto"));

  const employeeData = {
    staffType: input.staffType as HrStaffType,
    fullName: input.fullName,
    email: input.email || null,
    phone: input.phone || null,
    address: input.address || null,
    department: input.department,
    position: input.staffType === "TEACHER" ? "Müəllim" : input.position,
    hireDate: input.hireDate,
    status: input.status,
    contractType: input.contractType,
    salaryMode: input.salaryMode as FinanceSalaryMode,
    salaryPercent: input.salaryMode === "PERCENT" ? input.salaryPercent : null,
    salaryAmount: input.salaryMode === "STATIC" ? input.salaryAmount : 0,
    profilePhotoUrl: uploadedProfilePhotoUrl ?? before.profilePhotoUrl,
    note: input.note || null,
  };
  let teacherIdForRecalculation = before.teacherId;
  try {
    await getPrisma().$transaction(async (tx) => {
      let nextTeacherId = before.teacherId;

      if (becomingTeacher) {
        const byUser = before.userId
          ? await tx.teacher.findUnique({
              where: { userId: before.userId },
              include: { hrEmployee: { select: { id: true } } },
            })
          : null;
        const reusableTeacher = byUser ?? await tx.teacher.findUnique({
          where: { fullName: input.fullName },
          include: { hrEmployee: { select: { id: true } } },
        });
        if (reusableTeacher) {
          const isRemovedProfile = !reusableTeacher.isActive
            && !reusableTeacher.userId
            && !reusableTeacher.hrEmployee;
          const isSameUnlinkedUser = Boolean(before.userId)
            && reusableTeacher.userId === before.userId
            && !reusableTeacher.hrEmployee;
          if (!isRemovedProfile && !isSameUnlinkedUser) {
            throw new PublicActionError("Bu ad və ya ERP hesabı başqa müəllim profilinə bağlıdır", "CONFLICT");
          }
          if (reusableTeacher.hrEmployee?.id && reusableTeacher.hrEmployee.id !== input.id) {
            throw new PublicActionError("Bu müəllim profili başqa əməkdaşa bağlıdır", "CONFLICT");
          }
        }
        const teacher = reusableTeacher
          ? await tx.teacher.update({
              where: { id: reusableTeacher.id },
              data: {
                userId: before.userId,
                fullName: input.fullName,
                phone: input.phone || null,
                capacity: input.teacherCapacity,
                isActive: true,
              },
            })
          : await tx.teacher.create({
              data: {
                userId: before.userId,
                fullName: input.fullName,
                phone: input.phone || null,
                capacity: input.teacherCapacity,
                isActive: true,
              },
            });
        nextTeacherId = teacher.id;
        teacherIdForRecalculation = teacher.id;
        if (input.salaryMode === "PERCENT") {
          await syncTeacherSalaryRule(tx, teacher.id, input.salaryPercent, actor.id);
        }
      }

      if (leavingTeacher && before.teacherId) {
        await assertTeacherCanBeRemoved(tx, before.teacherId);
        await tx.teacher.update({
          where: { id: before.teacherId },
          data: { isActive: false, userId: null },
        });
        nextTeacherId = null;
        teacherIdForRecalculation = null;
      }

      await tx.hrEmployee.update({
        where: { id: input.id },
        data: { ...employeeData, teacherId: nextTeacherId },
      });
      if (shouldUpdateRoles && before.userId) {
        await tx.userRole.deleteMany({ where: { userId: before.userId } });
        if (roles.length) {
          await tx.userRole.createMany({
            data: roles.map((role) => ({ userId: before.userId!, roleId: role.id })),
          });
        }
      } else if (before.userId && teacherRole) {
        if (input.staffType === "TEACHER") {
          await tx.userRole.upsert({
            where: { userId_roleId: { userId: before.userId, roleId: teacherRole.id } },
            create: { userId: before.userId, roleId: teacherRole.id },
            update: {},
          });
        } else {
          await tx.userRole.deleteMany({
            where: { userId: before.userId, roleId: teacherRole.id },
          });
        }
      }
      if (before.teacherId && !leavingTeacher) {
        await tx.teacher.update({
          where: { id: before.teacherId },
          data: {
            fullName: input.fullName,
            phone: input.phone || null,
            capacity: input.teacherCapacity || undefined,
          },
        });
      }
      if (before.teacherId && !leavingTeacher && input.salaryMode === "PERCENT") {
        await syncTeacherSalaryRule(tx, before.teacherId, input.salaryPercent, actor.id);
      }
      await writeAuditLog(tx, {
        actorUserId: actor.id,
        action: leavingTeacher ? "hr.teacher.remove" : becomingTeacher ? "hr.teacher.add" : "hr.employee.update",
        entityType: "hr_employee",
        entityId: input.id,
        before: { ...before, roles: before.user?.roles.map(({ role }) => role.name) } as Prisma.InputJsonValue,
        after: {
          ...employeeData,
          teacherId: nextTeacherId,
          roles: shouldUpdateRoles ? roles.map((role) => role.name) : undefined,
        } as Prisma.InputJsonValue,
        reason: leavingTeacher
          ? "Əməkdaşın müəllimlik statusu silindi; digər rolları qorundu"
          : becomingTeacher
            ? "Əməkdaşa müəllimlik statusu əlavə edildi"
            : "Əməkdaş profili yeniləndi",
      });
    });
  } catch (error) {
    if (uploadedProfilePhotoUrl) await deleteLocalProfilePhoto(uploadedProfilePhotoUrl);
    throw error;
  }
  if (uploadedProfilePhotoUrl && before.profilePhotoUrl && before.profilePhotoUrl !== uploadedProfilePhotoUrl) {
    await deleteLocalProfilePhoto(before.profilePhotoUrl);
  }
  if (teacherIdForRecalculation && input.salaryMode === "PERCENT") {
    await recalculateTeacherPayoutsForMonth(currentMonth(), actor.id, [teacherIdForRecalculation]);
  }
  revalidateHr();
}

export const createStaffAction = safeServerAction(
  createStaffActionImpl,
  "Əməkdaş yaradıla bilmədi.",
);

export const updateStaffAction = safeServerAction(
  updateStaffActionImpl,
  "Əməkdaş məlumatları yenilənə bilmədi.",
);

async function syncTeacherSalaryRule(
  tx: Prisma.TransactionClient,
  teacherId: string,
  salaryPercent: number,
  actorId: string,
) {
  const periodMonth = currentMonth();
  const current = await tx.teacherContractRule.findFirst({
    where: {
      teacherId,
      validFrom: { lte: periodMonth },
      OR: [{ validTo: null }, { validTo: { gte: periodMonth } }],
    },
    orderBy: [{ validFrom: "desc" }, { createdAt: "desc" }],
  });

  if (current?.validFrom.getTime() === periodMonth.getTime()) {
    await tx.teacherContractRule.update({
      where: { id: current.id },
      data: { salaryPercent },
    });
    return;
  }

  if (current) {
    await tx.teacherContractRule.update({
      where: { id: current.id },
      data: { validTo: new Date(periodMonth.getTime() - 86_400_000) },
    });
  }
  await tx.teacherContractRule.create({
    data: { teacherId, salaryPercent, validFrom: periodMonth, createdById: actorId },
  });
}

async function assertTeacherCanBeRemoved(tx: Prisma.TransactionClient, teacherId: string) {
  const [activeClassSlots, activeEnrollments] = await Promise.all([
    tx.classSlot.count({ where: { teacherId } }),
    tx.enrollment.count({ where: { teacherId, status: "ACTIVE" } }),
  ]);
  if (activeClassSlots || activeEnrollments) {
    throw new PublicActionError(
      "Müəllimlik statusunu silməzdən əvvəl slot və tələbə təyinatlarını başqa müəllimə keçirin",
      "CONFLICT",
    );
  }
}

async function persistProfilePhoto(value: FormDataEntryValue | null) {
  if (!isUploadedFile(value)) return null;
  return uploadProfilePhoto(value);
}

async function deleteLocalProfilePhoto(fileUrl: string) {
  await deleteProfilePhoto(fileUrl).catch(() => undefined);
}

function isUploadedFile(value: FormDataEntryValue | null): value is File {
  return typeof File !== "undefined" && value instanceof File && value.size > 0;
}

function currentMonth() { const now = new Date(); return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)); }
function revalidateHr() { revalidatePath("/hr"); revalidatePath("/groups"); revalidatePath("/finance"); revalidatePath("/tasks"); revalidatePath("/", "layout"); }
