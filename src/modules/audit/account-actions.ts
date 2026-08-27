"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AppRole, Prisma } from "@/generated/prisma/client";
import { isProtectedTeamRole } from "@/lib/protected-roles";
import { writeAuditLog } from "@/modules/audit/audit-service";
import { requireMutationActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";
import { PublicActionError, safeServerAction } from "@/server/actions/safe-action";
import { getSupabaseAdminClient } from "@/server/supabase/admin";
import {
  syncTeacherAccountLink,
  TeacherAccountLinkError,
} from "@/modules/audit/teacher-account-link";

const roleIdsSchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return value; }
}, z.array(z.string().uuid()).max(20));

const accountSchema = z.object({
  employeeId: z.string().uuid(),
  loginEmail: z.string().trim().email(),
  roleIds: roleIdsSchema,
});

const createSchema = accountSchema.extend({ password: passwordSchema() }).refine(
  (value) => value.roleIds.length > 0,
  { path: ["roleIds"], message: "Ən az bir sistem rolu seçilməlidir" },
);
const passwordChangeSchema = z.object({ employeeId: z.string().uuid(), password: passwordSchema() });
const statusSchema = z.object({ employeeId: z.string().uuid(), active: z.enum(["true", "false"]).transform((value) => value === "true") });

async function createAccount(formData: FormData) {
  const actor = await requireSuperAdmin();
  const input = createSchema.parse(Object.fromEntries(formData));
  const [employee, roles, emailOwner] = await Promise.all([
    getPrisma().hrEmployee.findUnique({
      where: { id: input.employeeId },
      include: { user: { include: { roles: { include: { role: true } } } } },
    }),
    loadAssignableRoles(input.roleIds),
    getPrisma().user.findFirst({ where: { email: { equals: input.loginEmail, mode: "insensitive" } }, select: { id: true } }),
  ]);
  if (!employee) throw new PublicActionError("Əməkdaş tapılmadı", "NOT_FOUND");
  if (employee.user?.authUserId) throw new PublicActionError("Bu əməkdaşın giriş hesabı artıq mövcuddur", "DUPLICATE");
  if (emailOwner && emailOwner.id !== employee.userId) throw new PublicActionError("Bu e-poçt başqa giriş hesabında istifadə olunur", "DUPLICATE");

  const { data, error } = await getSupabaseAdminClient().auth.admin.createUser({
    email: input.loginEmail,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: employee.fullName, avatar_url: employee.profilePhotoUrl },
  });
  if (error || !data.user) throw new PublicActionError(error?.message ?? "Giriş hesabı yaradıla bilmədi");

  try {
    const userId = await getPrisma().$transaction(async (tx) => {
      const user = employee.user
        ? await tx.user.update({
            where: { id: employee.user.id },
            data: { authUserId: data.user.id, email: input.loginEmail, fullName: employee.fullName, phone: employee.phone, isActive: true },
          })
        : await tx.user.create({
            data: { authUserId: data.user.id, email: input.loginEmail, fullName: employee.fullName, phone: employee.phone, isActive: true },
          });
      if (!employee.userId) await tx.hrEmployee.update({ where: { id: employee.id }, data: { userId: user.id } });
      const protectedRoles = employee.user?.roles.map(({ role }) => role).filter((role) => isProtectedTeamRole(role.code)) ?? [];
      const effectiveRoles = uniqueRoles([...protectedRoles, ...roles]);
      await tx.userRole.deleteMany({ where: { userId: user.id } });
      await tx.userRole.createMany({ data: effectiveRoles.map((role) => ({ userId: user.id, roleId: role.id })) });
      const teacherLink = await syncTeacherAccountLinkForAction(tx, {
        teacherId: employee.teacherId,
        userId: user.id,
        hasTeacherRole: effectiveRoles.some((role) => role.code === AppRole.TEACHER),
      });
      await writeAuditLog(tx, {
        actorUserId: actor.id,
        action: "auth.account.create",
        entityType: "auth_account",
        entityId: employee.id,
        after: { userId: user.id, employeeId: employee.id, loginEmail: input.loginEmail, roles: effectiveRoles.map((role) => role.name), status: "ACTIVE", teacherLink },
        reason: "Əməkdaş üçün ERP giriş hesabı təhlükəsizlik panelindən yaradıldı",
      });
      return user.id;
    });
    revalidateSecurity(employee.id);
    return { userId };
  } catch (databaseError) {
    await getSupabaseAdminClient().auth.admin.deleteUser(data.user.id).catch(() => undefined);
    throw databaseError;
  }
}

