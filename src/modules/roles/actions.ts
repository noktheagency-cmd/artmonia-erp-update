"use server";

import { revalidatePath } from "next/cache";
import { AppRole, Prisma } from "@/generated/prisma/client";
import { writeAuditLog } from "@/modules/audit/audit-service";
import type { CreateRoleResult, DeleteRoleResult, RoleSummaryDto, UpdateRolePermissionsResult } from "@/modules/roles/types";
import { requireMutationActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";
import { isPermissionCode, permissionDefinitions, type PermissionCode, type PermissionScope } from "@/server/rbac/permissions";

type SubmittedGrant = { code?: unknown; scope?: unknown };

export async function updateRolePermissionsAction(formData: FormData): Promise<UpdateRolePermissionsResult> {
  try {
    const actor = await requireMutationActor("auth.role.manage");
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

    const definitionByCode = new Map(permissionDefinitions.map((definition) => [definition.code, definition]));
    const normalized = new Map<PermissionCode, PermissionScope>();
    for (const grant of submitted) {
      const code = String(grant.code ?? "");
      if (!isPermissionCode(code)) continue;
      const definition = definitionByCode.get(code);
      const supportsScope = definition && "supportsScope" in definition && definition.supportsScope;
      normalized.set(code, supportsScope && grant.scope === "ASSIGNED" ? "ASSIGNED" : "ALL");
    }
    for (const code of [...normalized.keys()]) {
      const definition = definitionByCode.get(code);
      if (definition && "dependsOn" in definition && isPermissionCode(definition.dependsOn) && !normalized.has(definition.dependsOn)) normalized.set(definition.dependsOn, "ALL");
    }

    const result = await getPrisma().$transaction(async (tx) => {
      const role = await tx.role.findUnique({ where: { id: roleId }, include: { permissions: { include: { permission: true } } } });
      if (!role) return { kind: "NOT_FOUND" as const };
      if (role.code === AppRole.SUPER_ADMIN) return { kind: "FORBIDDEN" as const };
      if (role.updatedAt.toISOString() !== expectedUpdatedAt) return { kind: "CONFLICT" as const };
      const permissionRows = await tx.permission.findMany({ where: { code: { in: [...normalized.keys()] } } });
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
      const source = copyFromRoleId ? await tx.role.findUnique({ where: { id: copyFromRoleId }, include: { permissions: true } }) : null;
      if (copyFromRoleId && !source) return null;
      const role = await tx.role.create({ data: { key: `custom.${slugify(name)}.${crypto.randomUUID().slice(0, 8)}`, name, description: description || null, isSystem: false } });
      if (submitted) {
        const normalized = normalizeGrants(submitted);
        const permissions = await tx.permission.findMany({ where: { code: { in: [...normalized.keys()] } } });
        if (permissions.length) await tx.rolePermission.createMany({ data: permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id, scope: normalized.get(permission.code as PermissionCode) ?? "ALL" })) });
      } else if (source?.permissions.length) {
        await tx.rolePermission.createMany({ data: source.permissions.map((grant) => ({ roleId: role.id, permissionId: grant.permissionId, scope: grant.scope })) });
      }
      await writeAuditLog(tx, { actorUserId: actor.id, action: "role.create", entityType: "role", entityId: role.id, after: { name, description: description || null, copiedFrom: source?.name ?? null } as Prisma.InputJsonValue, reason: "Yeni custom rol yaradıldı" });
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
    const result = await getPrisma().$transaction(async (tx) => {
      const role = await tx.role.findUnique({ where: { id: roleId }, include: { _count: { select: { users: true } } } });
      if (!role) return "NOT_FOUND" as const;
      if (role.isSystem || role.code) return "FORBIDDEN" as const;
      if (role._count.users > 0) return "IN_USE" as const;
      await writeAuditLog(tx, { actorUserId: actor.id, action: "role.delete", entityType: "role", entityId: role.id, before: { name: role.name, key: role.key, description: role.description } as Prisma.InputJsonValue, reason: "Custom rol silindi" });
      await tx.role.delete({ where: { id: role.id } });
      return "OK" as const;
    });
    if (result === "NOT_FOUND") return failure("NOT_FOUND", "Rol tapılmadı.");
    if (result === "FORBIDDEN") return failure("FORBIDDEN", "Sistem rolları silinə bilməz.");
    if (result === "IN_USE") return failure("IN_USE", "Bu rol istifadəçiyə təyin olunub və silinə bilməz.");
    revalidatePath("/settings/roles");
    return { ok: true, roleId };
  } catch { return failure("UNKNOWN", "Rol silinərkən xəta baş verdi."); }
}

function failure<T extends string>(code: T, message: string) { return { ok: false as const, code, message }; }
function normalizeGrants(submitted: SubmittedGrant[]) {
  const definitions = new Map(permissionDefinitions.map((definition) => [definition.code, definition]));
  const normalized = new Map<PermissionCode, PermissionScope>();
  for (const grant of submitted) {
    const code = String(grant.code ?? "");
    if (!isPermissionCode(code)) continue;
    const definition = definitions.get(code);
    const supportsScope = definition && "supportsScope" in definition && definition.supportsScope;
    normalized.set(code, supportsScope && grant.scope === "ASSIGNED" ? "ASSIGNED" : "ALL");
  }
  for (const code of [...normalized.keys()]) {
    const definition = definitions.get(code);
    if (definition && "dependsOn" in definition && isPermissionCode(definition.dependsOn) && !normalized.has(definition.dependsOn)) normalized.set(definition.dependsOn, "ALL");
  }
  return normalized;
}
function isUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function slugify(value: string) { return value.toLocaleLowerCase("az").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/ə/g, "e").replace(/ı/g, "i").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "rol"; }
