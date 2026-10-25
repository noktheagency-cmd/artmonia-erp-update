/** Reviewed owner-requested legacy correction. Dry-run is the default.
 * Never changes another environment; credentials must be supplied by the operator.
 * Cash is retained. The sole new receipt is the owner's explicitly confirmed October cash receipt.
 */
import { createHash } from "node:crypto";

export const targetProject = "xgxlwbqaojbptrgosxtj";
export const caseIds = {
  matica: "c745312b-2f85-4407-820d-8888b52e39f6",
  terane: "2c579f8d-f399-4d01-82f9-af749ececc8c",
  heydar: "3d2e9363-2e4d-48f9-83e5-f1e68a6a114c",
  gulay: "9e93cd12-15df-4251-95d6-896b8fd6c90f",
};
const operation = "owner-legacy-correction-2026-10-25-v1";
const reason = "Owner 25.10.2026 müraciəti: köhnə qaydalar üzrə səhv borcların ləğvi, təkrar paket bölgüsünün və faktiki qayıdış tarixlərinin düzəlişi";
const fingerprint = data => createHash("sha256").update(JSON.stringify(data)).digest("hex");

export function assertCorrectionTarget(connectionString) {
  const url = new URL(connectionString);
  const pooled = url.username.endsWith(`.${targetProject}`) && url.hostname.endsWith(".pooler.supabase.com");
  if (!pooled && url.hostname !== `db.${targetProject}.supabase.co`) {
    throw new Error("Only the identified Vercel database is authorized for this correction");
  }
}
export async function snapshotOwnerCases(client) {
  const ids = Object.values(caseIds);
  const rows = {};
  for (const [key, sql] of Object.entries({
    students: `select to_jsonb(s) row from erp.students s where id=any($1::uuid[]) or (lifecycle_status in ('STOPPED','FROZEN') and not is_test_data and exists(select 1 from erp.invoices i where i.student_id=s.id and i.status<>'VOID' and i.balance_due>0)) order by id`,
    enrollments: `select to_jsonb(e) row from erp.enrollments e where student_id=any($1::uuid[]) order by id`,
    invoices: `select to_jsonb(i) row from erp.invoices i join erp.students s on s.id=i.student_id where i.student_id=any($1::uuid[]) or (s.lifecycle_status in ('STOPPED','FROZEN') and not s.is_test_data and i.status<>'VOID' and i.balance_due>0) order by i.id`,
    payments: `select to_jsonb(p) row from erp.payments p where student_id=any($1::uuid[]) order by id`,
    allocations: `select to_jsonb(a) row from erp.payment_allocations a join erp.invoices i on i.id=a.invoice_id join erp.students s on s.id=i.student_id where i.student_id=any($1::uuid[]) or (s.lifecycle_status in ('STOPPED','FROZEN') and not s.is_test_data and i.status<>'VOID' and i.balance_due>0) order by a.id`,
  })) rows[key] = (await client.query(sql, [ids])).rows.map(r => r.row);
  return { project: targetProject, operation, ...rows, fingerprint: fingerprint(rows) };
}

