// All schema and student fixtures are rolled back, including failed assertions.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import pg from "pg";
import type { Prisma } from "../src/generated/prisma/client";
import {
  previewDeadlineRule,
  applyDeadlineRule,
} from "../src/modules/students/billing-deadline-service";
import { changeReservedFreeze } from "../src/modules/students/reserved-freeze-service";
import {
  buildFreezePreview,
  loadFreezeStudent,
} from "../src/modules/students/freeze-period-service";
import { currentBakuDateValue } from "../src/modules/students/payment-date-policy";
import { getReservedAttendanceKeys } from "../src/modules/attendance/reserved-attendance-policy";
config({ path: ".env.local", quiet: true });
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const actorId = "f74ddcf3-fed2-4d36-86e5-5e75ab94f225";
const otherId = "0ad3d342-24bc-4c69-9c3e-3cb2755c19e4";
const studentId = randomUUID(),
  enrollmentId = randomUUID();
const today = currentBakuDateValue();
const sql = async (text: string, values: unknown[] = []) =>
  (await client.query(text, values)).rows;
// Adapter drives the real domain services through the same transaction as rollback-only DDL.
const tx = {
  $queryRaw: async (q: Prisma.Sql) => sql(q.text, q.values),
  $executeRaw: async (q: Prisma.Sql) =>
    (await client.query(q.text, q.values)).rowCount,
  invoice: {
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: { dueDate: Date };
    }) =>
      sql(
        "update erp.invoices set due_date=$2,updated_at=clock_timestamp() where id=$1 returning *",
        [where.id, data.dueDate],
      ),
  },
  auditLog: {
    create: async ({ data }: { data: Prisma.AuditLogUncheckedCreateInput }) =>
      sql(
        "insert into erp.audit_logs(id,actor_user_id,action,entity_type,entity_id,before_json,after_json,reason,created_at) values(gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,now())",
        [
          data.actorUserId,
          data.action,
          data.entityType,
          data.entityId,
          data.beforeJson,
          data.afterJson,
          data.reason,
        ],
      ),
  },
  studentScheduleAssignment: {
    count: async () =>
      Number(
        (
          await sql(
            "select count(*) n from erp.student_schedule_assignments a join erp.enrollments e on e.id=a.enrollment_id where e.student_id=$1 and e.status='ACTIVE' and a.valid_to is null",
            [studentId],
          )
        )[0].n,
      ),
  },
  student: {
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: {
        lifecycleStatus: string;
        freezeReserved: boolean;
        billingPaused: boolean;
      };
    }) =>
      sql(
        'update erp.students set lifecycle_status=$2::erp."StudentLifecycleStatus",freeze_reserved=$3,billing_paused=$4,freeze_return_at=null,updated_at=clock_timestamp() where id=$1',
        [
          where.id,
          data.lifecycleStatus,
          data.freezeReserved,
          data.billingPaused,
        ],
      ),
  },
  studentStatusHistory: {
    create: async ({
      data,
    }: {
      data: Prisma.StudentStatusHistoryUncheckedCreateInput;
    }) =>
      sql(
        'insert into erp.student_status_history(id,student_id,old_status,new_status,freeze_reserved,event_type,effective_at,changed_by_id,note,reason,created_at) values(gen_random_uuid(),$1,$2::erp."StudentLifecycleStatus",$3::erp."StudentLifecycleStatus",$4,$5::erp."StudentLifecycleEventType",$6,$7,$8,$9,clock_timestamp())',
        [
          data.studentId,
          data.oldStatus,
          data.newStatus,
          data.freezeReserved,
          data.eventType,
          data.effectiveAt,
          data.changedById,
          data.note,
          data.reason,
        ],
      ),
  },
} as unknown as Prisma.TransactionClient;
async function blocked(action: () => Promise<unknown>, pattern: RegExp) {
  await sql("savepoint expected_error");
  try {
    await assert.rejects(action, pattern);
  } finally {
    await sql("rollback to savepoint expected_error");
  }
}
const fingerprints = async () =>
  Promise.all(
    [
      "students",
      "invoices",
      "payments",
      "payment_allocations",
      "student_schedule_assignments",
    ].map(
      async (table) =>
        (
          await sql(
            `select md5(coalesce(string_agg(to_jsonb(t)::text,'' order by id),'')) hash from erp.${table} t`,
          )
        )[0].hash,
    ),
  );
