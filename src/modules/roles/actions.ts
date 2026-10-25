"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AppRole, Prisma } from "@/generated/prisma/client";
import { isProtectedTeamRole } from "@/lib/protected-roles";
import { writeAuditLog } from "@/modules/audit/audit-service";
import { persistStandaloneUser } from "@/modules/roles/standalone-user-service";
import { assertNoPendingAccountLifecycle } from "./account-lifecycle-service";
import type { CreateRoleResult, DeleteRoleResult, RoleSummaryDto, RoleUserDto, UpdateRolePermissionsResult } from "@/modules/roles/types";
import { PublicActionError, safeServerAction } from "@/server/actions/safe-action";
import { requireMutationActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";
import { isPermissionCode, isSuperAdminManagedPermission, isSuperAdminOnlyPermission, permissionDefinitions, type PermissionCode, type PermissionScope } from "@/server/rbac/permissions";
import { assertSafePassword } from "@/server/auth/password-security";
import { getSupabaseAdminClient } from "@/server/supabase/admin";

type SubmittedGrant = { code?: unknown; scope?: unknown };

const standaloneUserSchema = z.object({
  fullName: z.string().trim().min(2, "Ad ən az 2 simvol olmalıdır").max(120, "Ad maksimum 120 simvol ola bilər"),
  email: z.string().trim().toLowerCase().email("Düzgün e-poçt ünvanı daxil edin"),
  password: z.string().min(16, "Parol ən az 16 simvol olmalıdır").max(72, "Parol maksimum 72 simvol ola bilər"),
  roleId: z.string().uuid("Etibarlı rol seçin"),
});

async function createStandaloneUserActionImpl(formData: FormData) {
  const actor = await requireMutationActor("auth.user.manage");
  const input = standaloneUserSchema.parse(Object.fromEntries(formData));
  const prisma = getPrisma();
  const [role, existingUser] = await Promise.all([
    prisma.role.findUnique({
      where: { id: input.roleId },
      select: { id: true, name: true, code: true },
    }),
    prisma.user.findUnique({ where: { email: input.email }, select: { id: true } }),
  ]);

  if (!role || isProtectedTeamRole(role.code)) {
    throw new PublicActionError("Seçilmiş rol tapılmadı və ya bu ekrandan təyin edilə bilməz", "NOT_FOUND");
  }
  if (existingUser) {
    throw new PublicActionError("Bu e-poçt ünvanı ilə giriş hesabı artıq mövcuddur", "DUPLICATE");
  }

  await assertSafePassword(input.password);
  const { data, error } = await getSupabaseAdminClient().auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.fullName },
  });
  if (error || !data.user) {
    throw new PublicActionError(
      error?.message ?? "Giriş hesabı yaradıla bilmədi",
      error?.message && /already|exists|registered/i.test(error.message) ? "DUPLICATE" : "VALIDATION",
    );
  }

  try {
    const user = await prisma.$transaction(async (tx) => {
      const created = await persistStandaloneUser(tx, {
        authUserId: data.user.id,
        email: input.email,
        fullName: input.fullName,
        role: { id: role.id, name: role.name },
        actorUserId: actor.id,
      });
      const version = await tx.user.findUniqueOrThrow({ where: { id: created.id }, select: { updatedAt: true } });
      return { ...created, updatedAt: version.updatedAt };
    });

    revalidatePath("/settings/roles");
    revalidatePath("/", "layout");
    const createdUser: RoleUserDto = {
      updatedAt: user.updatedAt.toISOString(),
      isCurrent: false,
      id: user.id,
      employeeId: null,
      kind: "PROFILE",
      fullName: user.fullName,
      email: user.email,
      department: "HR xaricində",
      position: "Giriş profili",
      isActive: true,
      hasLogin: true,
      isProtected: false,
      roleIds: [role.id],
    };
    return { user: createdUser, roleId: role.id, roleName: role.name };
  } catch (dbError) {
    await getSupabaseAdminClient().auth.admin.deleteUser(data.user.id).catch(() => undefined);
    throw dbError;
  }
}

export const createStandaloneUserAction = safeServerAction(
  createStandaloneUserActionImpl,
  "Giriş profili yaradıla bilmədi.",
);

