"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { AppRole, Prisma } from "@/generated/prisma/client";
import {
  parseSessionDevice,
  readSessionRequestMetadata,
} from "@/modules/audit/session-device";
import type { RevokeSessionsResult } from "@/modules/audit/session-types";
import { requireErpActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { z } from "zod";

const revokeSessionSchema = z.object({
  sessionId: z.string().uuid(),
  reason: z.string().trim().min(3).max(300).optional(),
});

const revokeOthersSchema = z.object({
  userId: z.string().uuid(),
  reason: z.string().trim().min(3).max(300).optional(),
});

type TargetSessionRow = {
  id: string;
  userId: string;
  userAgent: string | null;
  ipAddress: string | null;
  startedAt: Date;
  lastSeenAt: Date;
};

export async function revokeSessionAction(input: {
  sessionId: string;
  reason?: string;
}): Promise<RevokeSessionsResult> {
  const parsed = revokeSessionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: "Sessiya məlumatı düzgün deyil." };
  }

  try {
    const actor = await requireErpActor();
    if (!actor.currentSessionId) {
      return { ok: false, code: "FORBIDDEN", message: "Təhlükəsiz giriş sessiyası tapılmadı." };
    }

    const [target] = await loadTargetSessions([parsed.data.sessionId]);
    if (!target) {
      return { ok: false, code: "NOT_FOUND", message: "Sessiya artıq aktiv deyil." };
    }
    if (!canManageTarget(actor, target.userId)) {
      return { ok: false, code: "FORBIDDEN", message: "Bu sessiyanı bağlamaq icazəniz yoxdur." };
    }

    const reason = parsed.data.reason || defaultReason(actor.id === target.userId);
    await revokeTargets({ actor, targets: [target], reason });
    const signedOut = target.id === actor.currentSessionId;
    if (signedOut) {
      const supabase = await createSupabaseServerClient();
      await supabase.auth.signOut({ scope: "local" });
    }

    revalidatePath("/audit");
    return { ok: true, revokedSessionIds: [target.id], signedOut };
  } catch (error) {
    console.error("[auth-session] Failed to revoke session", error);
    return { ok: false, code: "UNKNOWN", message: "Sessiyanı bağlamaq mümkün olmadı." };
  }
}

export async function revokeOtherSessionsAction(input: {
  userId: string;
  reason?: string;
}): Promise<RevokeSessionsResult> {
  const parsed = revokeOthersSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: "İstifadəçi məlumatı düzgün deyil." };
  }

  try {
    const actor = await requireErpActor();
    if (!actor.currentSessionId) {
      return { ok: false, code: "FORBIDDEN", message: "Təhlükəsiz giriş sessiyası tapılmadı." };
    }
    if (!canManageTarget(actor, parsed.data.userId)) {
      return { ok: false, code: "FORBIDDEN", message: "Bu istifadəçinin sessiyalarını bağlamaq icazəniz yoxdur." };
    }

    const preserveSessionId = parsed.data.userId === actor.id ? actor.currentSessionId : null;
    const targets = await loadTargetSessionsForUser(parsed.data.userId, preserveSessionId);
    if (!targets.length) {
      return { ok: false, code: "NOT_FOUND", message: "Bağlanacaq əlavə aktiv sessiya yoxdur." };
    }

    const reason = parsed.data.reason || "Digər aktiv sessiyalar təhlükəsizlik panelindən bağlandı";
    await revokeTargets({ actor, targets, reason });

    if (parsed.data.userId === actor.id) {
      const supabase = await createSupabaseServerClient();
      await supabase.auth.signOut({ scope: "others" });
    }

    revalidatePath("/audit");
    return {
      ok: true,
      revokedSessionIds: targets.map((target) => target.id),
      signedOut: false,
    };
  } catch (error) {
    console.error("[auth-session] Failed to revoke other sessions", error);
    return { ok: false, code: "UNKNOWN", message: "Sessiyaları bağlamaq mümkün olmadı." };
  }
}

