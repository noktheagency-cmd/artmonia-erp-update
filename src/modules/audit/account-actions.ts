"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AppRole, Prisma } from "@/generated/prisma/client";
import { isProtectedTeamRole } from "@/lib/protected-roles";
import { writeAuditLog } from "@/modules/audit/audit-service";
import { requireMutationActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";
import { PublicActionError, safeServerAction } from "@/server/actions/safe-action";
import { assertSafePassword } from "@/server/auth/password-security";
import { getSupabaseAdminClient } from "@/server/supabase/admin";
import { assertNoPendingAccountLifecycle } from "@/modules/roles/account-lifecycle-service";
import {
  syncTeacherAccountLink,
  TeacherAccountLinkError,
} from "@/modules/audit/teacher-account-link";

type AccountProfileType = "EMPLOYEE" | "CORPORATE_CONTACT";
type AccountUser = Prisma.UserGetPayload<{ include: { roles: { include: { role: true } } } }>;
type AccountProfile = {
  id: string;
  profileType: AccountProfileType;
  userId: string | null;
  teacherId: string | null;
  companyId: string | null;
  companyName: string | null;
  fullName: string;
  phone: string | null;
  profilePhotoUrl: string | null;
  user: AccountUser | null;
};

const roleIdsSchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return value; }
}, z.array(z.string().uuid()).max(20));

const profileSchema = z.object({
  profileType: z.enum(["EMPLOYEE", "CORPORATE_CONTACT"]),
  profileId: z.string().uuid(),
});

const accountSchema = profileSchema.extend({
  loginEmail: z.string().trim().email(),
  roleIds: roleIdsSchema,
});

const createSchema = accountSchema.extend({ password: passwordSchema() }).refine(
  (value) => value.roleIds.length > 0,
  { path: ["roleIds"], message: "Ən az bir sistem rolu seçilməlidir" },
);
const passwordChangeSchema = profileSchema.extend({ password: passwordSchema() });
const statusSchema = profileSchema.extend({ active: z.enum(["true", "false"]).transform((value) => value === "true") });

async function createAccount(formData: FormData) {
  const actor = await requireSuperAdmin();
  const input = createSchema.parse(Object.fromEntries(formData));
  const [profile, roles, emailOwner] = await Promise.all([
    loadProfile(input.profileType, input.profileId),
    loadAssignableRoles(input.roleIds),
    getPrisma().user.findFirst({ where: { email: { equals: input.loginEmail, mode: "insensitive" } }, select: { id: true } }),
  ]);
  if (profile.user?.authUserId) throw new PublicActionError("Bu profilin giriş hesabı artıq mövcuddur", "DUPLICATE");
  if (emailOwner && emailOwner.id !== profile.userId) throw new PublicActionError("Bu e-poçt başqa giriş hesabında istifadə olunur", "DUPLICATE");

  await assertSafePassword(input.password);
  const { data, error } = await getSupabaseAdminClient().auth.admin.createUser({
    email: input.loginEmail,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: profile.fullName, avatar_url: profile.profilePhotoUrl },
  });
  if (error || !data.user) throw new PublicActionError(error?.message ?? "Giriş hesabı yaradıla bilmədi");

  try {
    const userId = await getPrisma().$transaction(async (tx) => {
      const user = profile.user
        ? await tx.user.update({
            where: { id: profile.user.id },
            data: { authUserId: data.user.id, email: input.loginEmail, fullName: profile.fullName, phone: profile.phone, isActive: true },
          })
        : await tx.user.create({
            data: { authUserId: data.user.id, email: input.loginEmail, fullName: profile.fullName, phone: profile.phone, isActive: true },
          });
      if (!profile.userId) await linkProfileToUser(tx, profile.profileType, profile.id, user.id);
      const protectedRoles = profile.user?.roles.map(({ role }) => role).filter((role) => isProtectedTeamRole(role.code)) ?? [];
      const effectiveRoles = uniqueRoles([...protectedRoles, ...roles]);
      await tx.userRole.deleteMany({ where: { userId: user.id } });
      await tx.userRole.createMany({ data: effectiveRoles.map((role) => ({ userId: user.id, roleId: role.id })) });
      const teacherLink = await syncTeacherAccountLinkForAction(tx, {
        teacherId: profile.teacherId,
        userId: user.id,
        hasTeacherRole: effectiveRoles.some((role) => role.code === AppRole.TEACHER),
      });
      await writeAuditLog(tx, {
        actorUserId: actor.id,
        action: "auth.account.create",
        entityType: "auth_account",
        entityId: profile.id,
        after: profileAuditDetails(profile, { userId: user.id, loginEmail: input.loginEmail, roles: effectiveRoles.map((role) => role.name), status: "ACTIVE", teacherLink }),
        reason: `${profileLabel(profile.profileType)} üçün ERP giriş hesabı təhlükəsizlik panelindən yaradıldı`,
      });
      return user.id;
    });
    revalidateSecurity(profile);
    return { userId };
  } catch (databaseError) {
    await getSupabaseAdminClient().auth.admin.deleteUser(data.user.id).catch(() => undefined);
    throw databaseError;
  }
}

