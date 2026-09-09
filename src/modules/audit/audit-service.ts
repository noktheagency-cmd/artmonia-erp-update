import type { Prisma } from "@/generated/prisma/client";
import { headers } from "next/headers";
import { readSessionRequestMetadata } from "@/modules/audit/session-device";

type AuditDb = {
  auditLog: {
    create(args: {
      data: Prisma.AuditLogUncheckedCreateInput;
    }): Promise<unknown>;
  };
};

export type AuditInput = {
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
  reason?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export async function writeAuditLog(db: AuditDb, input: AuditInput) {
  let requestMetadata: { ipAddress: string | null; userAgent: string | null } | undefined;
  if (input.ipAddress == null || input.userAgent == null) {
    try { requestMetadata = readSessionRequestMetadata(await headers()); }
    catch { /* CLI/background jobs have no HTTP request context. */ }
  }
  await db.auditLog.create({
    data: {
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      beforeJson: input.before ?? undefined,
      afterJson: input.after ?? undefined,
      reason: input.reason ?? null,
      ipAddress: input.ipAddress ?? requestMetadata?.ipAddress ?? null,
      userAgent: input.userAgent ?? requestMetadata?.userAgent ?? null,
    },
  });
}