async function updateAccount(formData: FormData) {
  const actor = await requireSuperAdmin();
  const input = accountSchema.parse(Object.fromEntries(formData));
  const [employee, roles] = await Promise.all([
    loadAccount(input.employeeId),
    loadAssignableRoles(input.roleIds),
  ]);
  const user = employee.user!;
  const currentProtectedRoles = user.roles.map(({ role }) => role).filter((role) => isProtectedTeamRole(role.code));
  if (!roles.length && !currentProtectedRoles.length) {
    throw new PublicActionError("Ən az bir sistem rolu seçilməlidir");
  }
  const emailOwner = await getPrisma().user.findFirst({
    where: { email: { equals: input.loginEmail, mode: "insensitive" }, id: { not: user.id } },
    select: { id: true },
  });
  if (emailOwner) throw new PublicActionError("Bu e-poçt başqa giriş hesabında istifadə olunur", "DUPLICATE");
  const previousEmail = user.email;
  const { error } = await getSupabaseAdminClient().auth.admin.updateUserById(user.authUserId!, {
    email: input.loginEmail,
    user_metadata: { full_name: employee.fullName, avatar_url: employee.profilePhotoUrl },
  });
  if (error) throw new PublicActionError(error.message);
  try {
    await getPrisma().$transaction(async (tx) => {
      const effectiveRoles = uniqueRoles([...currentProtectedRoles, ...roles]);
      await tx.user.update({ where: { id: user.id }, data: { email: input.loginEmail } });
      await tx.userRole.deleteMany({ where: { userId: user.id } });
      await tx.userRole.createMany({ data: effectiveRoles.map((role) => ({ userId: user.id, roleId: role.id })) });
      const teacherLink = await syncTeacherAccountLinkForAction(tx, {
        teacherId: employee.teacherId,
        userId: user.id,
        hasTeacherRole: effectiveRoles.some((role) => role.code === AppRole.TEACHER),
      });
      await writeAuditLog(tx, {
        actorUserId: actor.id,
        action: "auth.account.update",
        entityType: "auth_account",
        entityId: employee.id,
        before: { loginEmail: previousEmail, roles: user.roles.map(({ role }) => role.name) },
        after: { loginEmail: input.loginEmail, roles: effectiveRoles.map((role) => role.name), teacherLink },
        reason: "Giriş e-poçtu və hesab rolları təhlükəsizlik panelindən yeniləndi",
      });
    });
  } catch (databaseError) {
    await getSupabaseAdminClient().auth.admin.updateUserById(user.authUserId!, { email: previousEmail }).catch(() => undefined);
    throw databaseError;
  }
  revalidateSecurity(employee.id);
}

async function changePassword(formData: FormData) {
  const actor = await requireSuperAdmin();
  const input = passwordChangeSchema.parse(Object.fromEntries(formData));
  const employee = await loadAccount(input.employeeId);
  const { error } = await getSupabaseAdminClient().auth.admin.updateUserById(employee.user!.authUserId!, { password: input.password });
  if (error) throw new PublicActionError(error.message);
  await getPrisma().$transaction(async (tx) => {
    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "auth.password.reset",
      entityType: "auth_account",
      entityId: employee.id,
      after: { userId: employee.user!.id, passwordChanged: true },
      reason: "Əməkdaşın parolu təhlükəsizlik panelindən yeniləndi",
    });
  });
  await revokeTargetSessions(employee.user!.id, actor.id, actor.currentSessionId, "Parol dəyişikliyindən sonra sessiya bağlandı");
  revalidateSecurity(employee.id);
}

async function setAccountStatus(formData: FormData) {
  const actor = await requireSuperAdmin();
  const input = statusSchema.parse(Object.fromEntries(formData));
  const employee = await loadAccount(input.employeeId);
  const user = employee.user!;
  if (!input.active && user.id === actor.id) throw new PublicActionError("Aktiv Super Admin öz hesabını deaktiv edə bilməz", "FORBIDDEN");
  const { error } = await getSupabaseAdminClient().auth.admin.updateUserById(user.authUserId!, {
    ban_duration: input.active ? "none" : "876000h",
  });
  if (error) throw new PublicActionError(error.message);
  await getPrisma().$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { isActive: input.active } });
    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: input.active ? "auth.account.enable" : "auth.account.disable",
      entityType: "auth_account",
      entityId: employee.id,
      before: { status: user.isActive ? "ACTIVE" : "DISABLED" },
      after: { status: input.active ? "ACTIVE" : "DISABLED" },
      reason: input.active ? "ERP giriş hesabı aktiv edildi" : "ERP giriş hesabı deaktiv edildi",
    });
  });
  if (!input.active) await revokeTargetSessions(user.id, actor.id, actor.currentSessionId, "Hesab deaktiv edildiyi üçün sessiya bağlandı");
  revalidateSecurity(employee.id);
}

