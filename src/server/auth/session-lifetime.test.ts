import assert from "node:assert/strict";
import test from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { ERP_SESSION_MAX_AGE_SQL } from "./session-lifetime";

const connectionString = process.env.SESSION_LIFETIME_TEST_DATABASE_URL;

test("session lifetime accepts days 1–6 and rejects the exact seven-day boundary", { skip: !connectionString }, async () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    // Read-only synthetic values; does not read or modify real user sessions.
    const rows = await db.$queryRaw<Array<{ label: string; allowed: boolean }>>`
      select label, created_at > now() - ${ERP_SESSION_MAX_AGE_SQL} as allowed
      from (values
        ('fresh', now()),
        ('two_days', now() - interval '2 days'),
        ('before_boundary', now() - interval '7 days' + interval '1 second'),
        ('at_boundary', now() - interval '7 days'),
        ('after_boundary', now() - interval '7 days' - interval '1 second')
      ) as cases(label, created_at)
    `;
    assert.deepEqual(Object.fromEntries(rows.map(row => [row.label, row.allowed])), {
      fresh: true, two_days: true, before_boundary: true,
      at_boundary: false, after_boundary: false,
    });
  } finally {
    await db.$disconnect();
  }
});
