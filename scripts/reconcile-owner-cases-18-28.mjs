import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { assertCorrectionTarget } from "./reconcile-owner-student-cases.mjs";

const operation = "owner-cases-18-28-20261026-v1";
const migrationName = "20261026120000_next_payment_deadline_rule";
const vaqifId = "f74ddcf3-fed2-4d36-86e5-5e75ab94f225";
export const ownerCaseCodes = ["ART-2332", "ART-3392", "ART-3292", "ART-2534", "ART-3072", "ART-1298", "ART-1140", "ART-1150", "ART-1174", "ART-1852"];
const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function assertOwnerCaseConfirmations(input) {
  assertCorrectionTarget(input.connectionString);
  if (input.requestedBy !== vaqifId || input.confirmedSingleIlahaReceipt !== true
    || input.confirmedAydanLegacyWaiver !== true || input.confirmedNerminCoverage !== true) {
    throw new Error("Explicit owner confirmations for duplicate cash, legacy debt, coverage and audit attribution are required");
  }
}

export async function snapshotOwnerCases18To28(client) {
  const data = {};
  data.students = (await client.query("select to_jsonb(s) row from erp.students s where code=any($1::text[]) order by id", [ownerCaseCodes])).rows.map(r => r.row);
  if (data.students.length !== ownerCaseCodes.length) throw new Error("Expected ten unique reviewed student codes");
  const ids = data.students.map(s => s.id);
  for (const table of ["enrollments", "invoices", "payments", "student_billing_cycles", "student_due_date_rules", "student_freeze_periods", "student_status_history"]) {
    data[table] = (await client.query(`select to_jsonb(t) row from erp.${table} t where student_id=any($1::uuid[]) order by id`, [ids])).rows.map(r => r.row);
  }
  data.allocations = (await client.query("select to_jsonb(a) row from erp.payment_allocations a join erp.payments p on p.id=a.payment_id where p.student_id=any($1::uuid[]) order by a.id", [ids])).rows.map(r => r.row);
  data.terms = (await client.query("select to_jsonb(t) row from erp.enrollment_billing_terms t join erp.enrollments e on e.id=t.enrollment_id where e.student_id=any($1::uuid[]) order by t.id", [ids])).rows.map(r => r.row);
  data.payoutLines = (await client.query("select to_jsonb(l) row from erp.teacher_payout_lines l join erp.payments p on p.id=l.payment_id where p.student_id=any($1::uuid[]) order by l.id", [ids])).rows.map(r => r.row);
  data.payouts = (await client.query("select to_jsonb(t) row from erp.teacher_payouts t where id=any($1::uuid[]) order by id", [[...new Set(data.payoutLines.map(l => l.payout_id))]])).rows.map(r => r.row);
  return { ...data, fingerprint: digest(data) };
}

