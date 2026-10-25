import { createHash, randomUUID } from "node:crypto";
import { assertCorrectionTarget } from "./reconcile-owner-student-cases.mjs";

/** Exactly these reviewed additive/replacement migrations, on the identified staging
 * database only. The caller supplies reviewed file bytes, not arbitrary SQL.
 * Default transaction rolls back and verifies that cash and invoices stay intact.
 */
export async function applyReviewedCaseMigrations(client, connectionString, migrations, dryRun = true) {
  assertCorrectionTarget(connectionString);
  const allowed=["20261025190000_single_lessons","20261025191000_current_enrollment_billing_job","20261025192000_due_rules_current_cycle"];
  if (migrations.length<2 || migrations.length>3 || migrations.some((migration,index)=>migration.name!==allowed[index])) throw new Error("Unexpected migration plan");
  await client.query("begin");
  try {
    await client.query("select pg_advisory_xact_lock(hashtextextended('artmonia-owner-case-migrations-20261025',0))");
    const before=(await client.query("select (select sum(amount) from erp.payments)::text cash,(select count(*)::int from erp.invoices) invoices")).rows[0];
    const applied=[];
    for (const migration of migrations) {
      const checksum=createHash("sha256").update(migration.sql).digest("hex");
      const previous=(await client.query("select checksum,finished_at from erp._prisma_migrations where migration_name=$1 and rolled_back_at is null",[migration.name])).rows;
      if (previous.length) {
        if (previous.length!==1 || previous[0].checksum!==checksum || !previous[0].finished_at) throw new Error("Migration history mismatch");
        continue;
      }
      await client.query(migration.sql);
      await client.query("insert into erp._prisma_migrations(id,checksum,finished_at,migration_name,started_at,applied_steps_count) values($1,$2,now(),$3,now(),1)",[randomUUID(),checksum,migration.name]);
      applied.push(migration.name);
    }
    const after=(await client.query("select (select sum(amount) from erp.payments)::text cash,(select count(*)::int from erp.invoices) invoices")).rows[0];
    if (JSON.stringify(before)!==JSON.stringify(after)) throw new Error("Schema migration changed ledger data");
    const security=(await client.query("select relrowsecurity rls,has_table_privilege('anon','erp.single_lessons','SELECT') anon_read,has_table_privilege('authenticated','erp.single_lessons','SELECT') auth_read from pg_class where oid='erp.single_lessons'::regclass")).rows[0];
    if (!security.rls || security.anon_read || security.auth_read) throw new Error("Private table access verification failed");
    await client.query("insert into erp.audit_logs(id,action,entity_type,after_json,reason,created_at) values(gen_random_uuid(),'maintenance.owner_case_migrations','maintenance',$1::jsonb,'Owner 25.10.2026: birdəfəlik dərslər və cari paket üzrə billing düzəlişi; Codex maintenance',now())",[JSON.stringify({applied,ledgerUnchanged:true,security})]);
    await client.query(dryRun ? "rollback" : "commit");
    return {dryRun,applied,ledgerUnchanged:true,security};
  } catch(error) { await client.query("rollback"); throw error; }
}