const before = await fingerprints();
try {
  await sql("begin");
  await sql("set local lock_timeout='5s'");
  const attendanceMigration =
    "supabase/migrations/20260907122409_reserved_freeze_attendance_guard.sql";
  if (!(await sql("select to_regclass('erp.student_due_date_rules') t"))[0].t)
    await client.query(
      readFileSync(
        "supabase/migrations/20260907120306_student_due_rules_reserved_freeze.sql",
        "utf8",
      ),
    );
  if (
    !(
      await sql(
        "select to_regprocedure('erp.student_is_reserved_on_date(uuid,date)') f",
      )
    )[0].f
  )
    await client.query(readFileSync(attendanceMigration, "utf8"));
  const source = (
    await sql(
      "select s.id,e.id enrollment,a.id assignment from erp.students s join erp.enrollments e on e.student_id=s.id join erp.student_schedule_assignments a on a.enrollment_id=e.id where s.lifecycle_status='ACTIVE' and e.status='ACTIVE' and a.valid_to is null limit 1",
    )
  )[0];
  assert.ok(source, "active slot fixture source");
  await sql(
    `insert into erp.students select (jsonb_populate_record(null::erp.students,to_jsonb(s)||jsonb_build_object('id',$1::text,'code',$2::text,'creation_idempotency_key',null,'is_test_data',true,'freeze_reserved',false,'billing_paused',false,'billing_anchor_date','2026-01-04','original_first_lesson_at','2026-01-04'))).* from erp.students s where id=$3`,
    [studentId, `QA-DEADLINE-${studentId}`, source.id],
  );
  await sql(
    `insert into erp.enrollments select (jsonb_populate_record(null::erp.enrollments,to_jsonb(e)||jsonb_build_object('id',$1::text,'student_id',$2::text,'first_lesson_at','2026-01-04','start_date','2026-01-04'))).* from erp.enrollments e where id=$3`,
    [enrollmentId, studentId, source.enrollment],
  );
  await sql(
    `insert into erp.student_schedule_assignments select (jsonb_populate_record(null::erp.student_schedule_assignments,to_jsonb(a)||jsonb_build_object('id',$1::text,'enrollment_id',$2::text))).* from erp.student_schedule_assignments a where id=$3`,
    [randomUUID(), enrollmentId, source.assignment],
  );
  const invoiceIds = [randomUUID(), randomUUID(), randomUUID()];
  for (let i = 0; i < 3; i++)
    await sql(
      'insert into erp.invoices(id,student_id,enrollment_id,period_month,issue_date,due_date,amount,balance_due,status,idempotency_key,created_at,updated_at) values($1,$2,$3,$4,$5,$5,150,$6,$7::erp."InvoiceStatus",$8,now(),now())',
      [
        invoiceIds[i],
        studentId,
        enrollmentId,
        `2026-${String(7 + i).padStart(2, "0")}-01`,
        `2026-${String(7 + i).padStart(2, "0")}-04`,
        i === 1 ? 0 : 150,
        i === 1 ? "PAID" : "OPEN",
        `qa-${invoiceIds[i]}`,
      ],
    );
  const input = {
    studentId,
    requestId: randomUUID(),
    month: "2026-09",
    mode: "FROM_MONTH" as const,
    day: 20,
    reason: "Rollback deadline verification",
  };
  let preview = await previewDeadlineRule(tx, input);
  assert.equal(preview.invoices.length, 1);
  await blocked(
    () => applyDeadlineRule(tx, input, otherId, preview.fingerprint),
    /icazəniz/,
  );
  await sql(
    "update erp.invoices set updated_at=now()+interval '1 second' where id=$1",
    [invoiceIds[2]],
  );
  await blocked(
    () => applyDeadlineRule(tx, input, actorId, preview.fingerprint),
    /Məlumat dəyişib/,
  );
  preview = await previewDeadlineRule(tx, input);
  await applyDeadlineRule(tx, input, actorId, preview.fingerprint);
  assert.equal(
    (await applyDeadlineRule(tx, input, actorId, preview.fingerprint))
      .alreadySaved,
    true,
  );
  const due = async (month: string) =>
    (
      await sql("select erp.student_payment_due_date($1,$2)::text d", [
        studentId,
        month,
      ])
    )[0].d;
  assert.equal(await due("2026-08-01"), "2026-08-04");
  assert.equal(await due("2026-09-01"), "2026-09-20");
  assert.equal(await due("2026-10-01"), "2026-10-20");
  const only = {
    ...input,
    requestId: randomUUID(),
    month: "2026-08",
    mode: "ONLY_MONTH" as const,
    day: 31,
  };
  await applyDeadlineRule(
    tx,
    only,
    actorId,
    (await previewDeadlineRule(tx, only)).fingerprint,
  );
  assert.equal(await due("2026-08-01"), "2026-08-31");
  assert.equal(await due("2026-09-01"), "2026-09-20");
  assert.equal(
    (
      await sql(
        "select due_date::text,status::text,amount::text,balance_due::text from erp.invoices where id=$1",
        [invoiceIds[1]],
      )
    )[0].status,
    "PAID",
  );
  const general = { ...input, requestId: randomUUID(), day: 31 };
  await applyDeadlineRule(
    tx,
    general,
    actorId,
    (await previewDeadlineRule(tx, general)).fingerprint,
  );
  assert.equal(await due("2027-02-01"), "2027-02-28");
  assert.equal(await due("2027-03-01"), "2027-03-31");
  assert.equal(
    (
      await sql(
        "select erp.next_unfrozen_billing_date($1,'2026-10-01')::text d",
        [studentId],
      )
    )[0].d,
    "2026-10-31",
  );
  await sql("update erp.invoices set due_date='2026-09-04' where id=$1", [
    invoiceIds[2],
  ]);
  const cycle = (
    await sql(
      "select cycle_start::text,cycle_end::text,due_date::text from erp.student_billing_cycles where invoice_id=$1",
      [invoiceIds[2]],
    )
  )[0];
  assert.deepEqual(cycle, {
    cycle_start: "2026-09-04",
    cycle_end: "2026-10-03",
    due_date: "2026-09-30",
  });
  console.log(
    "PASS: effective-month/one-month deadlines, paid history, 31-day clamp, stale preview, idempotency, unauthorized account, writer protection, preserved teaching cycles",
  );
  await sql(
    "update erp.student_schedule_assignments set valid_from='2026-01-04' where enrollment_id=$1",
    [enrollmentId],
  );
  const slotsBefore = await sql(
    "select a.* from erp.student_schedule_assignments a where enrollment_id=$1",
    [enrollmentId],
  );
  await changeReservedFreeze(tx, {
    studentId,
    actorId,
    reserve: true,
    effectiveAt: new Date(today + "T00:00:00Z"),
    note: "Rollback reservation",
  });
  assert.deepEqual(
    await sql(
      "select a.* from erp.student_schedule_assignments a where enrollment_id=$1",
      [enrollmentId],
    ),
    slotsBefore,
  );
  assert.deepEqual(
    (
      await sql(
        "select lifecycle_status::text status,freeze_reserved,billing_paused,billing_anchor_date::text anchor from erp.students where id=$1",
        [studentId],
      )
    )[0],
    {
      status: "FROZEN",
      freeze_reserved: true,
      billing_paused: false,
      anchor: "2026-01-04",
    },
  );
  assert.equal(
    (
      await sql("select erp.student_is_billable_on_date($1,$2) billable", [
        studentId,
        today,
      ])
    )[0].billable,
    true,
  );
  await blocked(
    () =>
      buildFreezePreview(
        tx,
        {
          studentId,
          requestId: randomUUID(),
          startDate: today,
          endDate: "",
          note: "Conflicting ordinary freeze",
        },
        {} as never,
      ).then(() => {}),
    /ilk dərs/,
  );
  await blocked(
    async () =>
      buildFreezePreview(
        tx,
        {
          studentId,
          requestId: randomUUID(),
          startDate: today,
          endDate: "",
          note: "Conflicting ordinary freeze",
        },
        await loadFreezeStudent(tx, studentId),
      ),
    /ödənişli yer rezervi/,
  );
  // Test the recurring job without writing invoices for any other real student.
  const slot = (
    await sql(
      "select cs.id,cs.teacher_id from erp.class_slots cs join erp.student_schedule_assignments a on a.slot_id=cs.id where a.enrollment_id=$1 limit 1",
      [enrollmentId],
    )
  )[0];
  await sql(
    "insert into erp.slot_sessions(id,slot_id,session_date,start_time,end_time,status,created_at,updated_at) values(gen_random_uuid(),$1,$2,'10:00','12:00','SCHEDULED',now(),now()) on conflict(slot_id,session_date) do nothing",
    [slot.id, today],
  );
  const lesson = (
    await sql(
      "select id from erp.slot_sessions where slot_id=$1 and session_date=$2",
      [slot.id, today],
    )
  )[0];
  const attendanceSql =
    "insert into erp.attendance_records(id,session_id,enrollment_id,teacher_id,status,source,marked_at,updated_at) values(gen_random_uuid(),$1,$2,$3,'ABSENT',$4::erp.\"AttendanceCaptureSource\",now(),now()) returning id";
  assert.equal(
    (
      await sql(attendanceSql, [
        lesson.id,
        enrollmentId,
        slot.teacher_id,
        "AUTOMATIC",
      ])
    ).length,
    0,
  );
  await blocked(
    () =>
      sql(attendanceSql, [lesson.id, enrollmentId, slot.teacher_id, "MANUAL"]),
    /Rezervli dondurma/,
  );
  assert.equal(
    (await getReservedAttendanceKeys(tx, [lesson.id], [enrollmentId])).has(
      `${lesson.id}:${enrollmentId}`,
    ),
    true,
  );
  console.log(
    "PASS: automatic absences skipped, manual attendance blocked, mobile/finalizer eligibility keys exclude reserved lessons",
  );
  await sql("savepoint recurring_test");
  const futureMonth = "2027-03-01";
  await sql("update erp.students set is_test_data=true where not is_test_data");
  await sql("update erp.students set is_test_data=false where id=$1", [
    studentId,
  ]);
  await sql("select erp.materialize_due_student_invoices('2027-03-31')");
  assert.equal(
    (
      await sql(
        "select due_date::text from erp.invoices where student_id=$1 and period_month=$2 and status<>'VOID'",
        [studentId, futureMonth],
      )
    )[0].due_date,
    "2027-03-31",
  );
  await sql("rollback to savepoint recurring_test");
  await changeReservedFreeze(tx, {
    studentId,
    actorId,
    reserve: false,
    effectiveAt: new Date(today + "T00:00:00Z"),
    note: "Rollback return",
  });
  assert.deepEqual(
    await sql(
      "select a.* from erp.student_schedule_assignments a where enrollment_id=$1",
      [enrollmentId],
    ),
    slotsBefore,
  );
  assert.equal(
    (
      await sql(
        "select lifecycle_status::text status from erp.students where id=$1",
        [studentId],
      )
    )[0].status,
    "ACTIVE",
  );
  console.log(
    "PASS: reserved freeze keeps slots, bills monthly, is not ACTIVE, blocks free-freeze overlap; return preserves the same slots",
  );
  await sql("savepoint denied_role");
  await sql("set local role authenticated");
  await assert.rejects(
    sql("select * from erp.student_due_date_rules"),
    /permission denied/,
  );
  await sql("rollback to savepoint denied_role");
  await sql("rollback");
  assert.deepEqual(await fingerprints(), before);
  console.log(
    "PASS: private-table access denied; rollback complete; all production fingerprints unchanged",
  );
} finally {
  await client.query("rollback").catch(() => {});
  await client.end();
}