/** One reviewed maintenance operation; rollback by default, stale snapshots fail closed. */
export async function reconcileOwnerCases18To28(client, input) {
  assertOwnerCaseConfirmations(input);
  if (!/^[a-f0-9]{64}$/.test(input.expectedFingerprint ?? "")) throw new Error("Reviewed snapshot fingerprint required");
  const dryRun = input.dryRun !== false;
  await client.query("begin");
  try {
    await client.query("set local lock_timeout='10s'; set local statement_timeout='30s'");
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [operation]);
    await client.query("select pg_advisory_xact_lock(hashtextextended('erp.materialize-due-student-invoices',0))");
    if ((await client.query("select 1 from erp.audit_logs where action=$1 limit 1", [operation])).rowCount) {
      await client.query("rollback");
      return { replay: true, dryRun };
    }
    const ids = (await client.query("select id from erp.students where code=any($1::text[]) order by id for update", [ownerCaseCodes])).rows.map(s => s.id);
    for (const table of ["enrollments", "invoices", "payments"]) {
      await client.query(`select id from erp.${table} where student_id=any($1::uuid[]) order by id for update`, [ids]);
    }
    await client.query("select a.id from erp.payment_allocations a join erp.payments p on p.id=a.payment_id where p.student_id=any($1::uuid[]) order by a.id for update of a", [ids]);
    await client.query("select t.id from erp.teacher_payouts t where id in (select l.payout_id from erp.teacher_payout_lines l join erp.payments p on p.id=l.payment_id where p.student_id=any($1::uuid[])) order by t.id for update", [ids]);
    await client.query("select l.id from erp.teacher_payout_lines l join erp.payments p on p.id=l.payment_id where p.student_id=any($1::uuid[]) order by l.id for update of l", [ids]);
    const before = await snapshotOwnerCases18To28(client);
    if (before.fingerprint !== input.expectedFingerprint) throw new Error("Snapshot changed; review again before writing");
    const student = code => before.students.find(s => s.code === code);
    const active = code => {
      const rows = before.enrollments.filter(e => e.student_id === student(code).id && e.status === "ACTIVE");
      if (rows.length !== 1) throw new Error("Expected one current enrollment");
      return rows[0];
    };
    const invoice = (code, month, enrollmentId = active(code).id) => {
      const rows = before.invoices.filter(i => i.student_id === student(code).id && i.enrollment_id === enrollmentId && i.period_month === month && i.status !== "VOID");
      if (rows.length !== 1) throw new Error("Expected one reviewed monthly invoice");
      return rows[0];
    };
    const audit = async (action, entityId, previous, after, reason) => {
      await client.query(`insert into erp.audit_logs(id,actor_user_id,action,entity_type,entity_id,before_json,after_json,reason,created_at)
        values(gen_random_uuid(),null,$1,$2,$3,$4::jsonb,$5::jsonb,$6,now())`,
      [action, entityId ? "student" : "maintenance", entityId, JSON.stringify(previous), JSON.stringify({ ...after, operation, requestedBy: input.requestedBy, operator: "Codex maintenance / explicit owner request" }), reason]);
    };
    await audit(`${operation}.snapshot`, null, before, { fingerprint: before.fingerprint }, "18–28-ci hallar: dəyişiklikdən əvvəl bərpa surəti; Vaqifin təsdiqi");

    // Repair the shared date resolver atomically with these data corrections.
    const migrationSql = readFileSync(new URL(`../prisma/migrations/${migrationName}/migration.sql`, import.meta.url), "utf8");
    const checksum = createHash("sha256").update(migrationSql).digest("hex");
    const migration = (await client.query("select checksum,finished_at from erp._prisma_migrations where migration_name=$1 and rolled_back_at is null", [migrationName])).rows;
    if (migration.length > 1 || (migration.length && (migration[0].checksum !== checksum || !migration[0].finished_at))) throw new Error("Migration history mismatch");
    if (!migration.length) {
      await client.query(migrationSql);
      await client.query("insert into erp._prisma_migrations(id,checksum,finished_at,migration_name,started_at,applied_steps_count) values($1,$2,now(),$3,now(),1)", [randomUUID(), checksum, migrationName]);
    }

    const duplicateId = "75d5e398-081e-464e-837d-8f50e82cb6a0";
    const retainedId = "f9991ec7-76c9-4be5-afa1-4a55174100d7";
    for (const id of [duplicateId, retainedId]) {
      const p = before.payments.find(p => p.id === id);
      if (!p || p.student_id !== student("ART-3392").id || String(p.amount) !== "75" || p.paid_at !== "2026-10-09" || p.payment_month !== "2026-10-01" || p.refunded_at || p.course_sale_id) throw new Error("Receipt facts differ from owner confirmation");
    }
    const linked = (await client.query(`select (select count(*) from erp.refund_adjustments where payment_id=$1)
      +(select count(*) from erp.single_lessons where payment_id=$1) count`, [duplicateId])).rows[0].count;
    if (Number(linked) !== 0) throw new Error("Duplicate receipt has downstream refund/lesson references");
    const duplicateLines = before.payoutLines.filter(l => l.payment_id === duplicateId);
    if (before.payoutLines.some(l => l.payment_id === retainedId)
      || duplicateLines.some(l => l.enrollment_id !== active("ART-3392").id
        || before.payouts.find(p => p.id === l.payout_id)?.status !== "DRAFT")) {
      throw new Error("Payroll links require separate review; approved totals cannot be rewritten");
    }
    // The sole draft line already represents this actual month's attendance.
    // Rebind it to the retained real receipt without deleting earned salary.
    await client.query("update erp.teacher_payout_lines set payment_id=$2 where payment_id=$1",[duplicateId,retainedId]);
    if (duplicateLines.length) await audit("student.payment.payroll_reference_reconcile",student("ART-3392").id,{lines:duplicateLines},{retainedId,payoutTotalsPreserved:true},"Tək faktiki qəbzə istinad düzəldildi; DRAFT müəllim hesablamasının məbləği saxlanıldı");
    await client.query("delete from erp.payment_allocations where payment_id=$1", [duplicateId]);
    await client.query("delete from erp.payments where id=$1", [duplicateId]);
    await audit("student.payment.duplicate_remove", student("ART-3392").id, before.payments.find(p => p.id === duplicateId), { duplicateId, retainedId }, "Owner təsdiqi: 09.10.2026-da yalnız bir dəfə 75 AZN alınıb; 12 oktyabrda daxil edilən dublikat çıxarıldı, refund deyil");

    for (const [code, paymentId] of [["ART-2332", "25e6979b-c9f7-4b12-b830-5c80d8f7d62d"], ["ART-3392", retainedId]]) {
      const payment = before.payments.find(p => p.id === paymentId);
      const allocations = before.allocations.filter(a => a.payment_id === paymentId);
      const target = invoice(code, "2026-10-01");
      if (!payment || payment.student_id !== student(code).id || allocations.length !== 1 || String(allocations[0].amount_allocated) !== "75") throw new Error("Unexpected October payment allocation");
      const source = before.invoices.find(i => i.id === allocations[0].invoice_id);
      if (!source || source.student_id !== student(code).id || source.period_month !== "2026-10-01" || source.id === target.id || !before.enrollments.some(e => e.id === source.enrollment_id && e.status === "PAUSED")) throw new Error("Expected duplicate paused-program invoice");
      await client.query("update erp.payment_allocations set invoice_id=$2 where id=$1", [allocations[0].id, target.id]);
      if ((await client.query("select 1 from erp.payment_allocations where invoice_id=$1 limit 1", [source.id])).rowCount) throw new Error("Old invoice still has other allocated cash");
      await client.query("update erp.invoices set status='VOID',balance_due=0,updated_at=now() where id=$1", [source.id]);
      await audit("student.payment_allocation.reconcile", student(code).id, { source, allocation: allocations[0] }, { invoiceId: target.id, receiptPreserved: paymentId }, "Oktyabrın mövcud qəbzi cari paketə ayrıldı; köhnə paketdə təkrar faktura ləğv edildi");
    }
    const aydanAugust = before.invoices.find(i => i.id === "ce285f3c-1740-4a8e-b15f-68b1f3ee706e");
    if (!aydanAugust || aydanAugust.student_id !== student("ART-2332").id || String(aydanAugust.balance_due) !== "75" || before.allocations.some(a => a.invoice_id === aydanAugust.id)) throw new Error("Legacy August debt changed");
    await client.query("update erp.invoices set status='VOID',balance_due=0,updated_at=now() where id=$1", [aydanAugust.id]);
    await audit("student.legacy_debt.waive", student("ART-2332").id, aydanAugust, { cancelledBalance: "75.00" }, "Owner təsdiqi: avqustun 75 AZN qalığı səhv köhnə qalıqdır; pul daxilolması yaradılmadan ləğv edildi");

    await client.query("select set_config('app.allow_billing_anchor_update','on',true)");
    for (const [code, date, correctOriginal] of [
      ["ART-2332", "2026-10-09", false], ["ART-3392", "2026-10-09", false],
      ["ART-3292", "2026-09-05", false], ["ART-1140", "2026-09-07", true], ["ART-1150", "2026-09-09", false],
    ]) {
      await client.query("update erp.students set billing_anchor_date=$2::date,original_first_lesson_at=case when $3 then $2::date else original_first_lesson_at end,updated_at=now() where id=$1", [student(code).id,date,correctOriginal]);
      // Registration/contract start is preserved except the explicitly corrected return dates.
      await client.query("update erp.enrollments set first_lesson_at=$2::date,start_date=case when $3 then $2::date else start_date end,updated_at=now() where id=$1", [active(code).id,date,["ART-3392","ART-3292"].includes(code)]);
      await client.query("update erp.invoices set due_date=erp.student_payment_due_date(student_id,period_month),updated_at=now() where student_id=$1 and enrollment_id is not null and period_month>=date_trunc('month',$2::date)::date and status<>'VOID'", [student(code).id,date]);
      await audit("student.billing_current_period.reconcile", student(code).id, { student: student(code), enrollment: active(code) }, { billingAnchorDate:date, originalFirstLessonPreserved:!correctOriginal }, "Owner-in bildirdiyi faktiki dərs/qayıdış tarixi; əvvəlki qəbzlər və davamiyyət tarixçəsi saxlanıldı");
    }
    await client.query("select set_config('app.allow_billing_anchor_update','off',true)");

    const addRule = async (code, month, day, mode, reason) => {
      const ruleId = randomUUID();
      await client.query("insert into erp.student_due_date_rules(id,student_id,effective_month,mode,due_day,reason,created_by_id) values($1,$2,$3,$4,$5,$6,$7)", [ruleId,student(code).id,month,mode,day,reason,input.requestedBy]);
      await client.query("update erp.invoices set due_date=erp.student_payment_due_date(student_id,period_month),updated_at=now() where student_id=$1 and enrollment_id is not null and status<>'VOID' and (($2='ONLY_MONTH' and period_month=$3::date) or ($2='FROM_MONTH' and period_month>=$3::date))", [student(code).id,mode,month]);
      await audit("student.billing_deadline.change", student(code).id, null, { ruleId,month,day,mode,anchorPreserved:true }, reason);
    };
    await addRule("ART-2534","2026-10-01",29,"FROM_MONTH","Owner/Vaqif: razılaşdırılmış ödəniş günü ayın 29-u; Codex maintenance");
    await addRule("ART-3072","2026-10-01",1,"FROM_MONTH","Owner/Vaqif: oktyabrdan ödəniş günü ayın 1-i; Codex maintenance");
    await addRule("ART-1298","2026-10-01",29,"FROM_MONTH","Owner/Vaqif: növbəti ödəniş 29 oktyabr və sonrakı aylarda 29-u; Codex maintenance");

    // The confirmed 79 + 70 is the full fee through 15 November. Preserve both
    // real receipts and their service months; record October's accommodation.
    const nerminInvoice = invoice("ART-1174","2026-10-01");
    if (String(nerminInvoice.amount) !== "149" || String(nerminInvoice.balance_due) !== "79") throw new Error("October coverage facts changed");
    const coverageReason = "Owner/Vaqif təsdiqi: 27.09 üzrə 79 AZN + 03.10 üzrə 70 AZN cəmi 149 AZN, əvəz dərslərlə 15.11-ə qədər tam ödənişdir; oktyabrın əlavə 79 AZN borcu səhvdir. Codex maintenance";
    await client.query(`insert into erp.enrollment_billing_terms(id,enrollment_id,effective_month,mode,monthly_fee,lessons_per_month,discount_type,reason,created_by_id,created_at,updated_at)
      values(gen_random_uuid(),$1,'2026-10-01','ONLY_MONTH',70,$2,$3,$4,$5,now(),now())`, [active("ART-1174").id,active("ART-1174").lessons_per_month,active("ART-1174").discount_type,coverageReason,input.requestedBy]);
    await client.query("update erp.invoices set amount=70,balance_due=0,status='PAID',updated_at=now() where id=$1", [nerminInvoice.id]);
    await addRule("ART-1174","2026-10-01",3,"ONLY_MONTH",coverageReason);
    await addRule("ART-1174","2026-11-01",15,"FROM_MONTH","Owner/Vaqif: yeni ödəniş günü yalnız noyabrdan 15-i; Codex maintenance");
    await audit("student.invoice.coverage_correction",student("ART-1174").id,nerminInvoice,{ amount:"70.00",balance:"0.00",nextDate:"2026-11-15",receiptsUnchanged:true },coverageReason);

    const after = await snapshotOwnerCases18To28(client);
    if (JSON.stringify(before.payments.filter(p => p.id !== duplicateId)) !== JSON.stringify(after.payments)) throw new Error("A retained receipt changed");
    if (JSON.stringify(before.payouts) !== JSON.stringify(after.payouts)
      || JSON.stringify(before.payoutLines.map(l => l.payment_id === duplicateId ? {...l,payment_id:retainedId} : l)) !== JSON.stringify(after.payoutLines)) throw new Error("Payroll amounts or unrelated lines changed");
    if (JSON.stringify(before.student_freeze_periods) !== JSON.stringify(after.student_freeze_periods)
      || JSON.stringify(before.student_status_history) !== JSON.stringify(after.student_status_history)) throw new Error("Unrelated history changed");
    const inconsistent = (await client.query(`select i.id from erp.invoices i where i.student_id=any($1::uuid[]) and i.status<>'VOID'
      and i.balance_due<>greatest(i.amount-coalesce((select sum(a.amount_allocated) from erp.payment_allocations a where a.invoice_id=i.id),0),0)`, [ids])).rows;
    if (inconsistent.length) throw new Error("Invoice allocation/balance invariant failed");
    const summary = (await client.query(`select s.code,
      coalesce((select sum(i.balance_due) from erp.invoices i where i.student_id=s.id and i.status<>'VOID' and i.due_date<=(now() at time zone 'Asia/Baku')::date),0)::text debt,
      coalesce((select min(i.due_date) from erp.invoices i where i.student_id=s.id and i.status<>'VOID' and i.balance_due>0),
        erp.next_unfrozen_billing_date(s.id,coalesce((select (max(i.period_month)+interval '1 month')::date from erp.invoices i where i.student_id=s.id and i.status<>'VOID' and not exists(select 1 from erp.single_lessons sl where sl.invoice_id=i.id)),s.billing_anchor_date)))::text next_date
      from erp.students s where s.id=any($1::uuid[]) order by s.code`, [ids])).rows;
    const expectedDates = {"ART-2332":"2026-11-09","ART-3392":"2026-11-09","ART-3292":"2026-11-05","ART-2534":"2026-10-29","ART-3072":"2026-10-01","ART-1298":"2026-10-29","ART-1140":"2026-11-07","ART-1150":"2026-10-09","ART-1174":"2026-11-15","ART-1852":"2026-11-10"};
    for (const row of summary) {
      if (row.next_date !== expectedDates[row.code]) throw new Error(`Next-date verification failed for ${row.code}`);
      if (["ART-2332","ART-3392","ART-1174","ART-1852"].includes(row.code) && row.debt !== "0.00") throw new Error(`Debt verification failed for ${row.code}`);
    }
    await audit(operation,null,{ fingerprint:before.fingerprint },{ summary,afterFingerprint:after.fingerprint,migrationName,duplicateReceiptRemoved:duplicateId,retainedReceiptsUnchanged:true },"18–28-ci hallar üzrə təsdiqlənmiş düzəlişlər; yeni pul qəbzi yaradılmadı");
    await client.query(dryRun ? "rollback" : "commit");
    return { replay:false,dryRun,summary,afterFingerprint:after.fingerprint,duplicateReceiptRemoved:duplicateId,retainedReceiptsUnchanged:true };
  } catch(error) { await client.query("rollback"); throw error; }
}
