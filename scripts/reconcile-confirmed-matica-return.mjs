import { createHash } from "node:crypto";
import { assertCorrectionTarget,caseIds } from "./reconcile-owner-student-cases.mjs";
const operation="owner-matica-actual-return-20261025-v2";
const duplicateId="5e07fde4-2b8d-47aa-9037-683080781123";
const retainedId="3aa7d741-a8f5-4b58-8a11-04c2cb2e9219";
const septemberInvoice="bd3c522b-71e1-4c44-b0b0-97d119a3161d";
const octoberInvoice="745efc0e-85d2-42fd-a82e-901466d65576";
const hash=data=>createHash("sha256").update(JSON.stringify(data)).digest("hex");
export async function snapshotMaticaReturn(client) {
  const data={};
  for(const [key,sql] of Object.entries({
    student:"select to_jsonb(s) row from erp.students s where id=$1",
    enrollments:"select to_jsonb(e) row from erp.enrollments e where student_id=$1 order by id",
    invoices:"select to_jsonb(i) row from erp.invoices i where student_id=$1 order by id",
    payments:"select to_jsonb(p) row from erp.payments p where student_id=$1 order by id",
    allocations:"select to_jsonb(a) row from erp.payment_allocations a join erp.payments p on p.id=a.payment_id where p.student_id=$1 order by a.id",
    rules:"select to_jsonb(r) row from erp.student_due_date_rules r where student_id=$1 order by version",
    history:"select to_jsonb(h) row from erp.student_status_history h where student_id=$1 order by id",
    assignments:"select to_jsonb(a) row from erp.student_schedule_assignments a join erp.enrollments e on e.id=a.enrollment_id where e.student_id=$1 order by a.id",
  })) data[key]=(await client.query(sql,[caseIds.matica])).rows.map(r=>r.row);
  return {...data,fingerprint:hash(data)};
}
export async function reconcileConfirmedMaticaReturn(client,{connectionString,expectedFingerprint,ownerConfirmedTotal,dryRun=true}) {
  assertCorrectionTarget(connectionString);
  if(ownerConfirmedTotal!=="79.00")throw new Error("Explicit owner confirmation of the single receipt is required");
  await client.query("begin");
  try {
    await client.query("select id from erp.students where id=$1 for update",[caseIds.matica]);
    if((await client.query("select 1 from erp.audit_logs where action=$1 limit 1",[operation])).rowCount){await client.query("rollback");return{replay:true};}
    await client.query("select id from erp.invoices where student_id=$1 order by id for update",[caseIds.matica]);
    await client.query("select id from erp.payments where student_id=$1 order by id for update",[caseIds.matica]);
    const before=await snapshotMaticaReturn(client);
    if(before.fingerprint!==expectedFingerprint)throw new Error("Snapshot changed; review again");
    const duplicate=before.payments.find(p=>p.id===duplicateId),retained=before.payments.find(p=>p.id===retainedId);
    if(!duplicate || !retained || duplicate.course_sale_id || duplicate.refunded_at || Number(duplicate.amount)!==79 || Number(retained.amount)!==79 || duplicate.payment_month!=="2026-09-01" || retained.payment_month!=="2026-10-01")throw new Error("Receipt facts no longer match the reviewed plan");
    const linked=(await client.query("select (select count(*) from erp.teacher_payout_lines where payment_id=$1)+(select count(*) from erp.refund_adjustments where payment_id=$1)+(select count(*) from erp.single_lessons where payment_id=$1) count",[duplicateId])).rows[0].count;
    if(Number(linked)!==0)throw new Error("The duplicate receipt has payroll/refund/lesson references requiring separate review");
    const cashBefore=(await client.query("select sum(amount)::text total,count(*)::int count from erp.payments")).rows[0];
    await client.query("delete from erp.payment_allocations where payment_id=$1",[duplicateId]);
    await client.query("delete from erp.payments where id=$1",[duplicateId]);
    await client.query("update erp.invoices set status='VOID',balance_due=0,updated_at=now() where id=$1 and student_id=$2",[septemberInvoice,caseIds.matica]);
    await client.query("select set_config('app.allow_billing_anchor_update','on',true)");
    await client.query("update erp.students set billing_anchor_date='2026-10-04',updated_at=now() where id=$1",[caseIds.matica]);
    await client.query("select set_config('app.allow_billing_anchor_update','off',true)");
    await client.query("update erp.enrollments set start_date='2026-10-04',first_lesson_at='2026-10-04',updated_at=now() where id='5ca810f7-064e-4710-b6fb-4ee777c84d2e' and student_id=$1",[caseIds.matica]);
    if((await client.query("select 1 from erp.attendance_records ar join erp.slot_sessions ss on ss.id=ar.session_id where ar.enrollment_id='5ca810f7-064e-4710-b6fb-4ee777c84d2e' and ss.session_date<date '2026-10-04' limit 1")).rowCount)throw new Error("Earlier attendance requires a separate history review");
    await client.query("update erp.student_schedule_assignments set valid_from='2026-10-04',updated_at=now() where enrollment_id='5ca810f7-064e-4710-b6fb-4ee777c84d2e' and valid_from='2026-09-27' and (valid_to is null or valid_to>=date '2026-10-04')");
    // Append corrections instead of rewriting prior lifecycle or audit records.
    // Future ACTIVE is already present when the legacy freeze trigger reconciles September.
    await client.query(`insert into erp.student_status_history(id,student_id,old_status,new_status,event_type,reason,freeze_reserved,effective_at,created_at) values
      (gen_random_uuid(),$1,'SLOT_WAITING','ACTIVE','STATUS_CHANGE','Owner təsdiqi: faktiki qayıdış və ilk iştirak 04.10.2026',false,'2026-10-04',now()+interval '2 milliseconds'),
      (gen_random_uuid(),$1,'FROZEN','SLOT_WAITING','REACTIVATED','Owner təsdiqi: qayıdışın düzgün tarixi 04.10.2026',false,'2026-10-04',now()+interval '1 millisecond'),
      (gen_random_uuid(),$1,'ACTIVE','FROZEN','STATUS_CHANGE','Tarixçə düzəlişi: 27.09 aktivləşməsi səhv idi; avqust dondurması 04.10-a qədər davam edib',false,'2026-09-27',now())`,[caseIds.matica]);
    await client.query("update erp.invoices set issue_date='2026-10-04',due_date=erp.student_payment_due_date($1::uuid,'2026-10-01'),updated_at=now() where id=$2",[caseIds.matica,octoberInvoice]);
    const verification=(await client.query(`select billing_anchor_date::text anchor,erp.student_payment_due_date(id,'2026-11-01')::text next,
      (select sum(amount)::text from erp.payments where id=$2) retained,
      (select sum(balance_due)::text from erp.invoices where student_id=$1 and status<>'VOID') balance from erp.students where id=$1`,[caseIds.matica,retainedId])).rows[0];
    const cashAfter=(await client.query("select sum(amount)::text total,count(*)::int count from erp.payments")).rows[0];
    if(!(await client.query("select $1::numeric-$2::numeric=79 correct",[cashBefore.total,cashAfter.total])).rows[0].correct || cashBefore.count!==cashAfter.count+1 || verification.anchor!=="2026-10-04" || verification.next!=="2026-11-04" || Number(verification.balance)!==0)throw new Error("Cash/date/balance invariant failed");
    await client.query("insert into erp.audit_logs(id,action,entity_type,entity_id,before_json,after_json,reason,created_at) values(gen_random_uuid(),$1,'student',$2,$3::jsonb,$4::jsonb,$5,now())",[operation,caseIds.matica,JSON.stringify(before),JSON.stringify({verification,duplicateReceiptRemoved:duplicateId,retainedReceipt:retainedId,cashBefore,cashAfter,operator:"Codex maintenance / explicit owner confirmation"}),"Owner təsdiqi: avqustda dondurulub, yalnız 04.10.2026-da qayıdıb; həmin gün cəmi bir dəfə 79 AZN alınıb. Səhv sentyabr qəbzi və dövrü ləğv edildi; orijinal ilk dərs və audit tarixçəsi saxlandı."]);
    await client.query(dryRun?"rollback":"commit");return{dryRun,verification,duplicateReceiptRemoved:duplicateId};
  } catch(error){await client.query("rollback");throw error;}
}