export async function updateRolePermissionsAction(formData: FormData): Promise<UpdateRolePermissionsResult> {
  try {
    const actor = await requireMutationActor("auth.role.manage");
    const canManageSuperAdminPermissions = actor.roles.includes(AppRole.SUPER_ADMIN);
    const roleId = String(formData.get("roleId") ?? "");
    const expectedUpdatedAt = String(formData.get("updatedAt") ?? "");
    const reason = String(formData.get("reason") ?? "").trim();
    if (!isUuid(roleId) || !expectedUpdatedAt || reason.length < 5) return failure("VALIDATION", "Rol, versiya və ən az 5 simvolluq dəyişiklik səbəbi tələb olunur.");

    let submitted: SubmittedGrant[];
    try {
      const parsed = JSON.parse(String(formData.get("grants") ?? "[]"));
      if (!Array.isArray(parsed)) throw new Error();
      submitted = parsed;
    } catch { return failure("VALIDATION", "İcazə siyahısı etibarlı deyil."); }

    const normalized = normalizeGrants(submitted, canManageSuperAdminPermissions);

    const result = await getPrisma().$transaction(async (tx) => {
      const role = await tx.role.findUnique({ where: { id: roleId }, include: { permissions: { include: { permission: true } } } });
      if (!role) return { kind: "NOT_FOUND" as const };
      if (role.code === AppRole.SUPER_ADMIN) return { kind: "FORBIDDEN" as const };
      if (role.updatedAt.toISOString() !== expectedUpdatedAt) return { kind: "CONFLICT" as const };
      if (!canManageSuperAdminPermissions) {
        for (const { permission, scope } of role.permissions) {
          if (isPermissionCode(permission.code) && isSuperAdminManagedPermission(permission.code) && !isSuperAdminOnlyPermission(permission.code)) {
            normalized.set(permission.code, scope as PermissionScope);
          }
        }
        ensurePermissionDependencies(normalized);
      }
      const permissionRows = await resolvePermissionRows(tx, normalized);
      const nextUpdatedAt = new Date();
      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
      if (permissionRows.length) await tx.rolePermission.createMany({ data: permissionRows.map((permission) => ({ roleId: role.id, permissionId: permission.id, scope: normalized.get(permission.code as PermissionCode) ?? "ALL" })) });
      await tx.role.update({ where: { id: role.id }, data: { updatedAt: nextUpdatedAt } });
      await writeAuditLog(tx, { actorUserId: actor.id, action: "role.permissions.update", entityType: "role", entityId: role.id, before: role.permissions.map(({ permission, scope }) => ({ code: permission.code, scope })) as Prisma.InputJsonValue, after: [...normalized].map(([code, scope]) => ({ code, scope })) as Prisma.InputJsonValue, reason });
      return { kind: "OK" as const, updatedAt: nextUpdatedAt.toISOString() };
    });
    if (result.kind === "NOT_FOUND") return failure("NOT_FOUND", "Rol tapılmadı.");
    if (result.kind === "FORBIDDEN") return failure("FORBIDDEN", "Super Admin sistem rolu dəyişdirilə bilməz.");
    if (result.kind === "CONFLICT") return failure("CONFLICT", "Bu rol başqa istifadəçi tərəfindən dəyişdirilib. Səhifəni yeniləyin.");
    revalidatePath("/settings/roles"); revalidatePath("/", "layout");
    return { ok: true, updatedAt: result.updatedAt, grantCount: normalized.size };
  } catch (error) {
    return failure(error instanceof Error && error.message.startsWith("Missing permission") ? "FORBIDDEN" : "UNKNOWN", "İcazələr saxlanılarkən xəta baş verdi.");
  }
}