async function updateAccount(formData: FormData) {
  const actor = await requireSuperAdmin();
  const input = accountSchema.parse(Object.fromEntries(formData));
  const [profile, roles] = await Promise.all([
    loadAccount(input.profileType, input.profileId),
    loadAssignableRoles(input.roleIds),
  ]);
  const user = profile.user!;
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
    user_metadata: { full_name: profile.fullName, avatar_url: profile.profilePhotoUrl },
  });
  if (error) throw new PublicActionError(error.message);
  try {
    await getPrisma().$transaction(async (tx) => {
      const effectiveRoles = uniqueRoles([...currentProtectedRoles, ...roles]);
      await tx.$queryRaw`select id from erp.users where id = ${user.id}::uuid for update`;
      await assertNoPendingAccountLifecycle(tx, user.id);
      await tx.user.update({ where: { id: user.id }, data: { email: input.loginEmail } });
      await tx.userRole.deleteMany({ where: { userId: user.id } });
      await tx.userRole.createMany({ data: effectiveRoles.map((role) => ({ userId: user.id, roleId: role.id })) });
      const teacherLink = await syncTeacherAccountLinkForAction(tx, {
        teacherId: profile.teacherId,
        userId: user.id,
        hasTeacherRole: effectiveRoles.some((role) => role.code === AppRole.TEACHER),
      });
      await writeAuditLog(tx, {
        actorUserId: actor.id,
        action: "auth.account.update",
        entityType: "auth_account",
        entityId: profile.id,
        before: { loginEmail: previousEmail, roles: user.roles.map(({ role }) => role.name) },
        after: profileAuditDetails(profile, { loginEmail: input.loginEmail, roles: effectiveRoles.map((role) => role.name), teacherLink }),
        reason: "Giriş e-poçtu və hesab rolları təhlükəsizlik panelindən yeniləndi",
      });
    });
  } catch (databaseError) {
    await getSupabaseAdminClient().auth.admin.updateUserById(user.authUserId!, { email: previousEmail }).catch(() => undefined);
    throw databaseError;
  }
  revalidateSecurity(profile);
}

async function changePassword(formData: FormData) {
  const actor = await requireSuperAdmin();
  const input = passwordChangeSchema.parse(Object.fromEntries(formData));
  const profile = await loadAccount(input.profileType, input.profileId);
  await assertSafePassword(input.password);
  const { error } = await getSupabaseAdminClient().auth.admin.updateUserById(profile.user!.authUserId!, { password: input.password });
  if (error) throw new PublicActionError(error.message);
  await getPrisma().$transaction(async (tx) => {
    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "auth.password.reset",
      entityType: "auth_account",
      entityId: profile.id,
      after: profileAuditDetails(profile, { userId: profile.user!.id, passwordChanged: true }),
      reason: `${profileLabel(profile.profileType)} parolu təhlükəsizlik panelindən yeniləndi`,
    });
  });
  await revokeTargetSessions(profile.user!.id, actor.id, actor.currentSessionId, "Parol dəyişikliyindən sonra sessiya bağlandı");
  revalidateSecurity(profile);
}

