import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@/generated/prisma/client";
import { bookSingleLesson,markSingleLesson,paySingleLesson } from "./single-lesson-service";
import { assertSingleLessonAttendance } from "./single-lesson-policy";
import type { EffectivePermissions,PermissionCode } from "@/server/rbac/permissions";
import { currentBakuDateValue } from "@/lib/baku-date";

const actor = (codes:PermissionCode[],scope:"ALL"|"ASSIGNED"="ALL")=>({id:"actor",permissions:new Map(codes.map(code=>[code,scope])) as EffectivePermissions});
test("new pay-per-visit learner creates one profile without an enrollment and replay rechecks ownership",async()=>{
  let saved:Record<string,unknown>|null=null;
  let profiles=0,lessons=0,manager="actor";
  const tx={$executeRaw:async()=>1,$queryRaw:async(sql:Prisma.Sql)=>sql.sql.includes("nextval")?[{value:9999n}]:[],
    singleLesson:{findUnique:async()=>saved,create:async({data}:{data:Record<string,unknown>})=>{lessons++;saved=data;return data;}},
    teacher:{findUnique:async()=>({id:"44444444-4444-4444-8444-444444444444"})},program:{findUnique:async()=>({id:"33333333-3333-4333-8333-333333333333"})},
    student:{findFirst:async()=>null,create:async({data}:{data:Record<string,unknown>})=>{profiles++;assert.equal(data.billingPaused,true);return{id:"student",managerId:manager};},findUnique:async()=>({managerId:manager})},
    contact:{create:async()=>({id:"contact"})},studentStatusHistory:{create:async()=>({})},auditLog:{create:async()=>({})},
  } as unknown as Prisma.TransactionClient;
  const input={requestId:"11111111-1111-4111-8111-111111111111",fullName:"Synthetic learner",phone:"0501234567",programId:"33333333-3333-4333-8333-333333333333",teacherId:"44444444-4444-4444-8444-444444444444",date:currentBakuDateValue(),time:"15:00",duration:120,room:"A",price:"25.00"};
  const creator=actor(["student.create","student.read"],"ASSIGNED");
  await bookSingleLesson(tx,input,creator);await bookSingleLesson(tx,input,creator);
  assert.equal(profiles,1);assert.equal(lessons,1);
  manager="other";await assert.rejects(bookSingleLesson(tx,input,creator),/tələbə üzrə icazəniz/);
});
test("single lesson booking rejects permission and stale replay before writes",async()=>{
  const raw={requestId:"11111111-1111-4111-8111-111111111111",studentId:"22222222-2222-4222-8222-222222222222",programId:"33333333-3333-4333-8333-333333333333",teacherId:"44444444-4444-4444-8444-444444444444",date:currentBakuDateValue(),time:"15:00",duration:120,room:"A",price:"25.00"};
  const tx={$executeRaw:async()=>1,$queryRaw:async()=>[],singleLesson:{findUnique:async()=>({createdById:"other",requestHash:"wrong"})}} as unknown as Prisma.TransactionClient;
  await assert.rejects(bookSingleLesson(tx,raw,actor([])),/icazəniz yoxdur/);
  await assert.rejects(bookSingleLesson(tx,raw,actor(["student.update"])),/məlumatları fərqlidir/);
});
test("teacher cannot mark another teacher's lesson",async()=>{
  const tx={$queryRaw:async()=>[],singleLesson:{findUnique:async()=>({studentId:"student"}),findUniqueOrThrow:async()=>({id:"lesson",teacher:{userId:"other"}})}} as unknown as Prisma.TransactionClient;
  await assert.rejects(markSingleLesson(tx,{lessonId:"lesson",status:"ATTENDED"},actor(["attendance.manage"],"ASSIGNED")),/öz dərsinizin/);
});
test("single attendance is final, replay-safe and cannot be marked in the future",()=>{
  assert.doesNotThrow(()=>assertSingleLessonAttendance("ATTENDED","ATTENDED","2026-10-04","2026-10-25"));
  assert.throws(()=>assertSingleLessonAttendance("ATTENDED","ABSENT","2026-10-04","2026-10-25"),/artıq/);
  assert.throws(()=>assertSingleLessonAttendance("RESERVED","ATTENDED","2026-11-01","2026-10-25"),/Gələcək/);
  assert.doesNotThrow(()=>assertSingleLessonAttendance("RESERVED","CANCELLED","2026-11-01","2026-10-25"));
});
test("pay-per-visit cash pays only its own invoice; no enrollment, next-payment or course sale writes",async()=>{
  const writes:Array<{table:string;data:Record<string,unknown>}> = [];
  const date=currentBakuDateValue();
  let payment: {id:string;idempotencyKey:string;method:string;paidAt:Date}|null=null;
  const tx={$queryRaw:async()=>[],singleLesson:{findUnique:async()=>({studentId:"student"}),findUniqueOrThrow:async()=>({id:"lesson",studentId:"student",student:{managerId:"actor"},teacher:{userId:"teacher"},lessonDate:new Date(date),price:new Prisma.Decimal(25),status:"RESERVED",invoiceId:null,paymentId:payment?.id,payment}),update:async({data}:{data:Record<string,unknown>})=>{writes.push({table:"lesson",data});}},
    invoice:{create:async({data}:{data:Record<string,unknown>})=>{writes.push({table:"invoice",data});return{id:"own-invoice"};},update:async({data}:{data:Record<string,unknown>})=>{writes.push({table:"invoice",data});}},
    payment:{create:async({data}:{data:Record<string,unknown>})=>{writes.push({table:"payment",data});payment={id:"own-payment",idempotencyKey:String(data.idempotencyKey),method:String(data.method),paidAt:data.paidAt as Date};return payment;}},
    paymentAllocation:{create:async({data}:{data:Record<string,unknown>})=>{writes.push({table:"allocation",data});}},auditLog:{create:async()=>({})},
  } as unknown as Prisma.TransactionClient;
  const input={lessonId:"lesson",requestId:"request",paidDate:date,method:"CASH" as const};
  const payer=actor(["billing.payment.create","student.read"]);
  await paySingleLesson(tx,input,payer); const count=writes.length; await paySingleLesson(tx,input,payer);
  assert.equal(writes.length,count);
  const cash=writes.find(w=>w.table==="payment")!.data;
  assert.equal(cash.receiptPurpose,"ONE_OFF");assert.equal(cash.scheduleType,"ONE_TIME");assert.equal(cash.nextPaymentAt,null);
  assert.equal(writes.find(w=>w.table==="invoice")!.data.enrollmentId,null);
  assert.equal(writes.find(w=>w.table==="allocation")!.data.invoiceId,"own-invoice");
  await assert.rejects(paySingleLesson(tx,{...input,method:"CARD"},payer),/artıq/);
});
test("payment permission alone does not allow paying another manager's student",async()=>{
  const tx={$queryRaw:async()=>[],singleLesson:{findUnique:async()=>({studentId:"student"}),findUniqueOrThrow:async()=>({student:{managerId:"other"}})}} as unknown as Prisma.TransactionClient;
  await assert.rejects(paySingleLesson(tx,{lessonId:"lesson",requestId:"request",paidDate:currentBakuDateValue(),method:"CASH"},actor(["student.read","billing.payment.create"],"ASSIGNED")),/tələbə üzrə icazəniz/);
});