export async function createRoleAction(formData: FormData): Promise<CreateRoleResult> {
  try {
    const actor = await requireMutationActor("auth.role.manage");
    const canManageSuperAdminPermissions = actor.roles.includes(AppRole.SUPER_ADMIN);
    const name = String(formData.get("name") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const copyFromRoleId = String(formData.get("copyFromRoleId") ?? "").trim();
    let submitted: SubmittedGrant[] | null = null;
    try {
      const raw = formData.get("grants");
      if (raw != null) {
        const parsed = JSON.parse(String(raw));
        if (!Array.isArray(parsed)) throw new Error();
        submitted = parsed;
      }
    } catch { return failure("VALIDATION", "İcazə siyahısı etibarlı deyil."); }
    if (name.length < 2 || name.length > 60 || description.length > 240 || (copyFromRoleId && !isUuid(copyFromRoleId))) return failure("VALIDATION", "Rol adı 2–60, açıqlama isə maksimum 240 simvol olmalıdır.");

    const createdId = await getPrisma().$transaction(async (tx) => {
      const source = copyFromRoleId ? await tx.role.findUnique({ where: { id: copyFromRoleId }, include: { permissions: { include: { permission: { select: { code: true } } } } } }) : null;
      if (copyFromRoleId && !source) return null;
      const role = await tx.role.create({ data: { key: `custom.${slugify(name)}.${crypto.randomUUID().slice(0, 8)}`, name, description: description || null, isSystem: false } });
      if (submitted) {
        const normalized = normalizeGrants(submitted, canManageSuperAdminPermissions);
        const permissions = await resolvePermissionRows(tx, normalized);
        if (permissions.length) await tx.rolePermission.createMany({ data: permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id, scope: normalized.get(permission.code as PermissionCode) ?? "ALL" })) });
      } else if (source?.permissions.length) {
        const copiedPermissions = source.permissions.filter(
          ({ permission }) =>
            !isPermissionCode(permission.code)
            || (!isSuperAdminOnlyPermission(permission.code)
              && (canManageSuperAdminPermissions || !isSuperAdminManagedPermission(permission.code))),
        );
        if (copiedPermissions.length) {
          await tx.rolePermission.createMany({ data: copiedPermissions.map((grant) => ({ roleId: role.id, permissionId: grant.permissionId, scope: grant.scope })) });
        }
      }
      await writeAuditLog(tx, { actorUserId: actor.id, action: "role.create", entityType: "role", entityId: role.id, after: { name, description: description || null, copiedFrom: source?.name ?? null } as Prisma.InputJsonValue, reason: "Yeni fərdi rol yaradıldı" });
      return role.id;
    });
    if (!createdId) return failure("NOT_FOUND", "Kopyalanacaq rol tapılmadı.");
    const created = await getPrisma().role.findUniqueOrThrow({ where: { id: createdId }, include: { permissions: { include: { permission: true } } } });
    const role: RoleSummaryDto = { id: created.id, code: created.code, key: created.key, name: created.name, description: created.description, isSystem: created.isSystem, userCount: 0, updatedAt: created.updatedAt.toISOString(), grants: created.permissions.flatMap(({ permission, scope }) => isPermissionCode(permission.code) ? [{ code: permission.code, scope: scope as PermissionScope }] : []) };
    revalidatePath("/settings/roles");
    return { ok: true, role };
  } catch { return failure("UNKNOWN", "Rol yaradılarkən xəta baş verdi."); }
}