export const createSecurityAccountAction = safeServerAction(createAccount, "Giriş hesabı yaradıla bilmədi.");
export const updateSecurityAccountAction = safeServerAction(updateAccount, "Giriş məlumatları yenilənə bilmədi.");
export const changeSecurityPasswordAction = safeServerAction(changePassword, "Parol yenilənə bilmədi.");
export const setSecurityAccountStatusAction = safeServerAction(setAccountStatus, "Hesab statusu yenilənə bilmədi.");

async function requireSuperAdmin() {
  const actor = await requireMutationActor("auth.user.manage");
  if (!actor.roles.includes(AppRole.SUPER_ADMIN)) throw new PublicActionError("Bu bölmə yalnız Super Admin üçündür", "FORBIDDEN");
  return actor;
}

async function loadAssignableRoles(roleIds: string[]) {
  const roles = await getPrisma().role.findMany({ where: { id: { in: roleIds } } });
  if (roles.length !== roleIds.length || roles.some((role) => isProtectedTeamRole(role.code))) {
    throw new PublicActionError("Seçilmiş rollardan biri tapılmadı və ya bu paneldən təyin edilə bilməz", "NOT_FOUND");
  }
  return roles;
}

async function loadAccount(employeeId: string) {
  const employee = await getPrisma().hrEmployee.findUnique({
    where: { id: employeeId },
    include: { user: { include: { roles: { include: { role: true } } } } },
  });
  if (!employee) throw new PublicActionError("Əməkdaş tapılmadı", "NOT_FOUND");
  if (!employee.user?.authUserId) throw new PublicActionError("Əməkdaşın giriş hesabı yaradılmayıb", "NOT_FOUND");
  return employee;
}

function passwordSchema() {
  return z.string().min(10, "Parol ən az 10 simvol olmalıdır").max(72)
    .regex(/[a-z]/, "Parolda kiçik hərf olmalıdır")
    .regex(/[A-Z]/, "Parolda böyük hərf olmalıdır")
    .regex(/\d/, "Parolda rəqəm olmalıdır")
    .regex(/[^A-Za-z0-9]/, "Parolda xüsusi simvol olmalıdır");
}

function uniqueRoles<T extends { id: string }>(roles: T[]) {
  return [...new Map(roles.map((role) => [role.id, role])).values()];
}

async function syncTeacherAccountLinkForAction(
  db: Parameters<typeof syncTeacherAccountLink>[0],
  input: Parameters<typeof syncTeacherAccountLink>[1],
) {
  try {
    return await syncTeacherAccountLink(db, input);
  } catch (error) {
    if (error instanceof TeacherAccountLinkError) {
      throw new PublicActionError(error.message, error.code);
    }
    throw error;
  }
}

async function revokeTargetSessions(userId: string, actorId: string, currentSessionId: string | null, reason: string) {
  const preserve = userId === actorId ? currentSessionId : null;
  const sessions = await getPrisma().$queryRaw<Array<{ id: string }>>(Prisma.sql`
    select session.id::text as id
    from auth.sessions session
    join erp.users app_user on app_user.auth_user_id = session.user_id
    where app_user.id = ${userId}::uuid
      and (${preserve}::uuid is null or session.id <> ${preserve}::uuid)
  `);
  if (!sessions.length) return;
  const ids = sessions.map((session) => session.id);
  const revokedAt = new Date();
  await getPrisma().$transaction(async (tx) => {
    await tx.authSessionRecord.updateMany({
      where: { id: { in: ids } },
      data: { revokedAt, revokedById: actorId, revokeReason: reason },
    });
    await tx.$executeRaw(Prisma.sql`delete from auth.sessions where id in (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})`);
  });
}

function revalidateSecurity(employeeId: string) {
  revalidatePath("/audit");
  revalidatePath("/dashboard");
  revalidatePath("/groups");
  revalidatePath("/hr");
  revalidatePath(`/hr/${employeeId}`);
  revalidatePath("/playbook");
}
