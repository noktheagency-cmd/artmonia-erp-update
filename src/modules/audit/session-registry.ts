import "server-only";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { writeAuditLog } from "@/modules/audit/audit-service";
import {
  readSessionRequestMetadata,
  type SessionRequestMetadata,
} from "@/modules/audit/session-device";

type SessionDatabase = PrismaClient | Prisma.TransactionClient;

export type SessionSyncResult = {
  sessionId: string;
  created: boolean;
  revoked: boolean;
  metadata: SessionRequestMetadata;
};

export async function syncVerifiedAuthSession({
  db,
  sessionId,
  userId,
  issuedAt,
  headers,
}: {
  db: SessionDatabase;
  sessionId: string;
  userId: string;
  issuedAt: number;
  headers: Pick<Headers, "get">;
}): Promise<SessionSyncResult> {
  const metadata = readSessionRequestMetadata(headers);
  const existing = await db.authSessionRecord.findUnique({
    where: { id: sessionId },
    select: {
      userId: true,
      revokedAt: true,
      lastSeenAt: true,
      ipAddress: true,
      city: true,
      country: true,
    },
  });

  if (existing?.revokedAt || (existing && existing.userId !== userId)) {
    return { sessionId, created: false, revoked: true, metadata };
  }

  const now = new Date();
  if (!existing) {
    const insertion = await db.authSessionRecord.createMany({
      data: [{
        id: sessionId,
        userId,
        ...metadataToRecord(metadata),
        startedAt: new Date(issuedAt * 1_000),
        lastSeenAt: now,
      }],
      skipDuplicates: true,
    });

    if (insertion.count === 0) {
      const concurrentRecord = await db.authSessionRecord.findUnique({
        where: { id: sessionId },
        select: { userId: true, revokedAt: true },
      });
      return {
        sessionId,
        created: false,
        revoked:
          !concurrentRecord ||
          Boolean(concurrentRecord.revokedAt) ||
          concurrentRecord.userId !== userId,
        metadata,
      };
    }

    await writeAuditLog(db, {
      actorUserId: userId,
      action: "SESSION_SIGNED_IN",
      entityType: "auth_session",
      entityId: sessionId,
      reason: "Yeni cihaz sessiyası yaradıldı",
      after: {
        device: `${metadata.browserName} · ${metadata.osName}`,
        deviceName: metadata.deviceName,
        ipAddress: metadata.ipAddress,
      },
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });
    return { sessionId, created: true, revoked: false, metadata };
  }

  const shouldTouch =
    now.getTime() - existing.lastSeenAt.getTime() >= 120_000 ||
    existing.ipAddress !== metadata.ipAddress ||
    existing.city !== metadata.city ||
    existing.country !== metadata.country;

  if (shouldTouch) {
    await db.authSessionRecord.update({
      where: { id: sessionId },
      data: {
        ...metadataToRecord(metadata),
        lastSeenAt: now,
      },
    });
  }

  return { sessionId, created: false, revoked: false, metadata };
}

export function metadataToRecord(metadata: SessionRequestMetadata) {
  return {
    userAgent: metadata.userAgent,
    clientHints: metadata.clientHints as Prisma.InputJsonValue,
    ipAddress: metadata.ipAddress,
    city: metadata.city,
    country: metadata.country,
    deviceType: metadata.deviceType,
    deviceName: metadata.deviceName,
    browserName: metadata.browserName,
    browserVersion: metadata.browserVersion,
    osName: metadata.osName,
    osVersion: metadata.osVersion,
  };
}
