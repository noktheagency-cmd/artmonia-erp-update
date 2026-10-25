import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { z } from "zod";
import type { ErpActor } from "@/server/auth/actor";
import { assertPermission } from "@/server/rbac/permissions";
import { PublicActionError } from "@/server/actions/public-action-error";
import { writeAuditLog } from "@/modules/audit/audit-service";
import { accountLifecyclePermission, assertAccountLifecycleTarget, type AccountLifecycleInput, type AccountLifecycleOperation } from "./account-lifecycle-policy";

const REQUEST_ACTION = "auth.account.lifecycle.request";
const COMPLETE_ACTION = "auth.account.lifecycle.complete";
const requestDetailsSchema = z.object({
  requestKey: z.string().uuid(), operation: z.enum(["DISABLE", "ENABLE", "DELETE"]),
  targetAuthUserId: z.string().uuid(), inputVersion: z.string(),
});
const targetInclude = {
  roles: { include: { role: true } },
  hrEmployeeProfile: { select: { id: true, archivedAt: true, status: true } },
} satisfies Prisma.UserInclude;

export type AccountLifecycleResult = {
  userId: string; isActive: boolean; hasLogin: boolean; updatedAt: string; roleIds: string[]; replayed: boolean;
};
export type AccountAuthProvider = {
  apply(authUserId: string, operation: AccountLifecycleOperation): Promise<{ error: { status?: number; code?: string } | null }>;
};

