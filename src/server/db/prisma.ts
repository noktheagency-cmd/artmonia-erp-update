import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { requireEnv } from "@/server/env";
import { cache } from "react";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createPrisma(cloudflare: boolean) {
  const adapter = new PrismaPg({
    connectionString: requireEnv("DATABASE_URL"),
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
