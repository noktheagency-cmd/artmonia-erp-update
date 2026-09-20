// Isolated, synthetic PGlite database only. Never reads DATABASE_URL or a shared DB.
// Run: node --import tsx scripts/verify-firca-local.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { load as loadYaml } from "js-yaml";
import Ajv from "ajv";

registerHooks({
  resolve(specifier, context, next) {
    return specifier === "server-only"
      ? { url: "data:text/javascript,export{}", shortCircuit: true }
      : next(specifier, context);
  },
});
const pg = new PGlite();
let assertions = 0;
const check = (actual, expected, label) => {
  assert.deepEqual(actual, expected, label);
  assertions++;
};
const query = async (strings, ...values) => {
  const sql = Array.isArray(strings)
    ? strings.reduce(
        (text, part, index) => text + (index ? "$" + index : "") + part,
        "",
      )
    : strings.text;
  return (await pg.query(sql, Array.isArray(strings) ? values : strings.values))
    .rows;
};
const audit = [];
const db = {
  $queryRaw: async (strings, ...values) => {
    const sql = Array.isArray(strings) ? strings.join("?") : strings.text;
    // PGlite accepts void results, but Prisma cannot deserialize them.
    assert.doesNotMatch(sql, /select\s+pg_advisory_xact_lock/i,
      "Use executeRaw for void-returning transaction locks");
    return query(strings, ...values);
  },
  $executeRaw: query,
  auditLog: {
    create: async (entry) => {
      audit.push(entry);
    },
  },
  studentMobileAccount: {
    findUnique: async ({ where }) =>
      (
        await pg.query(
          'select student_id as "studentId" from erp.student_mobile_accounts where auth_user_id=$1',
          [where.authUserId],
        )
      ).rows[0] ?? null,
  },
};
globalThis.prisma = db;
const {
  applyCommentEvent,
  getFircaSummary,
  getFircaLeaderboard,
  getFircaHistory,
  setBalance,
} = await import("../src/modules/firca/service.ts");
const { reviewHomework } = await import("../src/modules/firca/homework.ts");
const transact = async (fn) => {
  await pg.exec("begin");
  try {
    const result = await fn();
    await pg.exec("commit");
    return result;
  } catch (error) {
    await pg.exec("rollback");
    throw error;
  }
};
try {
  await pg.exec(`create role anon; create role authenticated; create schema erp;
    create table erp.users(id uuid primary key);
    create table erp.contacts(id uuid primary key,full_name text);
    create table erp.students(id uuid primary key,code text,lifecycle_status text,contact_id uuid,is_test_data boolean default false);
    create table erp.student_mobile_accounts(student_id uuid primary key,auth_user_id uuid unique,status text);
    create table erp.teachers(id uuid primary key,user_id uuid);
    create table erp.enrollments(id uuid primary key,student_id uuid,teacher_id uuid,status text);
    create table erp.class_slots(id uuid primary key,teacher_id uuid);
    create table erp.slot_sessions(id uuid primary key,slot_id uuid,session_date date,status text);
    create table erp.attendance_records(id uuid primary key,session_id uuid,enrollment_id uuid,status text);
    create table erp.lesson_homeworks(id uuid primary key,session_id uuid,title text);
    create type erp.legacy_track as enum('H','HB','B','2B');
    create table erp.program_lesson_materials(id uuid primary key,topic_id uuid,track erp.legacy_track not null,
      constraint program_lesson_materials_topic_track_key unique(topic_id,track));`);
  const legacyTopic = randomUUID();
  await pg.query(
    "insert into erp.program_lesson_materials values($1,$3,'HB'),($2,$3,'H')",
    [randomUUID(), randomUUID(), legacyTopic],
  );
  const migration = await readFile(
    new URL(
      "../prisma/migrations/20260920121102_firca_v1_dynamic_journey/migration.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const mirror = await readFile(
    new URL(
      "../supabase/migrations/20260920121102_firca_v1_dynamic_journey.sql",
      import.meta.url,
    ),
    "utf8",
  );
  check(migration, mirror, "migration mirrors must match");
  await pg.exec(migration);
  const followup = await readFile(new URL('../prisma/migrations/20260920124825_firca_test_eligibility/migration.sql', import.meta.url), 'utf8');
  check(followup, await readFile(new URL('../supabase/migrations/20260920124825_firca_test_eligibility.sql', import.meta.url), 'utf8'), 'follow-up mirror');
  await pg.exec(followup);
  check(
    (
      await pg.query(
        "select track::text,sequence from erp.program_lesson_materials order by sequence",
      )
    ).rows,
    [
      { track: "H", sequence: 1 },
      { track: "HB", sequence: 2 },
    ],
    "legacy content ordering is preserved",
  );
  const student = randomUUID(),
    otherStudent = randomUUID(),
    auth = randomUUID(),
    otherAuth = randomUUID();
  const actorId = randomUUID(),
    teacher = randomUUID(),
    slot = randomUUID(),
    enrollment = randomUUID(),
    lesson = randomUUID(),
    attendance = randomUUID();
  const contact = randomUUID(),
    contact2 = randomUUID();
  await pg.query("insert into erp.users values($1)", [actorId]);
  await pg.query(
    "insert into erp.contacts values($1,'Synthetic A'),($2,'Synthetic B')",
    [contact, contact2],
  );
  await pg.query(
    "insert into erp.students(id,code,lifecycle_status,contact_id) values($1,'SYN-A','ACTIVE',$3),($2,'SYN-B','ACTIVE',$4)",
    [student, otherStudent, contact, contact2],
  );
  await pg.query(
    "insert into erp.student_mobile_accounts values($1,$3,'ACTIVE'),($2,$4,'ACTIVE')",
    [student, otherStudent, auth, otherAuth],
  );
  await pg.query("insert into erp.teachers values($1,$2)", [teacher, actorId]);
  await pg.query("insert into erp.class_slots values($1,$2)", [slot, teacher]);
  await pg.query("insert into erp.enrollments values($1,$2,$3,'ACTIVE')", [
    enrollment,
    student,
    teacher,
  ]);
  await pg.query(
    "insert into erp.slot_sessions values($1,$2,current_date,'SCHEDULED')",
    [lesson, slot],
  );
  await pg.query(
    "insert into erp.attendance_records values($1,$2,$3,'PRESENT')",
    [attendance, lesson, enrollment],
  );
  check((await getFircaSummary(student)).lifetime, 0, "disabled by default");
  await pg.exec(
    "update erp.firca_settings set enabled=true,starts_at=clock_timestamp()+interval '1 hour'",
  );
  await pg.query(
    "update erp.attendance_records set status='PRESENT' where id=$1",
    [attendance],
  );
  check(
    (await getFircaSummary(student)).lifetime,
    0,
    "future start cannot grant",
  );
  await pg.exec(
    "update erp.firca_settings set starts_at=clock_timestamp()-interval '1 day'",
  );
  await pg.query(
    "update erp.attendance_records set status='PRESENT' where id=$1",
    [attendance],
  );
  check((await getFircaSummary(student)).lifetime, 20, "attendance grant");
  await pg.query(
    "update erp.attendance_records set status='PRESENT' where id=$1",
    [attendance],
  );
  check(
    (await getFircaHistory(student)).items.length,
    1,
    "repeat is idempotent",
  );
  await pg.query(
    "update erp.attendance_records set status='ABSENT' where id=$1",
    [attendance],
  );
  check((await getFircaSummary(student)).lifetime, 0, "absence reverses");
  await pg.query(
    "update erp.attendance_records set status='PRESENT' where id=$1",
    [attendance],
  );
  check(
    (await getFircaSummary(student)).lifetime,
    20,
    "restores original points",
  );
  const enrollment2 = randomUUID();
  await pg.query("insert into erp.enrollments values($1,$2,$3,'ACTIVE')", [
    enrollment2,
    student,
    teacher,
  ]);
  await pg.query(
    "insert into erp.attendance_records values($1,$2,$3,'PRESENT')",
    [randomUUID(), lesson, enrollment2],
  );
  check(
    (await getFircaSummary(student)).lifetime,
    20,
    "same lesson through another enrollment cannot double grant",
  );
  await pg.query(
    "update erp.slot_sessions set status='CANCELLED' where id=$1",
    [lesson],
  );
  check(
    (await getFircaSummary(student)).lifetime,
    0,
    "cancel reverses attendance",
  );
  await pg.query(
    "update erp.slot_sessions set status='SCHEDULED' where id=$1",
    [lesson],
  );
  check(
    (await getFircaSummary(student)).lifetime,
    20,
    "uncancel restores attendance",
  );
  await assert.rejects(
    pg.exec("update erp.firca_ledger set reason='overwrite'"),
    /IMMUTABLE/,
  );
  assertions++;
  await assert.rejects(pg.exec("delete from erp.firca_ledger"), /IMMUTABLE/);
  assertions++;
  const homework = randomUUID(),
    submission = randomUUID();
  await pg.query(
    "insert into erp.lesson_homeworks values($1,$2,'Synthetic homework')",
    [homework, lesson],
  );
  await pg.query(
    "insert into erp.homework_submissions(id,student_id,homework_id,session_id,request_key,object_path,file_name,content_type,file_size) values($1,$2,$3,$4,$5,'synthetic','test.png','image/png',10)",
    [submission, student, homework, lesson, randomUUID()],
  );
  const actor = {
    id: actorId,
    permissions: new Map([["attendance.manage", "ASSIGNED"]]),
  };
  await assert.rejects(
    transact(() =>
      reviewHomework(
        db,
        { id: randomUUID(), permissions: actor.permissions },
        { id: submission, revision: 1, status: "accepted", reason: "Yaxşı iş" },
      ),
    ),
    /tapılmadı/,
  );
  assertions++;
  await assert.rejects(
    transact(() =>
      reviewHomework(
        db,
        { id: actorId, permissions: new Map() },
        { id: submission, revision: 1, status: "accepted", reason: "Yaxşı iş" },
      ),
    ),
    /tapılmadı/,
  );
  assertions++;
  await transact(() =>
    reviewHomework(db, actor, {
      id: submission,
      revision: 1,
      status: "accepted",
      reason: "Yaxşı iş",
    }),
  );
  check(
    (await getFircaSummary(student)).lifetime,
    40,
    "teacher acceptance +20",
  );
  await pg.query("update erp.slot_sessions set status='CANCELLED' where id=$1", [lesson]);
  check((await getFircaSummary(student)).lifetime, 0, 'cancellation reverses homework and attendance');
  await pg.query("update erp.slot_sessions set status='SCHEDULED' where id=$1", [lesson]);
  check((await getFircaSummary(student)).lifetime, 40, 'uncancellation restores both sources');
  check(
    await transact(() =>
      reviewHomework(db, actor, {
        id: submission,
        revision: 1,
        status: "accepted",
        reason: "Yaxşı iş",
      }),
    ),
    { repeated: true },
    "review retry",
  );
  await assert.rejects(
    transact(() =>
      reviewHomework(db, actor, {
        id: submission,
        revision: 1,
        status: "rejected",
        reason: "Düzəlt",
      }),
    ),
    /dəyişib/,
  );
  assertions++;
  await transact(() =>
    reviewHomework(db, actor, {
      id: submission,
      revision: 2,
      status: "rejected",
      reason: "Düzəlt",
    }),
  );
  check(
    (await getFircaSummary(student)).lifetime,
    20,
    "rejection reverses +20",
  );
  const comment = (index) => ({
    commentId: randomUUID(),
    postId: randomUUID(),
    authorAuthUserId: auth,
    postAuthorAuthUserId: otherAuth,
    parentId: null,
    body: "Rənglər və kompozisiya haqqında faydalı rəy " + index,
    revision: 1,
    deleted: false,
    approved: true,
    createdAt: new Date().toISOString(),
  });
  const first = comment(1);
  check(
    (await transact(() => applyCommentEvent(db, first))).delta,
    5,
    "eligible comment",
  );
  check(
    (await transact(() => applyCommentEvent(db, first))).status,
    "duplicate",
    "event retry",
  );
  await assert.rejects(
    transact(() => applyCommentEvent(db, { ...first, body: "changed" })),
    /versiyada/,
  );
  assertions++;
  check(
    (
      await transact(() =>
        applyCommentEvent(db, { ...comment(2), postId: first.postId }),
      )
    ).delta,
    0,
    "same post limit",
  );
  check((await transact(() => applyCommentEvent(db,{...first,revision:2,approved:false}))).delta,-5,'hidden reverses a published award');
  check((await transact(() => applyCommentEvent(db,{...first,revision:3,approved:true}))).delta,5,'republishing restores the same award');
  check(
    (
      await transact(() =>
        applyCommentEvent(db, { ...comment(3), body: first.body }),
      )
    ).delta,
    0,
    "duplicate text",
  );
  for (const index of [4, 5, 6])
    check(
      (await transact(() => applyCommentEvent(db, comment(index)))).delta,
      5,
      "weekly accepted comment",
    );
  check(
    (await transact(() => applyCommentEvent(db, comment(7)))).delta,
    0,
    "fifth qualifying comment blocked",
  );
  check(
    (await getFircaSummary(student)).lifetime,
    40,
    "weekly comments cap 20",
  );
  check(
    (
      await transact(() =>
        applyCommentEvent(db, { ...first, revision: 4, approved: false, deleted: true }),
      )
    ).delta,
    -5,
    "deletion reverses",
  );
  check(
    (await transact(() => applyCommentEvent(db, { ...first, revision: 5 })))
      .delta,
    5,
    "restore does not use another slot",
  );
  const tombstone = { ...comment(8), revision: 2, deleted: true };
  await transact(() => applyCommentEvent(db, tombstone));
  check(
    (
      await transact(() =>
        applyCommentEvent(db, { ...tombstone, revision: 1, deleted: false }),
      )
    ).status,
    "stale",
    "out-of-order create cannot revive deletion",
  );
  await pg.query("update erp.firca_comments set moderated=true where id=$1", [
    first.commentId,
  ]);
  check(
    (await transact(() => applyCommentEvent(db, { ...first, revision: 6 })))
      .delta,
    -5,
    "moderated comment cannot earn",
  );
  const leaderboard = await getFircaLeaderboard(student);
  check(leaderboard.top[0].points, 35, "leaderboard uses raw points");
  check(leaderboard.me.rank, 1, "own rank");
  const validator = new Ajv({allErrors:true,unknownFormats:'ignore'});
  for (const name of ['mobile-student-portal-openapi.yaml','mobile-firca-v1-openapi.yaml']) {
    validator.addSchema(loadYaml(await readFile(new URL('../docs/'+name, import.meta.url), 'utf8')), name);
  }
  for (const [schema, payload] of [['Firca',await getFircaSummary(student)],['LeaderboardEntry',leaderboard.me]]) {
    const validate = validator.compile({$ref:'mobile-firca-v1-openapi.yaml#/components/schemas/'+schema});
    check(validate(payload), true, 'OpenAPI '+schema+': '+validator.errorsText(validate.errors));
  }
  check((await Promise.all(Array.from({length:12},()=>setBalance(db,student,'attendance',lesson,20,'Duplicate retry')))).reduce((a,b)=>a+b,0),0,'queued duplicate deliveries do not grant twice');
  const ownCursor = (await getFircaHistory(student)).items[0].id;
  check((await getFircaHistory(otherStudent,ownCursor)).items, [], 'another student cursor cannot expose history');
  await pg.query(
    "insert into erp.firca_exclusions values($1,'Synthetic exclusion',now())",
    [student],
  );
  check(
    (await getFircaLeaderboard(student)).me,
    null,
    "excluded student not ranked",
  );
  await pg.query('update erp.students set is_test_data=true where id=$1', [otherStudent]);
  check((await getFircaLeaderboard(otherStudent)).me, null, 'ERP test flag excludes even newly flagged students');
  check(
    (await getFircaSummary(student)).lifetime,
    35,
    "exclusion does not erase history",
  );
  await pg.exec("set role authenticated");
  await assert.rejects(
    pg.exec("select * from erp.firca_ledger"),
    /permission denied/,
  );
  assertions++;
  await pg.exec("reset role");
  console.log(
    "PASS: " +
      assertions +
      " isolated migration/domain assertions; audit entries: " +
      audit.length +
      ". No external database accessed.",
  );
} finally {
  await pg.close();
}
