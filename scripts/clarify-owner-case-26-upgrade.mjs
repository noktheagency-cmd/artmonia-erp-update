import { createHash } from "node:crypto";
import { assertCorrectionTarget } from "./reconcile-owner-student-cases.mjs";

const operation = "owner-case-26-upgrade-clarification-20261026-v1";
const studentId = "bd0725a1-d743-4444-b991-abbda52f99d3";
const enrollmentId = "3c558106-cdc9-4692-93bf-9caf7cb20780";
const termId = "c7974609-f4d7-4443-99d2-16ba8dddb25e";
const requestedBy = "f74ddcf3-fed2-4d36-86e5-5e75ab94f225";
const reason = "Owner/Vaqif dəqiqləşdirməsi: ilkin paket 79 AZN / 4 dərs idi; 03.10-da 149 AZN / 8 dərs paketinə yüksəldildi. 27.09-da alınmış 79 AZN + 03.10-da alınmış 70 AZN eyni yüksəldilmiş paketi tamamlayır. Bu ONLY_MONTH 70 AZN məbləği ayrıca aylıq paket və ya endirim deyil, əvvəlki fakturada ödənmiş 79 AZN-dən sonra qalan yüksəltmə fərqidir. Cari və sonrakı paket 149 AZN / 8 dərsdir. Əvəz dərslərlə bağlı əvvəl təsdiqlənmiş növbəti ödəniş 15.11.2026; ayrıca oktyabr borcu yoxdur. Codex maintenance";

export async function snapshotOwnerCase26(client) {
  const data = {};
  for (const table of ["enrollments", "invoices", "payments", "student_billing_cycles", "student_due_date_rules"]) {
    data[table] = (await client.query(`select to_jsonb(t) row from erp.${table} t where student_id=$1 order by id limit 100`, [studentId])).rows.map(r => r.row);
  }
  data.terms = (await client.query("select to_jsonb(t) row from erp.enrollment_billing_terms t where enrollment_id=$1 order by id limit 100", [enrollmentId])).rows.map(r => r.row);
  data.allocations = (await client.query("select to_jsonb(a) row from erp.payment_allocations a join erp.payments p on p.id=a.payment_id where p.student_id=$1 order by a.id limit 100", [studentId])).rows.map(r => r.row);
  data.payoutLines = (await client.query("select to_jsonb(l) row from erp.teacher_payout_lines l join erp.payments p on p.id=l.payment_id where p.student_id=$1 order by l.id limit 100", [studentId])).rows.map(r => r.row);
  return { ...data, fingerprint: createHash("sha256").update(JSON.stringify(data)).digest("hex") };
}

/** Clarifies the existing net charge only; no receipt, allocation, fee or deadline changes. */
export async function clarifyOwnerCase26Upgrade(client, input) {
  assertCorrectionTarget(input.connectionString);
  if (input.requestedBy !== requestedBy || input.confirmedPackageTopUp !== true
      || !/^[a-f0-9]{64}$/.test(input.expectedFingerprint ?? "")) {
    throw new Error("Reviewed snapshot and explicit package top-up clarification required");
  }
  const dryRun = input.dryRun !== false;
  await client.query("begin");
  try {
    await client.query("set local lock_timeout='10s'; set local statement_timeout='20s'");
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [operation]);
    if ((await client.query("select 1 from erp.audit_logs where action=$1 limit 1", [operation])).rowCount) {
      await client.query("rollback");
      return { replay: true, dryRun };
    }
    await client.query("select id from erp.students where id=$1 for update", [studentId]);
    for (const table of ["enrollments", "invoices", "payments"]) {
      await client.query(`select id from erp.${table} where student_id=$1 order by id for update`, [studentId]);
    }
    await client.query("select id from erp.enrollment_billing_terms where enrollment_id=$1 order by id for update", [enrollmentId]);
    const before = await snapshotOwnerCase26(client);
    if (before.fingerprint !== input.expectedFingerprint) throw new Error("Snapshot changed; review again");
    const enrollment = before.enrollments.find(e => e.id === enrollmentId);
    const term = before.terms.find(t => t.id === termId);
    if (!enrollment || enrollment.status !== "ACTIVE" || String(enrollment.monthly_fee) !== "149" || enrollment.lessons_per_month !== 8
        || !term || term.mode !== "ONLY_MONTH" || term.effective_month !== "2026-10-01" || String(term.monthly_fee) !== "70") {
      throw new Error("Reviewed package facts changed");
    }
    const facts = (await client.query(`select
      count(*)=2 and sum(amount)=149 and count(*) filter(where amount=79 and paid_at='2026-09-27')=1
        and count(*) filter(where amount=70 and paid_at='2026-10-03')=1 and count(refunded_at)=0 receipts_valid,
      (select coalesce(sum(balance_due),0)=0 from erp.invoices where student_id=$1 and status<>'VOID') debt_zero,
      erp.enrollment_billing_amount($2,'2026-11-01')=149 future_fee_valid,
      erp.next_unfrozen_billing_date($1,(select (max(period_month)+interval '1 month')::date from erp.invoices where student_id=$1 and status<>'VOID'))='2026-11-15' next_date_valid
      from erp.payments where student_id=$1`, [studentId, enrollmentId])).rows[0];
    if (!facts || !Object.values(facts).every(v => v === true)) throw new Error("Receipt, balance or deadline verification failed");
    await client.query("update erp.enrollment_billing_terms set reason=$2,updated_at=now() where id=$1", [termId, reason]);
    const after = await snapshotOwnerCase26(client);
    for (const key of ["enrollments", "invoices", "payments", "allocations", "student_billing_cycles", "student_due_date_rules", "payoutLines"]) {
      if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) throw new Error(`Unexpected financial change: ${key}`);
    }
    const expectedTerms = before.terms.map(t => t.id === termId ? { ...t, reason, updated_at: after.terms.find(a => a.id === termId).updated_at } : t);
    if (JSON.stringify(expectedTerms) !== JSON.stringify(after.terms)) throw new Error("Unexpected billing term change");
    await client.query(`insert into erp.audit_logs(id,actor_user_id,action,entity_type,entity_id,before_json,after_json,reason,created_at)
      values(gen_random_uuid(),null,$1,'student',$2,$3::jsonb,$4::jsonb,$5,now())`,
    [operation,studentId,JSON.stringify(term),JSON.stringify({term:after.terms.find(t=>t.id===termId),requestedBy,operator:"Codex maintenance / explicit owner request",facts,financialRecordsUnchanged:true}),reason]);
    await client.query(dryRun ? "rollback" : "commit");
    return { replay:false, dryRun, facts, financialRecordsUnchanged:true };
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}