async function setAccountStatus(formData: FormData) {
  const actor = await requireSuperAdmin();
  const input = statusSchema.parse(Object.fromEntries(formData));
  const profile = await loadAccount(input.profileType, input.profileId);
  const user = profile.user!;
  if (!input.active && user.id === actor.id) throw new PublicActionError("Aktiv Super Admin öz hesabını deaktiv edə bilməz", "FORBIDDEN");
  const { error } = await getSupabaseAdminClient().auth.admin.updateUserById(user.authUserId!, {
    ban_duration: input.active ? "none" : "876000h",
  });
  if (error) throw new PublicActionError(error.message);
  await getPrisma().$transaction(async (tx) => {
    await tx.$queryRaw`select id from erp.users where id = ${user.id}::uuid for update`;
    await assertNoPendingAccountLifecycle(tx, user.id);
    await tx.user.update({ where: { id: user.id }, data: { isActive: input.active } });
    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: input.active ? "auth.account.enable" : "auth.account.disable",
      entityType: "auth_account",
      entityId: profile.id,
      before: { status: user.isActive ? "ACTIVE" : "DISABLED" },
      after: profileAuditDetails(profile, { status: input.active ? "ACTIVE" : "DISABLED" }),
      reason: input.active ? "ERP giriş hesabı aktiv edildi" : "ERP giriş hesabı deaktiv edildi",
    });
  });
  if (!input.active) await revokeTargetSessions(user.id, actor.id, actor.currentSessionId, "Hesab deaktiv edildiyi üçün sessiya bağlandı");
  revalidateSecurity(profile);
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

async function loadProfile(profileType: AccountProfileType, profileId: string): Promise<AccountProfile> {
  if (profileType === "EMPLOYEE") {
    const employee = await getPrisma().hrEmployee.findUnique({
      where: { id: profileId },
      include: { user: { include: { roles: { include: { role: true } } } } },
    });
    if (!employee) throw new PublicActionError("Əməkdaş tapılmadı", "NOT_FOUND");
    return {
      id: employee.id,
      profileType,
      userId: employee.userId,
      teacherId: employee.teacherId,
      companyId: null,
      companyName: null,
      fullName: employee.fullName,
      phone: employee.phone,
      profilePhotoUrl: employee.profilePhotoUrl,
      user: employee.user,
    };
  }

  const contact = await getPrisma().hrCorporateContact.findUnique({
    where: { id: profileId },
    include: {
      customer: { select: { id: true, name: true } },
      user: { include: { roles: { include: { role: true } } } },
    },
  });
  if (!contact) throw new PublicActionError("Əlaqəli şəxs tapılmadı", "NOT_FOUND");
  return {
    id: contact.id,
    profileType,
    userId: contact.userId,
    teacherId: null,
    companyId: contact.customer.id,
    companyName: contact.customer.name,
    fullName: contact.fullName,
    phone: contact.phone,
    profilePhotoUrl: null,
    user: contact.user,
  };
}

async function loadAccount(profileType: AccountProfileType, profileId: string) {
  const profile = await loadProfile(profileType, profileId);
  if (!profile.user?.authUserId) throw new PublicActionError("Profilin giriş hesabı yaradılmayıb", "NOT_FOUND");
  return profile;
}

async function linkProfileToUser(
  tx: Prisma.TransactionClient,
  profileType: AccountProfileType,
  profileId: string,
  userId: string,
) {
  if (profileType === "EMPLOYEE") {
    await tx.hrEmployee.update({ where: { id: profileId }, data: { userId } });
    return;
  }
  await tx.hrCorporateContact.update({ where: { id: profileId }, data: { userId } });
}

function profileAuditDetails(profile: AccountProfile, details: Record<string, unknown>) {
  return {
    profileType: profile.profileType,
    employeeId: profile.profileType === "EMPLOYEE" ? profile.id : null,
    corporateContactId: profile.profileType === "CORPORATE_CONTACT" ? profile.id : null,
    companyId: profile.companyId,
    companyName: profile.companyName,
    ...details,
  };
}

function profileLabel(profileType: AccountProfileType) {
  return profileType === "EMPLOYEE" ? "Əməkdaş" : "Korporativ əlaqəli şəxs";
}

function passwordSchema() {
  return z.string().min(16, "Parol ən az 16 simvol olmalıdır").max(72)
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

function revalidateSecurity(profile: AccountProfile) {
  revalidatePath("/audit");
  revalidatePath("/dashboard");
  revalidatePath("/groups");
  revalidatePath("/hr");
  if (profile.profileType === "EMPLOYEE") revalidatePath(`/hr/${profile.id}`);
  revalidatePath("/playbook");
}