export async function deleteRoleAction(formData: FormData): Promise<DeleteRoleResult> {
  try {
    const actor = await requireMutationActor("auth.role.manage");
    const roleId = String(formData.get("roleId") ?? "");
    if (!isUuid(roleId)) return failure("VALIDATION", "Rol etibarlı deyil.");
    const role = await getPrisma().role.findUnique({
      where: { id: roleId },
      select: {
        id: true,
        name: true,
        key: true,
        description: true,
        code: true,
        isSystem: true,
        users: {
          select: {
            user: {
              select: {
                id: true,
                authUserId: true,
                roles: { select: { role: { select: { code: true } } } },
                hrEmployeeProfile: { select: { id: true, teacherId: true } },
              },
            },
          },
        },
      },
    });
    if (!role) return failure("NOT_FOUND", "Rol tapılmadı.");
    if (role.isSystem || role.code) return failure("FORBIDDEN", "Sistem rolları silinə bilməz.");

    const assignedUsers = role.users.map(({ user }) => user);
    const members = assignedUsers
      .filter((user) => !user.roles.some(({ role: assignedRole }) => isProtectedTeamRole(assignedRole.code)));
    const protectedUserCount = assignedUsers.length - members.length;
    if (members.some((user) => user.id === actor.id)) {
      return failure("FORBIDDEN", "Hazırda daxil olduğunuz hesabın rolunu bu ekrandan silə bilməzsiniz.");
    }
    if (members.length > 0 && !actor.permissions.has("auth.user.manage")) {
      return failure("FORBIDDEN", "Rola bağlı profilləri silmək üçün istifadəçi idarəetmə icazəsi tələb olunur.");
    }

    const userIds = members.map((user) => user.id);
    const employeeIds = members.flatMap((user) => user.hrEmployeeProfile ? [user.hrEmployeeProfile.id] : []);
    const teacherIds = members.flatMap((user) => user.hrEmployeeProfile?.teacherId ? [user.hrEmployeeProfile.teacherId] : []);
    const authUserIds = members.flatMap((user) => user.authUserId ? [user.authUserId] : []);

    await getPrisma().$transaction(async (tx) => {
      await writeAuditLog(tx, {
        actorUserId: actor.id,
        action: "role.delete.cascade",
        entityType: "role",
        entityId: role.id,
        before: {
          name: role.name,
          key: role.key,
          description: role.description,
          attachedUserCount: userIds.length,
          attachedEmployeeCount: employeeIds.length,
          protectedSuperAdminCount: protectedUserCount,
        } as Prisma.InputJsonValue,
        after: {
          roleDeleted: true,
          attachedProfilesRemoved: userIds.length,
          attachedEmployeesRemoved: employeeIds.length,
          protectedSuperAdminsRemoved: 0,
        } as Prisma.InputJsonValue,
        reason: "Fərdi rol və ona bağlı profillər silindi",
      });

      if (userIds.length > 0) {
        await tx.hrEmployee.updateMany({
          where: { userId: { in: userIds }, archivedAt: null },
          data: {
            status: "INACTIVE",
            employmentEndedAt: new Date(),
            exitReason: `“${role.name}” rolu silindiyi üçün profil arxivləşdirildi`,
            archivedAt: new Date(),
            archivedById: actor.id,
          },
        });
        if (teacherIds.length > 0) {
          await tx.teacher.updateMany({
            where: { id: { in: teacherIds } },
            data: { userId: null, isActive: false },
          });
        }
        await tx.userRole.deleteMany({ where: { userId: { in: userIds } } });
        const userIdSql = userIds.map((userId) => Prisma.sql`${userId}::uuid`);
        await tx.$executeRaw(Prisma.sql`
          update "erp"."users"
          set
            "auth_user_id" = null,
            "full_name" = 'Silinmiş profil',
            "email" = 'deleted+' || "id"::text || '@artmonia.invalid',
            "phone" = null,
            "is_active" = false,
            "updated_at" = now()
          where "id" in (${Prisma.join(userIdSql)})
        `);
      }
      await tx.role.delete({ where: { id: role.id } });
    });

    const [remainingRoleCounts, authCleanupResults] = await Promise.all([
      getPrisma().role.findMany({
        select: { id: true, _count: { select: { users: true } } },
      }),
      Promise.allSettled(
        authUserIds.map(async (authUserId) => {
          const { error } = await getSupabaseAdminClient().auth.admin.deleteUser(authUserId);
          if (error) throw error;
        }),
      ),
    ]);
    const authCleanupFailed = authCleanupResults.filter((result) => result.status === "rejected").length;
    if (authCleanupFailed > 0) {
      console.error("Supabase Auth cleanup incomplete after role deletion", {
        roleId,
        failedCount: authCleanupFailed,
      });
    }

    revalidatePath("/settings/roles");
    revalidatePath("/hr");
    revalidatePath("/", "layout");
    return {
      ok: true,
      roleId,
      deletedUserIds: userIds,
      deletedUserCount: userIds.length,
      deletedEmployeeCount: employeeIds.length,
      authCleanupFailed,
      roleUserCounts: Object.fromEntries(
        remainingRoleCounts.map((remainingRole) => [remainingRole.id, remainingRole._count.users]),
      ),
    };
  } catch { return failure("UNKNOWN", "Rol silinərkən xəta baş verdi."); }
}