async function revokeTargets({
  actor,
  targets,
  reason,
}: {
  actor: Awaited<ReturnType<typeof requireErpActor>>;
  targets: TargetSessionRow[];
  reason: string;
}) {
  const requestMetadata = readSessionRequestMetadata(await headers());
  const revokedAt = new Date();
  const sessionIds = targets.map((target) => target.id);

  await getPrisma().$transaction(async (tx) => {
    await tx.authSessionRecord.createMany({
      data: targets.map((target) => {
        const device = parseSessionDevice(target.userAgent);
        return {
          id: target.id,
          userId: target.userId,
          userAgent: target.userAgent,
          ipAddress: target.ipAddress,
          ...device,
          startedAt: target.startedAt,
          lastSeenAt: target.lastSeenAt,
          revokedAt,
          revokedById: actor.id,
          revokeReason: reason,
        };
      }),
      skipDuplicates: true,
    });
    await tx.authSessionRecord.updateMany({
      where: { id: { in: sessionIds } },
      data: { revokedAt, revokedById: actor.id, revokeReason: reason },
    });
    await tx.auditLog.createMany({
      data: targets.map((target) => {
        const device = parseSessionDevice(target.userAgent);
        return {
          actorUserId: actor.id,
          action: "SESSION_REVOKED",
          entityType: "auth_session",
          entityId: target.id,
          beforeJson: {
            status: "ACTIVE",
            userId: target.userId,
            device: `${device.browserName} · ${device.osName}`,
            ipAddress: target.ipAddress,
          } as Prisma.InputJsonValue,
          afterJson: {
            status: "REVOKED",
            revokedAt: revokedAt.toISOString(),
          } as Prisma.InputJsonValue,
          reason,
          ipAddress: requestMetadata.ipAddress,
          userAgent: requestMetadata.userAgent,
        };
      }),
    });
    await tx.$executeRaw(Prisma.sql`
      delete from auth.sessions
      where id in (${Prisma.join(sessionIds.map((id) => Prisma.sql`${id}::uuid`))})
    `);
  });
}

async function loadTargetSessions(ids: string[]) {
  return getPrisma().$queryRaw<TargetSessionRow[]>(Prisma.sql`
    select
      s.id::text as "id",
      u.id::text as "userId",
      s.user_agent as "userAgent",
      host(s.ip) as "ipAddress",
      coalesce(s.created_at, now()) as "startedAt",
      greatest(
        coalesce(s.refreshed_at at time zone 'UTC', '-infinity'::timestamptz),
        coalesce(s.updated_at, '-infinity'::timestamptz),
        coalesce(s.created_at, '-infinity'::timestamptz)
      ) as "lastSeenAt"
    from auth.sessions s
    join erp.users u on u.auth_user_id = s.user_id
    left join erp.auth_session_records sr on sr.id = s.id
    where s.id in (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
      and (s.not_after is null or s.not_after > now())
      and sr.revoked_at is null
  `);
}

async function loadTargetSessionsForUser(userId: string, preserveSessionId: string | null) {
  const rows = await getPrisma().$queryRaw<TargetSessionRow[]>(Prisma.sql`
    select
      s.id::text as "id",
      u.id::text as "userId",
      s.user_agent as "userAgent",
      host(s.ip) as "ipAddress",
      coalesce(s.created_at, now()) as "startedAt",
      greatest(
        coalesce(s.refreshed_at at time zone 'UTC', '-infinity'::timestamptz),
        coalesce(s.updated_at, '-infinity'::timestamptz),
        coalesce(s.created_at, '-infinity'::timestamptz)
      ) as "lastSeenAt"
    from auth.sessions s
    join erp.users u on u.auth_user_id = s.user_id
    left join erp.auth_session_records sr on sr.id = s.id
    where u.id = ${userId}::uuid
      and (${preserveSessionId}::uuid is null or s.id <> ${preserveSessionId}::uuid)
      and (s.not_after is null or s.not_after > now())
      and sr.revoked_at is null
    order by "lastSeenAt" desc
  `);
  return rows;
}

function canManageTarget(
  actor: Awaited<ReturnType<typeof requireErpActor>>,
  targetUserId: string,
) {
  return actor.id === targetUserId || actor.roles.includes(AppRole.SUPER_ADMIN);
}

function defaultReason(ownSession: boolean) {
  return ownSession
    ? "İstifadəçi sessiyanı təhlükəsizlik panelindən bağladı"
    : "Super admin sessiyanı təhlükəsizlik panelindən bağladı";
}
