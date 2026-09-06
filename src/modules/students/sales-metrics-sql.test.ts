import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "pg";
import { Prisma } from "@/generated/prisma/client";
import { companySalesCountSql, actualRegistrationSql } from "./sales-metrics-sql";

// Opt-in integration: all fixtures are transaction-local temporary tables.
test("company sales count paid returns once; acquisition bonuses exclude returns and future registrations", { skip: !process.env.RUN_DATABASE_TESTS }, async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("begin");
    await client.query(`
      create temporary table students (id text, registered_at date, is_test_data boolean default false);
      create temporary table student_status_history (student_id text, effective_at date, event_type text, new_status text);
      create temporary table payments (student_id text, paid_at date, amount numeric);
      insert into students values ('new', '2026-09-01', false), ('future', '2026-09-15', false), ('return', '2026-02-01', false), ('unpaid', '2026-02-01', false), ('inactive', '2026-02-01', false), ('test', '2026-09-01', true);
      insert into student_status_history values
        ('return', '2026-09-05', 'REACTIVATED', 'SLOT_WAITING'),
        ('return', '2026-09-05', 'REACTIVATED', 'SLOT_WAITING'),
        ('return', '2026-09-06', 'STATUS_CHANGE', 'ACTIVE'),
        ('unpaid', '2026-09-05', 'REACTIVATED', 'SLOT_WAITING'),
        ('unpaid', '2026-09-05', 'STATUS_CHANGE', 'ACTIVE'),
        ('inactive', '2026-09-05', 'REACTIVATED', 'SLOT_WAITING');
      insert into payments values ('return','2026-09-05',50), ('return','2026-09-06',20), ('unpaid','2026-08-01',50), ('inactive','2026-09-05',50);
    `);
    const count = async (until: string) => {
      const query = companySalesCountSql(Prisma.sql`${"2026-09-01"}`, Prisma.sql`${until}`);
      const sql = query.text.replaceAll("erp.", "pg_temp.").replace('::"erp"."StudentLifecycleEventType"', "::text").replace("now()", "'2026-09-06T12:00:00Z'::timestamptz");
      return Number((await client.query(`select ${sql} as count`, query.values)).rows[0].count);
    };
    assert.equal(await count("2026-09-06"), 1, "return waits for activation even if payment already exists");
    assert.equal(await count("2026-10-01"), 2, "duplicate return and multiple payments count once");
    const bonus = actualRegistrationSql(Prisma.sql`registered_at`);
    const result = await client.query(`select count(*) from pg_temp.students where registered_at >= '2026-09-01' and not is_test_data and ${bonus.text.replace("now()", "'2026-09-06T12:00:00Z'::timestamptz")}`);
    assert.equal(Number(result.rows[0].count), 1);
  } finally { await client.query("rollback"); await client.end(); }
});