export async function updateRoleUserAction(formData: FormData) {
  try {
    const actor = await requireMutationActor();
    const parsedInput = z.object({
      userId: z.string().uuid(),
      email: z.string().trim().toLowerCase().email(),
      password: z.string().max(72),
    }).safeParse({
      userId: formData.get("userId"),
      email: formData.get("email"),
      password: String(formData.get("password") ?? ""),
    });
    if (!parsedInput.success) {
      return failure("VALIDATION", "Login e-poçtu və profil məlumatları etibarlı deyil.");
    }

    let roleIds: string[];
    try {
      const parsed = JSON.parse(String(formData.get("roleIds") ?? "[]"));
      if (!Array.isArray(parsed)) throw new Error();
      roleIds = [...new Set(parsed.map(String))];
    } catch {
      return failure("VALIDATION", "Rol siyahısı etibarlı deyil.");
    }
    if (roleIds.length < 1 || roleIds.length > 20 || roleIds.some((id) => !isUuid(id))) {
      return failure("VALIDATION", "Profil üçün ən az bir etibarlı rol seçilməlidir.");
    }
    if (parsedInput.data.password.length > 0 && parsedInput.data.password.length < 16) {
      return failure("VALIDATION", "Yeni parol ən az 16 simvol olmalıdır.");
    }

    const prisma = getPrisma();
    const user = await prisma.user.findUnique({
      where: { id: parsedInput.data.userId },
      select: {
        id: true,
        authUserId: true,
        fullName: true,
        email: true,
        isActive: true,
        roles: { select: { role: { select: { id: true, name: true, code: true } } } },
        hrEmployeeProfile: {
          select: {
            id: true,
            department: true,
            position: true,
            status: true,
          },
        },
      },
    });
    if (!user) return failure("NOT_FOUND", "Profil tapılmadı.");
    if (user.roles.some(({ role }) => isProtectedTeamRole(role.code))) {
      return failure("FORBIDDEN", "Rəhbər profili bu ekrandan dəyişdirilə bilməz.");
    }

    const [nextRoles, emailOwner] = await Promise.all([
      prisma.role.findMany({
        where: { id: { in: roleIds } },
        select: { id: true, name: true, code: true },
      }),
      prisma.user.findFirst({
        where: {
          email: parsedInput.data.email,
          id: { not: user.id },
        },
        select: { id: true },
      }),
    ]);
    if (nextRoles.length !== roleIds.length || nextRoles.some((role) => isProtectedTeamRole(role.code))) {
      return failure("VALIDATION", "Seçilmiş rollardan biri etibarlı deyil.");
    }
    if (emailOwner) {
      return failure("VALIDATION", "Bu e-poçt ünvanı ilə ERP profili artıq mövcuddur.");
    }

    const currentRoleIds = user.roles.map(({ role }) => role.id).sort();
    const nextRoleIds = [...roleIds].sort();
    const rolesChanged = currentRoleIds.join(",") !== nextRoleIds.join(",");
    const emailChanged = user.email.toLocaleLowerCase() !== parsedInput.data.email;
    const passwordChanged = parsedInput.data.password.length > 0;
    if (rolesChanged && !actor.permissions.has("auth.role.manage")) {
      return failure("FORBIDDEN", "Profilin rollarını dəyişmək üçün rol idarəetmə icazəsi tələb olunur.");
    }
    if ((emailChanged || passwordChanged) && !actor.permissions.has("auth.user.manage")) {
      return failure("FORBIDDEN", "Login məlumatlarını dəyişmək üçün istifadəçi idarəetmə icazəsi tələb olunur.");
    }
    if (!rolesChanged && !emailChanged && !passwordChanged) {
      return failure("VALIDATION", "Saxlamaq üçün login, parol və ya rol dəyişikliyi edin.");
    }
    if ((emailChanged || passwordChanged) && !user.authUserId) {
      return failure("NOT_FOUND", "Bu profil üçün aktiv giriş hesabı tapılmadı.");
    }

    if (user.authUserId && (emailChanged || passwordChanged)) {
      const attributes: { email?: string; email_confirm?: boolean; password?: string } = {};
      if (emailChanged) {
        attributes.email = parsedInput.data.email;
        attributes.email_confirm = true;
      }
      if (passwordChanged) { await assertSafePassword(parsedInput.data.password); attributes.password = parsedInput.data.password; }
      const { error } = await getSupabaseAdminClient().auth.admin.updateUserById(user.authUserId, attributes);
      if (error) {
        return failure(
          /already|exists|registered/i.test(error.message) ? "VALIDATION" : "UNKNOWN",
          /already|exists|registered/i.test(error.message)
            ? "Bu e-poçt ünvanı ilə giriş hesabı artıq mövcuddur."
            : "Login məlumatları yenilənə bilmədi.",
        );
      }
    }

    try {
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`select id from erp.users where id = ${user.id}::uuid for update`;
        await assertNoPendingAccountLifecycle(tx, user.id);
        if (emailChanged) {
          await tx.user.update({
            where: { id: user.id },
            data: {
              email: parsedInput.data.email,
            },
          });
        }
        if (rolesChanged) {
          await tx.userRole.deleteMany({ where: { userId: user.id } });
          await tx.userRole.createMany({
            data: nextRoles.map((role) => ({ userId: user.id, roleId: role.id })),
          });
        }
        await writeAuditLog(tx, {
          actorUserId: actor.id,
          action: "auth.user.update",
          entityType: "user",
          entityId: user.id,
          before: {
            loginEmail: user.email,
            roles: user.roles.map(({ role }) => ({ id: role.id, name: role.name })),
          } as Prisma.InputJsonValue,
          after: {
            loginEmail: parsedInput.data.email,
            emailChanged,
            passwordChanged,
            rolesChanged,
            roles: nextRoles.map((role) => ({ id: role.id, name: role.name })),
          } as Prisma.InputJsonValue,
          reason: "Rol ekranından profil giriş məlumatları yeniləndi",
        });
      });
    } catch (dbError) {
      if (emailChanged && user.authUserId) {
        await getSupabaseAdminClient().auth.admin.updateUserById(user.authUserId, {
          email: user.email,
          email_confirm: true,
        }).catch(() => undefined);
      }
      throw dbError;
    }

    const updatedUser: RoleUserDto = {
      updatedAt: (await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { updatedAt: true } })).updatedAt.toISOString(),
      isCurrent: user.id === actor.id,
      id: user.id,
      employeeId: user.hrEmployeeProfile?.id ?? null,
      kind: user.hrEmployeeProfile ? "EMPLOYEE" : "PROFILE",
      fullName: user.fullName,
      email: parsedInput.data.email,
      department: user.hrEmployeeProfile?.department ?? "HR xaricində",
      position: user.hrEmployeeProfile?.position ?? "Giriş profili",
      isActive: user.isActive,
      hasLogin: Boolean(user.authUserId),
      isProtected: false,
      roleIds,
    };

    revalidatePath("/settings/roles");
    revalidatePath("/hr");
    if (user.hrEmployeeProfile) revalidatePath(`/hr/${user.hrEmployeeProfile.id}`);
    revalidatePath("/", "layout");
    return { ok: true as const, user: updatedUser };
  } catch (error) {
    return failure(error instanceof Error && error.message.startsWith("Missing permission") ? "FORBIDDEN" : "UNKNOWN", "Profil məlumatları saxlanarkən xəta baş verdi.");
  }
}

