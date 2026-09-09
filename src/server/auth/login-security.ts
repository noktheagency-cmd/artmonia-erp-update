import "server-only";
import { createHmac } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/server/db/prisma";
import { getEnv, requireEnv } from "@/server/env";
import { writeAuditLog } from "@/modules/audit/audit-service";
import type { SessionRequestMetadata } from "@/modules/audit/session-device";

export async function consumeLoginAttempt(email: string, metadata: SessionRequestMetadata) {
  const db = getPrisma();
  const secret = getEnv().SUPABASE_SECRET_KEY || requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const digest = (value: string) => createHmac("sha256", secret).update(value).digest("hex");
  await db.$executeRaw`delete from erp.auth_rate_limits where expires_at < now()`;
  for (const [key, limit] of [[`ip:${metadata.ipAddress ?? "unknown"}`, 60], [`email:${email.toLowerCase()}`, 20]] as const) {
    const [result] = await db.$queryRaw<Array<{ attempts: number }>>(Prisma.sql`
      insert into erp.auth_rate_limits (key, attempts, expires_at)
      values (${digest(key)}, 1, now() + interval '15 minutes')
      on conflict (key) do update set
        attempts = case when erp.auth_rate_limits.expires_at <= now() then 1 else least(erp.auth_rate_limits.attempts + 1, ${limit + 2}) end,
        expires_at = case when erp.auth_rate_limits.expires_at <= now() then now() + interval '15 minutes' else erp.auth_rate_limits.expires_at end
      returning attempts
    `);
    if (result.attempts > limit) {
      if (result.attempts === limit + 1) await recordLoginEvent("auth.login.rate_limited", email, metadata);
      return false;
    }
  }
  return true;
}

export async function recordLoginEvent(action: "auth.login.failed" | "auth.login.succeeded" | "auth.login.rate_limited" | "auth.login.denied", email: string, metadata: SessionRequestMetadata, actorUserId?: string) {
  await writeAuditLog(getPrisma(), {
    action, entityType: "auth_account", actorUserId,
    after: { email: email.toLowerCase() },
    ipAddress: metadata.ipAddress, userAgent: metadata.userAgent,
  });
  console.info("Security event", { action, ipAddress: metadata.ipAddress });
}
