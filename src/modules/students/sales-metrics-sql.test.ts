import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "pg";
import { Prisma } from "@/generated/prisma/client";
import {
  actualRegistrationSql,
  companySalesCountSql,
  leadHasQualifiedSaleSql,
  ownerSalesCountSql,
} from "./sales-metrics-sql";

test("company sales count uses course_sales journal, not student registration", { skip: !process.env.RUN_DATABASE_TESTS }, async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("begin");
    await client.query(`
      create temporary table students (
        id uuid primary key,
        is_test_data boolean default false
      );
      create temporary table course_sales (
        id uuid primary key,
        student_id uuid references students(id),
        owner_id uuid,
        lead_id uuid,
        qualified_at date,
        cancelled_at timestamptz,
        route text
      );
      insert into students values
        ('11111111-1111-1111-1111-111111111111', false),
        ('22222222-2222-2222-2222-222222222222', false),
        ('33333333-3333-3333-3333-333333333333', true),
        ('44444444-4444-4444-4444-444444444444', false);
      insert into course_sales values
        ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', null, '2026-09-02', null, 'DIRECT'),
        ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'cccccccc-cccc-cccc-cccc-cccccccccccc', '2026-09-05', null, 'CRM'),
        ('cccccccc-cccc-cccc-cccc-ccccccccccc1', '33333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', null, '2026-09-03', null, 'DIRECT'),
        ('dddddddd-dddd-dddd-dddd-dddddddddddd', '44444444-4444-4444-4444-444444444444', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', null, '2026-09-04', '2026-09-04 12:00:00+00', 'DIRECT'),
        ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', null, '2026-10-01', null, 'DIRECT');
    `);

    const count = async (from: string, until: string) => {
      const query = companySalesCountSql(Prisma.sql`${from}`, Prisma.sql`${until}`);
      const sql = query.text
        .replaceAll("erp.", "pg_temp.")
        .replace("now()", "'2026-09-06T12:00:00Z'::timestamptz");
      return Number((await client.query(`select ${sql} as count`, query.values)).rows[0].count);
    };

    assert.equal(await count("2026-09-01", "2026-10-01"), 2, "counts only non-cancelled, non-test sales in window");
    assert.equal(await count("2026-10-01", "2026-11-01"), 0, "future sales vs frozen now() are excluded");

    const ownerId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1";
    const ownerQuery = ownerSalesCountSql(
      Prisma.sql`${ownerId}::uuid`,
      Prisma.sql`${"2026-09-01"}`,
      Prisma.sql`${"2026-10-01"}`,
    );
    const ownerSql = ownerQuery.text.replaceAll("erp.", "pg_temp.");
    assert.equal(
      Number((await client.query(`select ${ownerSql} as count`, ownerQuery.values)).rows[0].count),
      2,
    );

    await client.query(`
      create temporary table leads (
        id uuid primary key,
        converted_student_id uuid
      );
      insert into leads values
        ('cccccccc-cccc-cccc-cccc-cccccccccccc', '22222222-2222-2222-2222-222222222222'),
        ('ffffffff-ffff-ffff-ffff-ffffffffffff', null);
    `);
    const leadSql = leadHasQualifiedSaleSql().text.replaceAll("erp.", "pg_temp.");
    const leadHits = await client.query(
      `select l.id::text as id from pg_temp.leads l where ${leadSql}`,
    );
    assert.deepEqual(
      leadHits.rows.map((row) => row.id).sort(),
      ["cccccccc-cccc-cccc-cccc-cccccccccccc"],
    );
  } finally {
    await client.query("rollback");
    await client.end();
  }
});

test("actualRegistrationSql remains available for acquisition bonuses", () => {
  const fragment = actualRegistrationSql(Prisma.sql`registered_at`);
  assert.match(fragment.text, /registered_at/);
  assert.match(fragment.text, /Asia\/Baku/);
});
