import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { requireEnv } from "@/server/env";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export function getPrisma() {
  if (!globalForPrisma.prisma) {
    const adapter = new PrismaPg({
      connectionString: requireEnv("DATABASE_URL"),
      max: 5,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 10_000,
      application_name: "artmonia-erp",
    });

    globalForPrisma.prisma = new PrismaClient({ adapter });
  }

  return globalForPrisma.prisma;
}
