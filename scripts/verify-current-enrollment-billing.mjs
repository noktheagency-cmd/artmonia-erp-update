// Synthetic scheduler regression; uses temporary tables and always rolls back.
import assert from "node:assert/strict";
export async function verifyCurrentEnrollmentBilling(client, migrationSql) {
  await client.query("begin");
  try {
    await client.query(`
      create temporary table billing_test_students(id uuid primary key,code text,lifecycle_status erp."StudentLifecycleStatus",billing_paused boolean,is_test_data boolean,billing_anchor_date date,billable boolean,due_day int) on commit drop;
      create temporary table billing_test_enrollments(id uuid primary key,student_id uuid,status erp."EnrollmentStatus",start_date date,monthly_fee numeric,billing_fee numeric) on commit drop;
      create temporary table billing_test_invoices(id uuid primary key,student_id uuid,enrollment_id uuid,period_month date,issue_date date,due_date date,amount numeric,balance_due numeric,status erp."InvoiceStatus",idempotency_key text unique,created_at timestamp,updated_at timestamp) on commit drop;
      create unique index billing_test_unique_invoice on billing_test_invoices(student_id,enrollment_id,period_month) where enrollment_id is not null and status<>'VOID'::erp."InvoiceStatus";
      create temporary table billing_test_audits(id uuid,action text,entity_type text,entity_id uuid,after_json jsonb,reason text,created_at timestamp) on commit drop;
      insert into billing_test_students values
        ('10000000-0000-4000-8000-000000000001','SYNTH-A','ACTIVE',false,false,'2026-09-01',true,4),
        ('10000000-0000-4000-8000-000000000002','SYNTH-FUTURE','ACTIVE',false,false,'2026-09-01',true,4),
        ('10000000-0000-4000-8000-000000000003','SYNTH-FROZEN','FROZEN',false,false,'2026-09-01',false,4),
        ('10000000-0000-4000-8000-000000000004','SYNTH-RESERVED','FROZEN',false,false,'2026-09-01',true,4),
        ('10000000-0000-4000-8000-000000000005','SYNTH-STOPPED','STOPPED',true,false,'2026-09-01',true,4);
      insert into billing_test_enrollments values
        ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','ACTIVE','2026-10-04',150,79),
        ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','PAUSED','2026-09-01',150,150),
        ('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002','ACTIVE','2026-11-01',150,150),
        ('20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000003','ACTIVE','2026-09-01',150,150),
        ('20000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000004','ACTIVE','2026-09-01',60,60),
        ('20000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000005','ACTIVE','2026-09-01',150,150);
      create function pg_temp.billing_test_fee(target uuid,month_date date) returns numeric language sql as 'select billing_fee from pg_temp.billing_test_enrollments where id=target';
      create function pg_temp.billing_test_due(target uuid,month_date date) returns date language sql as 'select make_date(extract(year from month_date)::int,extract(month from month_date)::int,due_day) from pg_temp.billing_test_students where id=target';
      create function pg_temp.billing_test_anchor(anchor date,month_date date) returns date language sql as 'select month_date';
      create function pg_temp.billing_test_billable(target uuid,target_date date) returns boolean language sql as 'select billable and (code<>''SYNTH-A'' or target_date>=date ''2026-10-04'') from pg_temp.billing_test_students where id=target';
    `);
    let sql = migrationSql;
    for (const [original,replacement] of Object.entries({
      "erp.materialize_due_student_invoices":"pg_temp.billing_test_materialize",
      "erp.students":"pg_temp.billing_test_students", "erp.enrollments":"pg_temp.billing_test_enrollments",
      "erp.invoices":"pg_temp.billing_test_invoices", "erp.audit_logs":"pg_temp.billing_test_audits",
      "erp.enrollment_billing_amount":"pg_temp.billing_test_fee", "erp.student_payment_due_date":"pg_temp.billing_test_due",
      "erp.billing_date_for_month":"pg_temp.billing_test_anchor", "erp.student_is_billable_on_date":"pg_temp.billing_test_billable",
    })) sql=sql.replaceAll(original,replacement);
    await client.query(sql);
    assert.equal((await client.query("select pg_temp.billing_test_materialize('2026-10-25') count")).rows[0].count,2);
    const rows=(await client.query("select student_id,amount::text,due_date::text from pg_temp.billing_test_invoices order by student_id")).rows;
    assert.equal(JSON.stringify(rows.map(r=>[r.student_id,r.amount,r.due_date])),JSON.stringify([
      ["10000000-0000-4000-8000-000000000001","79","2026-10-04"],
      ["10000000-0000-4000-8000-000000000004","60","2026-10-04"],
    ]));
    assert.equal((await client.query("select pg_temp.billing_test_materialize('2026-10-25') count")).rows[0].count,0);
    assert.equal((await client.query("select count(*)::int count from pg_temp.billing_test_audits")).rows[0].count,2);
    return { passed:true, syntheticInvoices:2, replayCreated:0 };
  } finally { await client.query("rollback"); }
}
