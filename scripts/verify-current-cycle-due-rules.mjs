import assert from "node:assert/strict";
export async function verifyCurrentCycleDueRules(client,sql) {
  await client.query("begin");
  try {
    await client.query(`
      create temporary table due_test_students(id uuid,billing_anchor_date date) on commit drop;
      create temporary table due_test_rules(student_id uuid,effective_month date,mode text,due_day int,version bigint) on commit drop;
      insert into due_test_students values('10000000-0000-4000-8000-000000000001','2026-10-04'),('10000000-0000-4000-8000-000000000002','2026-08-11');
      insert into due_test_rules values
        ('10000000-0000-4000-8000-000000000001','2026-09-01','FROM_MONTH',27,1),
        ('10000000-0000-4000-8000-000000000001','2026-11-01','ONLY_MONTH',20,2),
        ('10000000-0000-4000-8000-000000000002','2026-09-01','FROM_MONTH',31,3);
    `);
    const scoped=sql.replaceAll("erp.student_payment_due_date","pg_temp.due_test_date").replaceAll("erp.students","pg_temp.due_test_students").replaceAll("erp.student_due_date_rules","pg_temp.due_test_rules");
    await client.query(scoped);
    for(const [id,month,expected] of [
      ["10000000-0000-4000-8000-000000000001","2026-09-01","2026-09-27"],
      ["10000000-0000-4000-8000-000000000001","2026-10-01","2026-10-04"],
      ["10000000-0000-4000-8000-000000000001","2026-11-01","2026-11-20"],
      ["10000000-0000-4000-8000-000000000001","2026-12-01","2026-12-04"],
      ["10000000-0000-4000-8000-000000000002","2026-10-01","2026-10-31"],
      ["10000000-0000-4000-8000-000000000002","2027-02-01","2027-02-28"],
    ]) assert.equal((await client.query("select pg_temp.due_test_date($1::uuid,$2::date)::text value",[id,month])).rows[0].value,expected);
    return {passed:true,dateBoundaries:6};
  } finally {await client.query("rollback");}
}
