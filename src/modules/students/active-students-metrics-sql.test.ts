import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "pg";
import { Prisma } from "@/generated/prisma/client";
import {
  activeStudentsActualSql,
  activeStudentsAsOfSql,
  currentActiveStudentsSql,
} from "./active-students-metrics-sql";

test("currentActiveStudentsSql matches students-list ACTIVE snapshot", {
  skip: !process.env.RUN_DATABASE_TESTS,
}, async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("begin");
    await client.query(`
      create temporary table single_lessons (student_id uuid);
      create temporary table enrollments (student_id uuid);
      create temporary table students (
        id uuid primary key,
        registered_at date not null,
        lifecycle_status text not null,
        is_test_data boolean not null default false
      );
      insert into students values
        ('11111111-1111-1111-1111-111111111111', '2026-01-01', 'ACTIVE', false),
        ('22222222-2222-2222-2222-222222222222', '2026-01-01', 'ACTIVE', false),
        ('33333333-3333-3333-3333-333333333333', '2026-01-01', 'FROZEN', false),
        ('44444444-4444-4444-4444-444444444444', '2026-01-01', 'ACTIVE', true);
    `);

    const query = currentActiveStudentsSql();
    const sql = query.text.replaceAll("erp.", "pg_temp.");
    const count = Number((await client.query(`select ${sql} as count`, query.values)).rows[0].count);
    assert.equal(count, 2);
  } finally {
    await client.query("rollback").catch(() => undefined);
    await client.end();
  }
});

test("activeStudentsAsOfSql reconstructs ACTIVE from status history", {
  skip: !process.env.RUN_DATABASE_TESTS,
}, async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("begin");
    await client.query(`
      create temporary table single_lessons (student_id uuid);
      create temporary table enrollments (student_id uuid);
      create temporary table students (
        id uuid primary key,
        registered_at date not null,
        lifecycle_status text not null,
        is_test_data boolean not null default false
      );
      create temporary table student_status_history (
        id serial primary key,
        student_id uuid not null,
        new_status text not null,
        effective_at date not null,
        created_at timestamptz not null default now()
      );

      insert into students values
        ('11111111-1111-1111-1111-111111111111', '2026-01-01', 'ACTIVE', false),
        ('22222222-2222-2222-2222-222222222222', '2026-01-01', 'FROZEN', false),
        ('33333333-3333-3333-3333-333333333333', '2026-01-01', 'ACTIVE', false),
        ('44444444-4444-4444-4444-444444444444', '2026-01-01', 'ACTIVE', true),
        ('55555555-5555-5555-5555-555555555555', '2026-10-15', 'ACTIVE', false);

      insert into student_status_history (student_id, new_status, effective_at, created_at) values
        ('11111111-1111-1111-1111-111111111111', 'ACTIVE', '2026-02-01', '2026-02-01 10:00:00+00'),
        ('11111111-1111-1111-1111-111111111111', 'STOPPED', '2026-09-01', '2026-09-01 10:00:00+00'),
        ('22222222-2222-2222-2222-222222222222', 'ACTIVE', '2026-03-01', '2026-03-01 10:00:00+00');
    `);

    const asOf = "2026-10-15";
    const query = activeStudentsAsOfSql(Prisma.sql`${asOf}::date`);
    const sql = query.text.replaceAll("erp.", "pg_temp.");
    const count = Number((await client.query(`select ${sql} as count`, query.values)).rows[0].count);

    assert.equal(count, 2, "includes history-ACTIVE + fallback ACTIVE; excludes stopped snapshot, test, and same-day register");
  } finally {
    await client.query("rollback").catch(() => undefined);
    await client.end();
  }
});

test("activeStudentsActualSql uses live snapshot while month is open", () => {
  const open = activeStudentsActualSql(Prisma.sql`${"2026-10-23"}::date`, false);
  assert.match(open.text, /lifecycle_status = 'ACTIVE'/);
  assert.doesNotMatch(open.text, /student_status_history/);

  const closed = activeStudentsActualSql(Prisma.sql`${"2026-10-01"}::date`, true);
  assert.match(closed.text, /student_status_history/);
});

test("shared metric helpers keep distinct roles", () => {
  const live = currentActiveStudentsSql();
  assert.match(live.text, /lifecycle_status = 'ACTIVE'/);
  assert.doesNotMatch(live.text, /student_status_history/);

  const asOf = activeStudentsAsOfSql(Prisma.sql`${"2026-10-23"}::date`);
  assert.match(asOf.text, /student_status_history/);
  assert.match(asOf.text, /registered_at </);
});
