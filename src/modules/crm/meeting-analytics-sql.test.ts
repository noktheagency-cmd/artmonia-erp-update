import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "pg";
import { Prisma } from "@/generated/prisma/client";
import { meetingAnalyticsSql } from "./meeting-analytics-sql";

test("meeting analytics include old leads, Baku midnight, outcomes and assigned scope",{skip:process.env.RUN_CASE_SQL_DB_TESTS!=="1"},async()=>{
  const client=new Client({connectionString:process.env.DATABASE_URL}); await client.connect();
  try {
    await client.query("begin");
    await client.query(`
      create temporary table meeting_test_leads(id uuid,manager_id uuid,stage text,converted_student_id uuid,next_action_type text,next_follow_up_at timestamptz,created_at timestamptz) on commit drop;
      create temporary table meeting_test_appointments(id uuid,lead_id uuid,teacher_id uuid,kind text,outcome text,planned_at timestamptz) on commit drop;
      create temporary table meeting_test_sales(lead_id uuid,student_id uuid,qualified_at date,cancelled_at timestamptz) on commit drop;
      create temporary table meeting_test_teachers(id uuid,full_name text) on commit drop;
      create temporary table meeting_test_students(id uuid,is_test_data boolean) on commit drop;
      insert into meeting_test_leads values
        ('10000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001','TRIAL_LESSON',null,null,null,'2026-09-01'),
        ('10000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000001','LOST',null,null,null,'2026-09-01'),
        ('10000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-000000000001','NEW',null,'TRIAL_LESSON_REMINDER','2026-11-05','2026-09-01'),
        ('10000000-0000-4000-8000-000000000004','90000000-0000-4000-8000-000000000001','REGISTERED','30000000-0000-4000-8000-000000000001',null,null,'2026-09-01'),
        ('10000000-0000-4000-8000-000000000005','90000000-0000-4000-8000-000000000002','NEW',null,'TRIAL_LESSON_REMINDER','2026-10-10','2026-09-01'),
        ('10000000-0000-4000-8000-000000000006','90000000-0000-4000-8000-000000000001','LOST',null,null,null,'2026-09-01');
      insert into meeting_test_teachers values('40000000-0000-4000-8000-000000000001','Synthetic teacher');
      insert into meeting_test_students values('30000000-0000-4000-8000-000000000001',false);
      insert into meeting_test_appointments values
        ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','TRIAL','SCHEDULED','2026-10-01T00:15:00+04:00'),
        ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000001','TRIAL','NO_SHOW','2026-10-06'),
        ('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000004','40000000-0000-4000-8000-000000000001','TRIAL','ATTENDED','2026-10-05'),
        ('20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','TRIAL','SCHEDULED','2026-09-10'),
        ('20000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000006','40000000-0000-4000-8000-000000000001','TRIAL','ATTENDED','2026-10-09');
      insert into meeting_test_sales values('10000000-0000-4000-8000-000000000004','30000000-0000-4000-8000-000000000001','2026-10-08',null);
    `);
    const fragment=meetingAnalyticsSql(Prisma.sql`l.manager_id=${"90000000-0000-4000-8000-000000000001"}::uuid`,new Date("2026-10-01"),new Date("2026-11-01"),new Date("2026-10-25"));
    let sql=fragment.text;
    for(const [source,target] of Object.entries({"erp.leads":"pg_temp.meeting_test_leads","erp.crm_appointments":"pg_temp.meeting_test_appointments","erp.course_sales":"pg_temp.meeting_test_sales","erp.teachers":"pg_temp.meeting_test_teachers","erp.students":"pg_temp.meeting_test_students"})) sql=sql.replaceAll(source,target);
    const data=(await client.query(`select ${sql} data`,fragment.values)).rows[0].data;
    assert.equal(data.scheduled,4);assert.equal(data.attended,2);assert.equal(data.noShow,1);
    assert.equal(data.pending,3);assert.equal(data.overdue,2);
    assert.equal(data.teachers.length,1);assert.equal(data.teachers[0].successful,1);assert.equal(data.teachers[0].unsuccessful,1);
  } finally {await client.query("rollback");await client.end();}
});
