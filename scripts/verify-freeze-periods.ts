// Integration verification: every fixture and unapplied migration is rolled back.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import pg from "pg";
import type { Prisma } from "../src/generated/prisma/client";
import {
  buildFreezePreview,
  loadFreezeStudent,
} from "../src/modules/students/freeze-period-service";

config({ path: ".env.local", quiet: true });
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const tx = {
  $queryRaw: async (sql: Prisma.Sql) =>
    (await client.query(sql.text, sql.values)).rows,
} as Prisma.TransactionClient;
const studentId = randomUUID(),
  enrollmentId = randomUUID(),
  periodId = randomUUID();
async function expectBlocked(sql: string, values: unknown[], pattern: RegExp) {
  await client.query("savepoint expected_error");
  try {
    await assert.rejects(client.query(sql, values), pattern);
  } finally {
    await client.query("rollback to savepoint expected_error");
  }
}
try {
  await client.query("begin");
  await client.query("set local lock_timeout='5s'");
  const tables = ["students", "invoices", "payments", "payment_allocations"];
  const fingerprint = async () =>
    Promise.all(
      tables.map(
        async (table) =>
          (
            await client.query(
              `select md5(coalesce(string_agg(to_jsonb(t)::text,'' order by id),'')) hash from erp.${table} t`,
            )
          ).rows[0].hash,
      ),
    );
  const before = await fingerprint();
  if (
    !(await client.query("select to_regclass('erp.student_freeze_periods') t"))
      .rows[0].t
  )
    await client.query(
      readFileSync(
        "supabase/migrations/20260906205137_student_freeze_periods.sql",
        "utf8",
      ),
    );
  const source = (
    await client.query(
      "select s.*,e.id enrollment from erp.students s join erp.enrollments e on e.student_id=s.id where s.code='ART-1534' limit 1",
    )
  ).rows[0];
  const actor = (
    await client.query(
      "select id from erp.users where is_active=true order by created_at limit 1",
    )
  ).rows[0].id;
  await client.query(
    `insert into erp.students select (jsonb_populate_record(null::erp.students,to_jsonb(s)||jsonb_build_object('id',$1::text,'code',$2::text,'creation_idempotency_key',null,'is_test_data',true,'billing_anchor_date','2026-06-04','original_first_lesson_at','2026-06-04'))).* from erp.students s where id=$3`,
    [studentId, `QA-FREEZE-${studentId}`, source.id],
  );
  await client.query(
    `insert into erp.enrollments select (jsonb_populate_record(null::erp.enrollments,to_jsonb(e)||jsonb_build_object('id',$1::text,'student_id',$2::text))).* from erp.enrollments e where id=$3`,
    [enrollmentId, studentId, source.enrollment],
  );
  const invoiceId = randomUUID();
  await client.query(
    `insert into erp.invoices(id,student_id,enrollment_id,period_month,issue_date,due_date,amount,balance_due,status,idempotency_key,created_at,updated_at) values($1,$2,$3,'2026-08-01','2026-08-04','2026-08-04',200,200,'OVERDUE',$4,now(),now())`,
    [invoiceId, studentId, enrollmentId, `qa-${invoiceId}`],
  );
  const input = {
    studentId,
    requestId: periodId,
    startDate: "2026-08-04",
    endDate: "2026-09-04",
    note: "Rollback integration verification",
  };
  const student = await loadFreezeStudent(tx, studentId, true);
  const preview = await buildFreezePreview(tx, input, student, true);
  assert.equal(preview.voidAmount, 200);
  assert.equal(preview.freezesNow, false);
  assert.equal(
    (await buildFreezePreview(tx, { ...input, endDate: "2026-09-01" }, student))
      .reviewCount,
    1,
  );
  const firstFingerprint = preview.fingerprint;
  await client.query(
    "update erp.invoices set updated_at=now()+interval '1 second' where id=$1",
    [invoiceId],
  );
  assert.notEqual(
    (await buildFreezePreview(tx, input, student)).fingerprint,
    firstFingerprint,
    "stale confirmation rejected",
  );
  await client.query(
    "insert into erp.student_freeze_periods(id,student_id,start_date,end_date,note,created_by_id) values($1,$2,$3,$4,$5,$6)",
    [periodId, studentId, input.startDate, input.endDate, input.note, actor],
  );
  assert.deepEqual(
    await loadFreezeStudent(tx, studentId),
    student,
    "historical interval leaves current lifecycle and anchor untouched",
  );
  const dates = (
    await client.query(
      "select erp.student_cycle_fully_frozen($1,'2026-08-01') frozen,erp.next_unfrozen_billing_date($1,'2026-08-01')::text next",
      [studentId],
    )
  ).rows[0];
  assert.equal(dates.frozen, true);
  assert.equal(dates.next, "2026-09-04");
  await expectBlocked(
    "insert into erp.student_freeze_periods(id,student_id,start_date,end_date,note,created_by_id) values($1,$2,'2026-08-10','2026-08-20','duplicate interval',$3)",
    [randomUUID(), studentId, actor],
    /overlap/,
  );
  await client.query(
    "update erp.invoices set status='VOID',balance_due=0 where id=$1",
    [invoiceId],
  );
  await expectBlocked(
    "update erp.invoices set status='OPEN',balance_due=200 where id=$1",
    [invoiceId],
    /cycle is frozen/,
  );
  await expectBlocked(
    `insert into erp.invoices(id,student_id,enrollment_id,period_month,issue_date,due_date,amount,balance_due,status,idempotency_key,created_at,updated_at) values($1,$2,$3,'2026-08-01','2026-08-04','2026-08-04',200,200,'OPEN',$4,now(),now())`,
    [
      randomUUID(),
      studentId,
      enrollmentId,
      `student-period-qa-${randomUUID()}`,
    ],
    /cycle is frozen/,
  );
  assert.equal(
    (
      await client.query(
        "select count(*)::int n from erp.student_billing_cycles where invoice_id=$1",
        [invoiceId],
      )
    ).rows[0].n,
    0,
  );
  await expectBlocked(
    "set local role authenticated; select * from erp.student_freeze_periods",
    [],
    /permission denied/,
  );
  const openId = randomUUID();
  await client.query(
    "insert into erp.student_freeze_periods(id,student_id,start_date,note,created_by_id) values($1,$2,'2026-09-04','Ongoing freeze',$3)",
    [openId, studentId, actor],
  );
  assert.equal(
    (
      await client.query(
        "select erp.next_unfrozen_billing_date($1,'2026-09-01') next",
        [studentId],
      )
    ).rows[0].next,
    null,
  );
  await client.query(
    `insert into erp.student_status_history(id,student_id,old_status,new_status,event_type,effective_at,reason,changed_by_id,created_at) values($1,$2,'FROZEN','SLOT_WAITING','REACTIVATED','2026-09-06','QA return',$3,now())`,
    [randomUUID(), studentId, actor],
  );
  assert.equal(
    (
      await client.query(
        "select end_date::text d from erp.student_freeze_periods where id=$1",
        [openId],
      )
    ).rows[0].d,
    "2026-09-06",
  );
  console.log(
    "PASS: anchored preview, partial review, stale fingerprint, immutable current state, overlap, regeneration, RLS, next date, open freeze closure",
  );
  await client.query("rollback");
  assert.deepEqual(
    await fingerprint(),
    before,
    "all production data unchanged after rollback",
  );
  console.log(
    "PASS: all fixtures rolled back; production fingerprints unchanged",
  );
} finally {
  await client.query("rollback");
  await client.end();
}
