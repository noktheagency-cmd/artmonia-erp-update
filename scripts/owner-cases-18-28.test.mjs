import assert from "node:assert/strict";
import test from "node:test";
import { assertOwnerCaseConfirmations, ownerCaseCodes, reconcileOwnerCases18To28 } from "./reconcile-owner-cases-18-28.mjs";

const approved = {
  connectionString:"postgres://postgres:synthetic@db.xgxlwbqaojbptrgosxtj.supabase.co/postgres",
  requestedBy:"f74ddcf3-fed2-4d36-86e5-5e75ab94f225",
  confirmedSingleIlahaReceipt:true,
  confirmedAydanLegacyWaiver:true,
  confirmedNerminCoverage:true,
  expectedFingerprint:"0".repeat(64),
};
test("maintenance refuses another environment and requires each consequential confirmation", async () => {
  let queries = 0;
  const client = { query:async () => { queries++; throw new Error("Must not connect"); } };
  for (const patch of [
    {connectionString:"postgres://postgres:synthetic@db.other.supabase.co/postgres"},
    {requestedBy:"10000000-0000-4000-8000-000000000001"},
    {confirmedSingleIlahaReceipt:false}, {confirmedAydanLegacyWaiver:false}, {confirmedNerminCoverage:false},
    {expectedFingerprint:""},
  ]) await assert.rejects(reconcileOwnerCases18To28(client,{...approved,...patch}));
  assert.equal(queries,0);
  assert.doesNotThrow(() => assertOwnerCaseConfirmations(approved));
});
test("a stale reviewed snapshot rolls back before audits, DDL, receipts or balances are changed", async () => {
  const queries = [];
  const students = ownerCaseCodes.map((code,index) => ({id:`10000000-0000-4000-8000-${String(index+1).padStart(12,"0")}`,code}));
  const client = {query:async sql => {
    queries.push(sql);
    if (sql.startsWith("select to_jsonb(s)")) return {rows:students.map(row=>({row})),rowCount:students.length};
    if (sql.startsWith("select id from erp.students")) return {rows:students,rowCount:students.length};
    return {rows:[],rowCount:0};
  }};
  await assert.rejects(reconcileOwnerCases18To28(client,approved),/Snapshot changed/);
  assert.equal(queries.at(-1),"rollback");
  assert.equal(queries.some(sql=>/^(insert|update|delete|create|alter)/i.test(sql)),false);
});
test("an already audited operation is a no-op on replay",async()=>{
  const queries=[];
  const client={query:async sql=>{queries.push(sql);return {rows:[],rowCount:sql.startsWith("select 1 from erp.audit_logs")?1:0};}};
  assert.deepEqual(await reconcileOwnerCases18To28(client,approved),{replay:true,dryRun:true});
  assert.equal(queries.at(-1),"rollback");
  assert.equal(queries.some(sql=>/^(insert|update|delete|create|alter)/i.test(sql)),false);
});
