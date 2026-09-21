import assert from "node:assert/strict";
import test from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { ErpActor } from "@/server/auth/actor";
import { localizeAttendanceGroup, retentionDetailsHref, retentionInput, retentionRate } from "./retention-analytics";
import { retentionCtes, retentionScope, retentionSummarySql } from "./retention-analytics-sql";

test("retention validates date boundaries and links preserve the selected period", () => {
  assert.equal(retentionInput.safeParse({ from: "2026-02-30", to: "2026-03-01" }).success, false);
  assert.equal(retentionInput.safeParse({ from: "2026-09-21", to: "2026-09-01" }).success, false);
  assert.equal(retentionInput.safeParse({ from: "2026-09-01", to: "2026-09-21", page: 0 }).success, false);
  assert.equal(retentionRate(0, 0), 0);
  assert.equal(retentionRate(2, 6), 33);
  const url = new URL(retentionDetailsHref("2026-08-01", "2026-08-31"), "https://example.test");
  assert.equal(url.searchParams.get("attendance"), "1");
  assert.equal(url.searchParams.get("attendanceFrom"), "2026-08-01");
  assert.equal(url.searchParams.get("attendanceTo"), "2026-08-31");
});

test("attendance group labels translate stored English weekdays", () => {
  assert.equal(localizeAttendanceGroup("MONDAY · 10:00"), "Bazar ertəsi · 10:00");
  assert.equal(localizeAttendanceGroup("SATURDAY / SUNDAY"), "Şənbə / Bazar");
  assert.equal(localizeAttendanceGroup("Rəsm qrupu"), "Rəsm qrupu");
});

const connectionString = process.env.RETENTION_TEST_DATABASE_URL;
test("period churn SQL deduplicates losses, excludes declined/test/future records and intersects scopes", { skip: !connectionString }, async () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const students = [1, 2, 3, 4, 5, 6, 7].map((n) => ({ id: id(n), contact_id: id(n), manager_id: id(n === 2 ? 99 : 98), is_test_data: n === 6, registered_at: n === 7 ? "2026-10-01" : "2026-01-01" }));
  const history = [
    [1, 1, "ACTIVE", "FROZEN", "2026-09-01"],
    [2, 1, "FROZEN", "STOPPED", "2026-09-21"],
    [3, 2, "ACTIVE", "FROZEN", "2026-08-31"],
    [4, 2, "ACTIVE", "STOPPED", "2026-09-22"],
    [5, 3, "ACTIVE", "DECLINED", "2026-09-05"],
    [6, 4, "FROZEN", "FROZEN", "2026-09-06"],
    [7, 6, "ACTIVE", "STOPPED", "2026-09-10"],
    [8, 7, "ACTIVE", "STOPPED", "2026-09-10"],
    [9, 1, "STOPPED", "ACTIVE", "2026-09-21"],
  ].map(([n, student, old, next, date]) => ({ id: id(Number(n) + 100), student_id: id(Number(student)), old_status: old, new_status: next, effective_at: date, reason: "Test", note: null }));
  const fixtures = Prisma.sql`
    fixture_students as (select * from jsonb_to_recordset(${JSON.stringify(students)}::jsonb) as x(id uuid, contact_id uuid, manager_id uuid, is_test_data boolean, registered_at date)),
    fixture_history as (select * from jsonb_to_recordset(${JSON.stringify(history)}::jsonb) as x(id uuid, student_id uuid, old_status text, new_status text, effective_at date, reason text, note text)),
    fixture_freezes as (select ${id(200)}::uuid id, ${id(1)}::uuid student_id, '2026-09-01'::date start_date, 'Test'::text note
      union all select ${id(201)}::uuid, ${id(5)}::uuid, '2026-09-21'::date, 'Test'),
    fixture_enrollments as (select ${id(300)}::uuid id, ${id(1)}::uuid student_id, ${id(400)}::uuid teacher_id, '2026-01-01'::date start_date),
    fixture_assignments as (select ${id(300)}::uuid enrollment_id, ${id(500)}::uuid slot_id, '2026-01-01'::date valid_from, '2026-08-31'::date valid_to),
    fixture_slots as (select ${id(500)}::uuid id, ${id(400)}::uuid teacher_id),
    fixture_teachers as (select ${id(400)}::uuid id, ${id(98)}::uuid user_id)
  `;
  const actor: ErpActor = { id: id(98), authUserId: null, currentSessionId: null, profilePhotoUrl: null, fullName: "Test", email: "test@example.test", roles: [], permissions: new Map([["student.read", "ALL"], ["attendance.read", "ALL"]]) };
  async function run(teacherId?: string) {
    const ctes = retentionCtes("2026-09-01", "2026-09-21", retentionScope(actor), teacherId);
    // Only synthetic CTEs are queried. No application records are read or written.
    const body = new Prisma.Sql(ctes.strings.map((part, i) => i === 0 ? part.replace(/^\s*with\s+/, "") : part), ctes.values);
    const combined = Prisma.sql`with ${fixtures}, ${body} select ${retentionSummarySql}`;
    const replacements: Record<string, string> = { students: "students", student_status_history: "history", student_freeze_periods: "freezes", enrollments: "enrollments", student_schedule_assignments: "assignments", class_slots: "slots", teachers: "teachers" };
    const sql = combined.text.replace(/erp\.(\w+)/g, (_, table: string) => `fixture_${replacements[table]}`);
    const [row] = await db.$queryRawUnsafe<Array<{ population: number; frozen: number; stopped: number; total: number }>>(sql, ...combined.values);
    return row;
  }
  try {
    assert.deepEqual(await run(), { population: 5, frozen: 2, stopped: 1, total: 2 });
    assert.deepEqual(await run(id(400)), { population: 1, frozen: 1, stopped: 1, total: 1 });
    actor.permissions.set("student.read", "ASSIGNED");
    assert.equal((await run()).population, 4);
    actor.permissions.set("attendance.read", "ASSIGNED");
    assert.equal((await run()).population, 1);
    actor.id = id(99);
    assert.equal((await run()).population, 0);
    actor.permissions.clear();
    assert.deepEqual(await run(), { population: 0, frozen: 0, stopped: 0, total: 0 });
  } finally { await db.$disconnect(); }
});