export async function applyOwnerCases(client, { connectionString, expectedFingerprint, confirmedHeydarCash, dryRun = true }) {
  assertCorrectionTarget(connectionString);
  if (confirmedHeydarCash !== true) throw new Error("The October 4 cash receipt needs explicit owner confirmation");
  await client.query("begin");
  try {
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [operation]);
    if ((await client.query("select 1 from erp.audit_logs where action=$1 limit 1", [operation])).rowCount) {
      await client.query("rollback"); return { replay: true };
    }
    const before = await snapshotOwnerCases(client);
    await client.query("select id from erp.students where id=any($1::uuid[]) order by id for update", [before.students.map(r=>r.id)]);
    await client.query("select id from erp.invoices where id=any($1::uuid[]) order by id for update", [before.invoices.map(r=>r.id)]);
    await client.query("select id from erp.payments where student_id=any($1::uuid[]) order by id for update", [Object.values(caseIds)]);
    const locked = await snapshotOwnerCases(client);
    if (locked.fingerprint !== expectedFingerprint || locked.fingerprint !== before.fingerprint) throw new Error("Snapshot changed; review a fresh dry-run");
    const cashBefore = (await client.query("select sum(amount)::text total,count(*)::int count from erp.payments")).rows[0];
    const audit = async (action, entity, id, old, next) => client.query(`insert into erp.audit_logs(id,actor_user_id,action,entity_type,entity_id,before_json,after_json,reason,created_at) values(gen_random_uuid(),null,$1,$2,$3,$4::jsonb,$5::jsonb,$6,now())`,
      [action,entity,id,JSON.stringify(old),JSON.stringify({ ...next, operator: "Codex maintenance / explicit owner request", operation }),reason]);
    // Audit the complete restorable snapshot in the same transaction as the changes.
    await audit(`${operation}.snapshot`, "maintenance", null, before, { approvedAt: "2026-10-25", newCash: "100.00" });

    async function moveAllocation(id, from, to, studentId, expectedAmount) {
      const rows = (await client.query(`select a.id,a.invoice_id,p.student_id,a.amount_allocated::text amount,i.student_id target_student,i.status target_status from erp.payment_allocations a join erp.payments p on p.id=a.payment_id join erp.invoices i on i.id=$2 where a.id=$1 for update of a`,[id,to])).rows;
      if (rows.length!==1 || rows[0].invoice_id!==from || rows[0].student_id!==studentId || rows[0].target_student!==studentId || rows[0].target_status==='VOID' || Number(rows[0].amount)!==expectedAmount) throw new Error("Allocation no longer matches the reviewed plan");
      await client.query("update erp.payment_allocations set invoice_id=$2 where id=$1",[id,to]);
      await client.query(`update erp.invoices i set balance_due=i.amount-coalesce((select sum(a.amount_allocated) from erp.payment_allocations a where a.invoice_id=i.id),0),status='PAID',updated_at=now() where id=$1 and i.amount=(select sum(a.amount_allocated) from erp.payment_allocations a where a.invoice_id=i.id)`,[to]);
      await audit("student.payment_allocation.reconcile","student",studentId,rows[0],{allocationId:id,invoiceId:to});
    }
    async function cancelRemaining(invoiceId, studentId, duplicate=false) {
      const invoice = (await client.query(`select to_jsonb(i) row,coalesce((select sum(a.amount_allocated) from erp.payment_allocations a where a.invoice_id=i.id),0)::text allocated from erp.invoices i where i.id=$1 and i.student_id=$2 for update`,[invoiceId,studentId])).rows[0];
      if (!invoice || invoice.row.status==='VOID') throw new Error("Invoice no longer matches the reviewed plan");
      const paid = invoice.allocated;
      // Partial legacy invoices retain their paid part; no fictitious cash is added.
      if (duplicate && Number(paid)!==0) throw new Error("Duplicate invoice still has allocated cash");
      await client.query(`update erp.invoices set balance_due=0,status=case when $2::numeric=0 then 'VOID'::erp."InvoiceStatus" else 'PAID'::erp."InvoiceStatus" end,amount=case when $2::numeric=0 then amount else $2::numeric end,updated_at=now() where id=$1`,[invoiceId,paid]);
      await audit(duplicate ? "student.invoice.duplicate_void" : "student.legacy_debt.waive","student",studentId,invoice.row,{invoiceId,retainedPaidAmount:paid,cancelledBalance:duplicate ? null : invoice.row.balance_due});
    }
    await moveAllocation("63731b72-2db4-4e78-bce3-6f1019809640","365a0da8-43a4-48cb-9bad-14b234d8f7ae","bd3c522b-71e1-4c44-b0b0-97d119a3161d",caseIds.matica,79);
    await cancelRemaining("365a0da8-43a4-48cb-9bad-14b234d8f7ae",caseIds.matica,true);
    await cancelRemaining("a9a83e39-f369-4191-81ff-55161ff314bf",caseIds.matica,true);
    await moveAllocation("9ede5ac5-fdec-4f51-8321-439451bc64b6","9c3bec6a-4860-4f6b-9a8b-d819cd314588","0a1f93b0-76f8-4bb4-954c-98fb3699600a",caseIds.terane,149);
    await cancelRemaining("9c3bec6a-4860-4f6b-9a8b-d819cd314588",caseIds.terane,true);
    await cancelRemaining("23bcb17d-5158-483b-b410-42bce766f511",caseIds.terane);
    await cancelRemaining("7a7c509a-6b9f-4895-a35c-9d9385723cf7",caseIds.heydar);

    for (const student of before.students.filter(s=>['STOPPED','FROZEN'].includes(s.lifecycle_status))) {
      for (const invoice of before.invoices.filter(i=>i.student_id===student.id && i.status!=='VOID' && Number(i.balance_due)>0)) await cancelRemaining(invoice.id,student.id);
    }
    await client.query("select set_config('app.allow_billing_anchor_update','on',true)");
    for (const [id,date] of [[caseIds.matica,"2026-09-27"],[caseIds.terane,"2026-10-04"],[caseIds.heydar,"2026-10-04"],[caseIds.gulay,"2026-10-05"]]) {
      await client.query("update erp.students set billing_anchor_date=$2::date,updated_at=now() where id=$1",[id,date]);
      await client.query(`update erp.invoices set issue_date=erp.student_payment_due_date($1::uuid,period_month),due_date=erp.student_payment_due_date($1::uuid,period_month),updated_at=now() where student_id=$1 and enrollment_id is not null and period_month>=date_trunc('month',$2::date)::date and status<>'VOID'`,[id,date]);
      await audit("student.billing_current_period.reconcile","student",id,before.students.find(s=>s.id===id),{billingAnchorDate:date,originalFirstLessonPreserved:id!==caseIds.gulay});
    }
    await client.query("select set_config('app.allow_billing_anchor_update','off',true)");
    await client.query("update erp.students set original_first_lesson_at='2026-10-05' where id=$1",[caseIds.gulay]);
    await client.query("update erp.enrollments set start_date='2026-10-05',updated_at=now() where id='1a208b59-b884-4459-a1ef-04f8f328f10e'");
    await client.query("update erp.enrollments set first_lesson_at='2026-10-04',start_date='2026-10-04',updated_at=now() where id='dc7568a1-f218-43cb-9714-a1c6213289dc'");
    await client.query("update erp.enrollments set program_id='720aabf9-6cb7-4089-8e93-0bc644dbc83d',updated_at=now() where id='b1bd21d8-8d46-41c0-aaae-48197350a7a7'");
    const invoice = (await client.query(`insert into erp.invoices(id,student_id,enrollment_id,period_month,issue_date,due_date,amount,balance_due,status,idempotency_key,created_at,updated_at) values(gen_random_uuid(),$1,'dc7568a1-f218-43cb-9714-a1c6213289dc','2026-10-01','2026-10-04','2026-10-04',100,0,'PAID',$2,now(),now()) returning id`,[caseIds.heydar,`${operation}:heydar-october`])).rows[0];
    const payment = (await client.query(`insert into erp.payments(id,student_id,amount,paid_at,payment_month,method,schedule_type,receipt_purpose,idempotency_key,note,created_at) values(gen_random_uuid(),$1,100,'2026-10-04','2026-10-01','CASH','MONTHLY','RENEWAL',$2,$3,now()) returning id`,[caseIds.heydar,`${operation}:confirmed-heydar-cash`,"Owner ayrıca təsdiqlədi: 04.10.2026 nağd 100 AZN; əvvəlki iyul qəbzi dəyişdirilmədi"])).rows[0];
    await client.query(`insert into erp.payment_allocations(id,payment_id,invoice_id,amount_allocated,mode,created_at) values(gen_random_uuid(),$1,$2,100,'SELECTED_INVOICE',now())`,[payment.id,invoice.id]);
    await audit("student.payment.legacy_record","student",caseIds.heydar,null,{paymentId:payment.id,invoiceId:invoice.id,amount:"100.00",paidDate:"2026-10-04",method:"CASH",ownerExplicitlyConfirmed:true});
    const cashAfter = (await client.query("select sum(amount)::text total,count(*)::int count from erp.payments")).rows[0];
    const correctCash = (await client.query("select $1::numeric-$2::numeric=100 correct",[cashAfter.total,cashBefore.total])).rows[0].correct;
    if (!correctCash || cashAfter.count!==cashBefore.count+1) throw new Error("Cash conservation check failed");
    const remaining = (await client.query(`select count(*)::int count from erp.invoices where student_id=any($1::uuid[]) and status<>'VOID' and balance_due>0`,[before.students.map(s=>s.id)])).rows[0].count;
    if (remaining!==0) throw new Error("Reviewed students still have open balances");
    await audit(operation,"maintenance",null,{fingerprint:before.fingerprint,cash:cashBefore},{cash:cashAfter,remainingOpenInvoices:remaining,students:before.students.length});
    await client.query(dryRun ? "rollback" : "commit");
    return { replay:false,dryRun,students:before.students.length,addedConfirmedCash:"100.00",remainingOpenInvoices:remaining };
  } catch(error) { await client.query("rollback"); throw error; }
}
