import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@/generated/prisma/client";
import { resolveStudentEducationLevel } from "./education-level-service";
const tx=(values:string[])=>({dropdownCatalogOption:{findUnique:async()=>null,findMany:async()=>values.map(value=>({value}))}}) as unknown as Prisma.TransactionClient;
test("legacy İşləyir resolves to the unique active catalog value during registration",async()=>{
  assert.deepEqual(await resolveStudentEducationLevel(tx(["işləyir","Orta təhsil alır"]),"İşləyir"),{value:"işləyir",isActive:true});
});
test("a profile rename preserves even a removed historical education value",async()=>{
  assert.deepEqual(await resolveStudentEducationLevel({} as Prisma.TransactionClient,"Tarixi pillə","Tarixi pillə"),{value:"Tarixi pillə",isActive:false});
});
test("unknown and ambiguous education names cannot create or select a catalog option",async()=>{
  await assert.rejects(resolveStudentEducationLevel(tx(["Orta təhsil alır"]),"Naməlum"),/yenidən seçin/);
  await assert.rejects(resolveStudentEducationLevel(tx(["işləyir","İŞLƏYİR"]),"isleyir"),/yenidən seçin/);
  assert.equal(await resolveStudentEducationLevel(tx([]),undefined),null);
});