export async function pendingAccountLifecycle(tx: Prisma.TransactionClient, userId: string) {
  const request = await tx.auditLog.findFirst({ where: { entityType: "user", entityId: userId, action: REQUEST_ACTION }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  if (!request) return null;
  const details = requestDetailsSchema.parse(request.afterJson);
  const completed = await tx.auditLog.findFirst({ where: {
    entityType: "user", entityId: userId, action: COMPLETE_ACTION,
    afterJson: { path: ["requestKey"], equals: details.requestKey },
  } });
  return completed ? null : { ...details, reason: request.reason ?? "" };
}

export async function assertNoPendingAccountLifecycle(tx: Prisma.TransactionClient, userId: string) {
  if (await pendingAccountLifecycle(tx, userId)) throw new PublicActionError("Hesab üçün tamamlanmamış giriş əməliyyatı var. Əvvəl həmin əməliyyatı yenidən cəhd edin.", "CONFLICT");
}

function resultFor(user: Prisma.UserGetPayload<{ include: typeof targetInclude }>, replayed = false): AccountLifecycleResult {
  return { userId: user.id, isActive: user.isActive, hasLogin: Boolean(user.authUserId), updatedAt: user.updatedAt.toISOString(), roleIds: user.roles.map((row) => row.roleId), replayed };
}

export async function changeAccountLifecycle(db: PrismaClient, provider: AccountAuthProvider, actor: ErpActor, input: AccountLifecycleInput): Promise<AccountLifecycleResult> {
  assertPermission(actor.permissions, accountLifecyclePermission(input.operation));
  const prepared = await db.$transaction(async (tx) => {
    await tx.$queryRaw`select id from erp.users where id = ${input.userId}::uuid for update`;
    const user = await tx.user.findUnique({ where: { id: input.userId }, include: targetInclude });
    if (!user) throw new PublicActionError("Giriş profili tapılmadı.", "NOT_FOUND");
    assertAccountLifecycleTarget(actor, user, input.operation);

    const existing = await tx.auditLog.findFirst({ where: {
      entityType: "user", entityId: user.id, action: REQUEST_ACTION,
      afterJson: { path: ["requestKey"], equals: input.requestKey },
    } });
    let targetAuthUserId = user.authUserId;
    if (existing) {
      const details = requestDetailsSchema.parse(existing.afterJson);
      if (details.operation !== input.operation || details.inputVersion !== input.expectedUpdatedAt || existing.reason !== input.reason) {
        throw new PublicActionError("Əməliyyat təkrarı ilkin sorğu ilə uyğun deyil.", "CONFLICT");
      }
      const completed = await tx.auditLog.findFirst({ where: {
        entityType: "user", entityId: user.id, action: COMPLETE_ACTION,
        afterJson: { path: ["requestKey"], equals: input.requestKey },
      } });
      if (completed) return { replay: resultFor(user, true) };
      targetAuthUserId = details.targetAuthUserId;
      if (user.authUserId !== targetAuthUserId) throw new PublicActionError("Hesabın giriş əlaqəsi dəyişib. Səhifəni yeniləyin.", "CONFLICT");
    } else {
      await assertNoPendingAccountLifecycle(tx, user.id);
      if (user.updatedAt.toISOString() !== input.expectedUpdatedAt) throw new PublicActionError("Profil dəyişib. Səhifəni yeniləyib yenidən cəhd edin.", "CONFLICT");
      if (!targetAuthUserId) throw new PublicActionError("Bu profilin giriş hesabı yoxdur.", "NOT_FOUND");
      if (await tx.studentMobileAccount.findUnique({ where: { authUserId: targetAuthUserId }, select: { id: true } })) {
        throw new PublicActionError("Bu giriş tələbə mobil hesabı ilə paylaşılır. Əvvəl giriş hesabları ayrılmalıdır.", "CONFLICT");
      }
      await writeAuditLog(tx, {
        actorUserId: actor.id, action: REQUEST_ACTION, entityType: "user", entityId: user.id, reason: input.reason,
        before: { isActive: user.isActive, roles: user.roles.map(({ role }) => ({ id: role.id, name: role.name })) },
        after: { requestKey: input.requestKey, operation: input.operation, targetAuthUserId, inputVersion: input.expectedUpdatedAt },
      });
    }
    // All operations start closed. ENABLE opens access only after Auth succeeds.
    await tx.user.update({ where: { id: user.id }, data: { isActive: false } });
    await tx.authSessionRecord.updateMany({ where: { userId: user.id, revokedAt: null }, data: {
      revokedAt: new Date(), revokedById: actor.id, revokeReason: input.reason,
    } });
    await tx.$executeRaw`delete from auth.sessions where user_id = ${targetAuthUserId}::uuid`;
    return { targetAuthUserId: targetAuthUserId! };
  });
  if (prepared.replay) return prepared.replay;

  let providerFailed = false;
  try {
    const { error } = await provider.apply(prepared.targetAuthUserId, input.operation);
    providerFailed = Boolean(error && !(input.operation === "DELETE" && error.code === "user_not_found"));
  } catch { providerFailed = true; }
  if (providerFailed) {
    throw new PublicActionError("ERP girişi bağlanıb. Auth əməliyyatı tamamlanmadı; eyni əməliyyatı yenidən cəhd edin.", "NETWORK");
  }

  return db.$transaction(async (tx) => {
    await tx.$queryRaw`select id from erp.users where id = ${input.userId}::uuid for update`;
    const user = await tx.user.findUnique({ where: { id: input.userId }, include: targetInclude });
    if (!user) throw new PublicActionError("Giriş profili tapılmadı.", "NOT_FOUND");
    const alreadyComplete = await tx.auditLog.findFirst({ where: {
      entityType: "user", entityId: user.id, action: COMPLETE_ACTION,
      afterJson: { path: ["requestKey"], equals: input.requestKey },
    } });
    if (alreadyComplete) return resultFor(user, true);
    if (user.authUserId !== prepared.targetAuthUserId) throw new PublicActionError("Giriş əlaqəsi dəyişib. Yeni hesaba müdaxilə edilmədi.", "CONFLICT");
    assertAccountLifecycleTarget(actor, user, input.operation);
    if (input.operation === "DELETE") await tx.userRole.deleteMany({ where: { userId: user.id } });
    const updated = await tx.user.update({ where: { id: user.id }, data: {
      isActive: input.operation === "ENABLE",
      ...(input.operation === "DELETE" ? { authUserId: null } : {}),
    }, include: targetInclude });
    await writeAuditLog(tx, {
      actorUserId: actor.id, action: COMPLETE_ACTION, entityType: "user", entityId: user.id, reason: input.reason,
      after: { requestKey: input.requestKey, operation: input.operation, isActive: updated.isActive, loginRemoved: input.operation === "DELETE" },
    });
    return resultFor(updated);
  });
}
