import assert from "node:assert/strict";
import test from "node:test";
import { assertCorrectionTarget,applyOwnerCases } from "./reconcile-owner-student-cases.mjs";
import { reconcileConfirmedMaticaReturn } from "./reconcile-confirmed-matica-return.mjs";
import { applyReviewedCaseMigrations } from "./apply-reviewed-vercel-case-migrations.mjs";
const url="postgresql://postgres.xgxlwbqaojbptrgosxtj:synthetic@aws-1-eu-west-1.pooler.supabase.com:6543/postgres";
test("maintenance rejects another project and a lookalike target host",()=>{
  assert.doesNotThrow(()=>assertCorrectionTarget(url));
  assert.throws(()=>assertCorrectionTarget(url.replace("xgxlwbqaojbptrgosxtj","unapprovedproject")),/identified Vercel/);
  assert.throws(()=>assertCorrectionTarget(url.replace("pooler.supabase.com","example.invalid")),/identified Vercel/);
});
test("unconfirmed cash and unexpected migration plans fail before touching the database",async()=>{
  let calls=0;const client={query:async()=>{calls++;return{rows:[]};}};
  await assert.rejects(applyOwnerCases(client,{connectionString:url,expectedFingerprint:"unused",confirmedHeydarCash:false}),/explicit owner/);
  await assert.rejects(reconcileConfirmedMaticaReturn(client,{connectionString:url,expectedFingerprint:"unused",ownerConfirmedTotal:"158.00"}),/Explicit owner/);
  await assert.rejects(applyReviewedCaseMigrations(client,url,[]),/Unexpected migration/);
  assert.equal(calls,0);
});
test("a stale owner-case snapshot rolls back before any ledger mutation",async()=>{
  const queries=[];
  const client={query:async sql=>{queries.push(sql);return{rows:[],rowCount:0};}};
  await assert.rejects(applyOwnerCases(client,{connectionString:url,expectedFingerprint:"stale",confirmedHeydarCash:true}),/Snapshot changed/);
  assert.equal(queries.at(-1),"rollback");
  assert.equal(queries.some(sql=>/^\s*(insert|update|delete)\b/i.test(sql)),false);
});