function failure<T extends string>(code: T, message: string) { return { ok: false as const, code, message }; }
function normalizeGrants(submitted: SubmittedGrant[], includeSuperAdminManaged: boolean) {
  const definitions = new Map(permissionDefinitions.map((definition) => [definition.code, definition]));
  const normalized = new Map<PermissionCode, PermissionScope>();
  for (const grant of submitted) {
    const code = String(grant.code ?? "");
    if (!isPermissionCode(code)) continue;
    if (isSuperAdminOnlyPermission(code)) continue;
    if (!includeSuperAdminManaged && isSuperAdminManagedPermission(code)) continue;
    const definition = definitions.get(code);
    const supportsScope = definition && "supportsScope" in definition && definition.supportsScope;
    normalized.set(code, supportsScope && grant.scope === "ASSIGNED" ? "ASSIGNED" : "ALL");
  }
  ensurePermissionDependencies(normalized);
  return normalized;
}

function ensurePermissionDependencies(normalized: Map<PermissionCode, PermissionScope>) {
  const definitions = new Map(permissionDefinitions.map((definition) => [definition.code, definition]));
  for (const code of [...normalized.keys()]) {
    const definition = definitions.get(code);
    if (definition && "dependsOn" in definition && isPermissionCode(definition.dependsOn) && !normalized.has(definition.dependsOn)) normalized.set(definition.dependsOn, "ALL");
  }
}
async function resolvePermissionRows(
  tx: Prisma.TransactionClient,
  grants: ReadonlyMap<PermissionCode, PermissionScope>,
) {
  const codes = [...grants.keys()];
  if (codes.length === 0) return [];

  const definitions = new Map(
    permissionDefinitions.map(({ code, description }) => [code, description]),
  );
  await tx.permission.createMany({
    data: codes.map((code) => ({ code, description: definitions.get(code) ?? null })),
    skipDuplicates: true,
  });

  const rows = await tx.permission.findMany({ where: { code: { in: codes } } });
  if (rows.length !== codes.length) {
    throw new Error("Permission catalog synchronization failed");
  }

  return rows;
}
function isUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function slugify(value: string) { return value.toLocaleLowerCase("az").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/ə/g, "e").replace(/ı/g, "i").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "rol"; }
