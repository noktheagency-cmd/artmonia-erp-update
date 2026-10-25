import assert from "node:assert/strict";

/** Temporary synthetic fixtures only; never updates ERP students or ledger rows. */
export async function verifyNextPaymentDeadlines(client, { dueRuleSql, nextDateSql }) {
  await client.query("begin");
  try {
    await client.query(`
      create temporary table deadline_students(id uuid,billing_anchor_date date) on commit drop;
      create temporary table deadline_rules(student_id uuid,effective_month date,mode text,due_day int,version bigint) on commit drop;
      create temporary table deadline_freezes(student_id uuid,start_date date,end_date date) on commit drop;
    `);
    const scope = sql => sql
      .replaceAll("erp.next_unfrozen_billing_date", "pg_temp.next_deadline")
      .replaceAll("erp.student_payment_due_date", "pg_temp.payment_deadline")
      .replaceAll("erp.students", "pg_temp.deadline_students")
      .replaceAll("erp.student_due_date_rules", "pg_temp.deadline_rules")
      .replaceAll("erp.student_freeze_periods", "pg_temp.deadline_freezes");
    await client.query(scope(dueRuleSql));
    await client.query(scope(nextDateSql));
    const id = "10000000-0000-4000-8000-000000000001";
    const setAnchor = async date => {
      await client.query("delete from deadline_students; delete from deadline_rules; delete from deadline_freezes");
      await client.query("insert into deadline_students values($1,$2)", [id,date]);
    };
    let assertions = 0;
    const expect = async (month, expected) => {
      const row = (await client.query("select pg_temp.next_deadline($1,$2)::text value", [id,month])).rows[0];
      assert.equal(row.value, expected);
      assertions++;
    };
    // No pending invoice: the next displayed date must use the manual due rule.
    await setAnchor("2025-09-16");
    await client.query("insert into deadline_rules values($1,'2026-09-01','FROM_MONTH',10,1)",[id]);
    await expect("2026-11-01", "2026-11-10");
    // A future rule must not change October, and a one-month repair must not
    // replace the November rule. Neither operation creates a second invoice.
    await setAnchor("2026-09-27");
    await client.query("insert into deadline_rules values($1,'2026-11-01','FROM_MONTH',15,1),($1,'2026-10-01','ONLY_MONTH',3,2)",[id]);
    await expect("2026-10-01", "2026-10-03");
    await expect("2026-11-01", "2026-11-15");
    await expect("2026-12-01", "2026-12-15");
    // Owner cases 18–25, represented with synthetic profiles.
    for (const [anchor, month, expected] of [
      ["2026-10-09","2026-11-01","2026-11-09"],
      ["2026-09-05","2026-10-01","2026-10-05"],
      ["2026-08-01","2026-10-01","2026-10-01"],
      ["2026-09-29","2026-10-01","2026-10-29"],
      ["2026-09-07","2026-11-01","2026-11-07"],
      ["2026-09-09","2026-10-01","2026-10-09"],
    ]) { await setAnchor(anchor); await expect(month,expected); }
    await setAnchor("2026-06-26");
    await client.query("insert into deadline_rules values($1,'2026-10-01','FROM_MONTH',29,1)",[id]);
    await expect("2026-10-01","2026-10-29");
    await expect("2027-02-01","2027-02-28");
    await expect("2028-02-01","2028-02-29");
    await expect("2027-03-01","2027-03-29");
    // Returning students must not inherit overrides from a previous cycle.
    await setAnchor("2026-10-09");
    await client.query("insert into deadline_rules values($1,'2026-09-01','FROM_MONTH',2,1)",[id]);
    await expect("2026-09-01","2026-09-02");
    await expect("2026-11-01","2026-11-09");
    // Freeze coverage follows the lesson anchor (16th), not the due day (10th).
    await setAnchor("2026-08-16");
    await client.query("insert into deadline_rules values($1,'2026-09-01','FROM_MONTH',10,1);",[id]);
    await client.query("insert into deadline_freezes values($1,'2026-09-16','2026-10-16')",[id]);
    await expect("2026-09-01","2026-10-10");
    await client.query("update deadline_freezes set end_date=null");
    await expect("2026-09-01",null);
    await setAnchor(null);
    await expect("2026-11-01",null);
    await setAnchor("2026-10-09");
    await expect(null,null);
    return { passed:true, assertions, syntheticOnly:true };
  } finally { await client.query("rollback"); }
}
