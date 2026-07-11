"use server";

import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AppRole, FinanceSalaryMode, HrStaffType, Prisma } from "@/generated/prisma/client";
import { writeAuditLog } from "@/modules/audit/audit-service";
import { requireMutationActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";
import { getSupabaseAdminClient } from "@/server/supabase/admin";

const staffSchema = z.object({
  id: z.string().uuid().optional(),
  staffType: z.enum(["EMPLOYEE", "TEACHER"]).default("EMPLOYEE"),
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
  teacherCapacity: z.coerce.number().int().nonnegative().max(500).default(0),
  createAccount: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  loginEmail: z.union([z.string().trim().email(), z.literal("")]).default(""),
  password: z.string().max(72).default(""),
  roleId: z.union([z.string().uuid(), z.literal("")]).default(""),
}).superRefine((value, context) => {
  if (value.salaryMode === "STATIC" && value.salaryAmount <= 0) context.addIssue({ code: "custom", path: ["salaryAmount"], message: "Statik maaş sıfırdan böyük olmalıdır" });
  if (value.salaryMode === "PERCENT" && value.salaryPercent <= 0) context.addIssue({ code: "custom", path: ["salaryPercent"], message: "Faiz sıfırdan böyük olmalıdır" });
  if (value.staffType === "TEACHER" && value.teacherCapacity <= 0) context.addIssue({ code: "custom", path: ["teacherCapacity"], message: "Müəllim üçün tələbə tutumu tələb olunur" });
  if (value.createAccount && !value.loginEmail) context.addIssue({ code: "custom", path: ["loginEmail"], message: "Giriş e-poçtu tələb olunur" });
  if (value.createAccount && value.password.length < 8) context.addIssue({ code: "custom", path: ["password"], message: "Parol ən az 8 simvol olmalıdır" });
  if (value.createAccount && !value.roleId) context.addIssue({ code: "custom", path: ["roleId"], message: "ERP rolu seçilməlidir" });
});

export async function createStaffAction(formData: FormData) {
  const actor = await requireMutationActor("hr.employee.manage");
  const parsed = staffSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Əməkdaş məlumatları düzgün deyil");
  const input = parsed.data;
  if (input.createAccount && !actor.permissions.has("auth.user.manage")) throw new Error("ERP giriş hesabı yaratmaq üçün istifadəçi idarəetmə icazəsi tələb olunur");

  const role = input.createAccount
    ? await getPrisma().role.findFirst({ where: { id: input.roleId, OR: [{ code: null }, { code: { not: AppRole.SUPER_ADMIN } }] } })
    : null;
  if (input.createAccount && !role) throw new Error("Seçilmiş rol tapılmadı və ya təyin edilə bilməz");

  let authUserId: string | null = null;
  let profilePhotoUrl: string | null = null;
  try {
    profilePhotoUrl = await persistProfilePhoto(formData.get("profilePhoto"));
    if (input.createAccount) {
      const { data, error } = await getSupabaseAdminClient().auth.admin.createUser({ email: input.loginEmail, password: input.password, email_confirm: true, user_metadata: { full_name: input.fullName, avatar_url: profilePhotoUrl } });
      if (error || !data.user) throw new Error(error?.message ?? "Supabase giriş hesabı yaradıla bilmədi");
      authUserId = data.user.id;
    }
    const result = await getPrisma().$transaction(async (tx) => {
      const erpUser = authUserId ? await tx.user.create({ data: { authUserId, fullName: input.fullName, email: input.loginEmail, phone: input.phone || null, isActive: true } }) : null;
      if (erpUser && role) await tx.userRole.create({ data: { userId: erpUser.id, roleId: role.id } });

      let teacherId: string | null = null;
      if (input.staffType === "TEACHER") {
        const teacher = await tx.teacher.create({ data: { userId: erpUser?.id ?? null, fullName: input.fullName, phone: input.phone || null, capacity: input.teacherCapacity } });
        teacherId = teacher.id;
        await tx.teacherContractRule.create({ data: { teacherId, salaryPercent: input.salaryPercent, validFrom: currentMonth(), createdById: actor.id } });
      }

      const employee = await tx.hrEmployee.create({ data: {
        userId: erpUser?.id ?? null,
        teacherId,
        staffType: input.staffType as HrStaffType,
        fullName: input.fullName,
        email: input.email || input.loginEmail || null,
        phone: input.phone || null,
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
      await writeAuditLog(tx, { actorUserId: actor.id, action: "hr.staff.create", entityType: "hr_employee", entityId: employee.id, after: { fullName: employee.fullName, staffType: employee.staffType, email: employee.email, profilePhotoUrl, loginCreated: Boolean(authUserId), role: role?.name ?? null, teacherId } as Prisma.InputJsonValue, reason: input.staffType === "TEACHER" ? "Müəllim əməkdaş profili yaradıldı" : "Əməkdaş profili yaradıldı" });
      return { employeeId: employee.id, teacherId };
    });
    revalidateHr();
    return result;
  } catch (error) {
    if (authUserId) await getSupabaseAdminClient().auth.admin.deleteUser(authUserId);
    if (profilePhotoUrl) await deleteLocalProfilePhoto(profilePhotoUrl);
    throw error;
  }
}

export async function updateStaffAction(formData: FormData) {
  const actor = await requireMutationActor("hr.employee.manage");
  const input = staffSchema.required({ id: true }).parse(Object.fromEntries(formData));
  const before = await getPrisma().hrEmployee.findUnique({ where: { id: input.id } });
  if (!before) throw new Error("Əməkdaş tapılmadı");

  const uploadedProfilePhotoUrl = await persistProfilePhoto(formData.get("profilePhoto"));

  const employeeData = {
    staffType: input.staffType as HrStaffType,
    fullName: input.fullName,
    email: input.email || null,
    phone: input.phone || null,
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
  try {
    await getPrisma().$transaction(async (tx) => {
      await tx.hrEmployee.update({ where: { id: input.id }, data: employeeData });
      if (before.teacherId) await tx.teacher.update({ where: { id: before.teacherId }, data: { fullName: input.fullName, phone: input.phone || null, capacity: input.teacherCapacity || undefined, isActive: input.status !== "INACTIVE" } });
      await writeAuditLog(tx, { actorUserId: actor.id, action: "hr.employee.update", entityType: "hr_employee", entityId: input.id, before, after: employeeData as Prisma.InputJsonValue, reason: "Əməkdaş profili yeniləndi" });
    });
  } catch (error) {
    if (uploadedProfilePhotoUrl) await deleteLocalProfilePhoto(uploadedProfilePhotoUrl);
    throw error;
  }
  if (uploadedProfilePhotoUrl && before.profilePhotoUrl && before.profilePhotoUrl !== uploadedProfilePhotoUrl) {
    await deleteLocalProfilePhoto(before.profilePhotoUrl);
  }
  revalidateHr();
}

const profilePhotoExtensions: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

async function persistProfilePhoto(value: FormDataEntryValue | null) {
  if (!isUploadedFile(value)) return null;
  if (value.size > 5 * 1024 * 1024) throw new Error("Profil şəkli 5 MB-dan böyük ola bilməz");
  const extension = profilePhotoExtensions[value.type];
  if (!extension) throw new Error("Profil şəkli JPEG, PNG və ya WebP formatında olmalıdır");
  const uploadDir = path.join(process.cwd(), "public", "uploads", "hr-profile-photos");
  await mkdir(uploadDir, { recursive: true });
  const fileName = `${Date.now()}-${randomUUID()}${extension}`;
  await writeFile(path.join(uploadDir, fileName), Buffer.from(await value.arrayBuffer()));
  return `/uploads/hr-profile-photos/${fileName}`;
}

async function deleteLocalProfilePhoto(fileUrl: string) {
  if (!fileUrl.startsWith("/uploads/hr-profile-photos/")) return;
  await unlink(path.join(process.cwd(), "public", "uploads", "hr-profile-photos", path.basename(fileUrl))).catch(() => undefined);
}

function isUploadedFile(value: FormDataEntryValue | null): value is File {
  return typeof File !== "undefined" && value instanceof File && value.size > 0;
}

function currentMonth() { const now = new Date(); return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)); }
function revalidateHr() { revalidatePath("/hr"); revalidatePath("/groups"); revalidatePath("/finance"); revalidatePath("/", "layout"); }
