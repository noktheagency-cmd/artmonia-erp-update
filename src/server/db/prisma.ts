import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { requireEnv } from "@/server/env";
import { cache } from "react";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

/**
 * pg 8.16+ treats sslmode=require as verify-full unless uselibpqcompat=true.
 * Supabase pooler hostnames fail that verify, which surfaces as login
 * limiter_unavailable on Vercel/Node 24.
 */
function normalizeDatabaseUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has("sslmode")) {
      parsed.searchParams.set("sslmode", "require");
    }
    if (!parsed.searchParams.has("uselibpqcompat")) {
      parsed.searchParams.set("uselibpqcompat", "true");
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

function createPrisma(cloudflare: boolean) {
  const adapter = new PrismaPg({
    connectionString: normalizeDatabaseUrl(requireEnv("DATABASE_URL")),
    max: 5,
    connectionTimeoutMillis: 15_000,
    idleTimeoutMillis: 30_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    application_name: "artmonia-erp",
    // Worker sockets cannot be reused by a different request. Transactions
    // still keep their connection until release, then the pool closes it.
    ...(cloudflare ? { maxUses: 1 } : {}),
  });

  return new PrismaClient({ adapter });
}

const getRequestPrisma = cache(() => createPrisma(true));

export function getPrisma() {
  if (process.env.CLOUDFLARE_PREVIEW === "true") {
    return getRequestPrisma();
  }

  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrisma(false);
  }

  return globalForPrisma.prisma;
}
