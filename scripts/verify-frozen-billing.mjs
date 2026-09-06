import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { config } from 'dotenv';
import pg from 'pg';

config({ path: '.env.local', quiet: true });
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const fingerprint = async (table) => (await client.query(
  `select md5(coalesce(string_agg(to_jsonb(t)::text, '' order by id),'')) as hash from erp.${table} t`,
)).rows[0].hash;
try {
  await client.query('begin');
  const before = {
    payments: await fingerprint('payments'),
    allocations: await fingerprint('payment_allocations'),
    invoices: (await client.query('select id,to_jsonb(i) data from erp.invoices i')).rows,
  };
  await client.query(readFileSync('supabase/migrations/20260906153907_reconcile_frozen_billing_history.sql', 'utf8'));
  const after = (await client.query('select id,to_jsonb(i) data from erp.invoices i')).rows;
  const changed = after.filter((row) => JSON.stringify(row.data) !== JSON.stringify(before.invoices.find((old) => old.id === row.id)?.data));
  assert.ok(changed.length === 0 || changed.length === 2);
  assert.ok(changed.every((row) => row.data.status === 'VOID' && row.data.balance_due === 0));
  assert.equal(await fingerprint('payments'), before.payments);
  assert.equal(await fingerprint('payment_allocations'), before.allocations);
  const target = (await client.query(`select s.id,s.lifecycle_status,s.billing_paused,e.id enrollment_id
    from erp.students s join erp.enrollments e on e.student_id=s.id where s.code='ART-2292'`)).rows[0];
  assert.equal(target.lifecycle_status,'ACTIVE');
  assert.equal(target.billing_paused,false);
  const slots = (await client.query('select count(*)::int n from erp.student_schedule_assignments where enrollment_id=$1 and valid_to is null', [target.enrollment_id])).rows[0];
  assert.equal(slots.n,2);
  // Replaying the deploy migration must not repeat repairs or restore duplicate slots.
  await client.query(readFileSync('supabase/migrations/20260906153907_reconcile_frozen_billing_history.sql', 'utf8'));
  assert.equal((await client.query('select count(*)::int n from erp.student_schedule_assignments where enrollment_id=$1 and valid_to is null',[target.enrollment_id])).rows[0].n,2);
  console.log('PASS: only two invoices changed; payments preserved; Minaye ACTIVE; two original slots restored; replay idempotent');

  // The database must reject automatic recreation of an already frozen August cycle.
  await client.query('savepoint blocked_invoice');
  let blocked = false;
  try {
    await client.query(`insert into erp.invoices(id,student_id,enrollment_id,period_month,issue_date,due_date,amount,balance_due,status,idempotency_key,created_at,updated_at)
      values(gen_random_uuid(),$1,$2,'2026-08-01','2026-08-15','2026-08-15',150,150,'OPEN','billing-auto-freeze-regression',now(),now())`,[target.id,target.enrollment_id]);
  } catch (error) { blocked = /automatically bill a frozen cycle/.test(error.message); }
  await client.query('rollback to savepoint blocked_invoice');
  assert.ok(blocked);

  // An invoice created before a backdated freeze is cancelled when history is inserted.
  const fixture = (await client.query(`insert into erp.invoices(id,student_id,enrollment_id,period_month,issue_date,due_date,amount,balance_due,status,idempotency_key,created_at,updated_at)
    values(gen_random_uuid(),$1,$2,'2026-10-01','2026-10-15','2026-10-15',150,150,'OPEN','billing-auto-freeze-october-regression',now(),now()) returning id`,[target.id,target.enrollment_id])).rows[0];
  await client.query(`insert into erp.student_status_history(id,student_id,old_status,new_status,effective_at,reason,created_at)
    values(gen_random_uuid(),$1,'ACTIVE','FROZEN','2026-10-15','Rollback-only regression fixture',now())`,[target.id]);
  assert.equal((await client.query('select status from erp.invoices where id=$1',[fixture.id])).rows[0].status,'VOID');
  // Paid September remains PAID; the new historical freeze records a review instead.
  await client.query(`insert into erp.student_status_history(id,student_id,old_status,new_status,effective_at,reason,created_at)
    values(gen_random_uuid(),$1,'ACTIVE','FROZEN','2026-09-15','Rollback-only paid regression fixture',now())`,[target.id]);
  assert.equal((await client.query(`select status from erp.invoices where student_id=$1 and period_month='2026-09-01' and status<>'VOID'`,[target.id])).rows[0].status,'PAID');
  assert.equal(await fingerprint('payments'), before.payments);
  assert.equal(await fingerprint('payment_allocations'), before.allocations);
  console.log('PASS: frozen invoice recreation rejected; backdated freeze cancels unpaid invoice; paid invoice preserved');
} finally {
  await client.query('rollback');
  await client.end();
  console.log('ROLLBACK: no verification fixtures persisted');
}
