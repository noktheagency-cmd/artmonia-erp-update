import test,{after} from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Prisma,PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { dailyReportSummarySql,dailyReportDetailsSql,dailyReportDetailKinds } from "./daily-report-sql";
import { filteredDailyReportWindow } from "./daily-report-policy";
import type { DailyReportTotals } from "./daily-report-query";
import { recordCourseSalePayment,assertSalePaymentEditable } from "@/modules/students/course-sale-service";
import { companySalesCountSql } from "@/modules/students/sales-metrics-sql";
import { syncLeadWorkPlan } from "@/modules/crm/work-service";
import { lockPaymentStudent,replayPayment,assertAdmissionLeadActor } from "@/modules/students/payment-entry-guard";
import type { ErpActor } from "@/server/auth/actor";

const url=process.env.ARTMONIA_REPORT_TEST_DATABASE_URL;
if(url){const parsed=new URL(url);if(parsed.hostname!=="127.0.0.1"||parsed.port!=="55441"||parsed.pathname!=="/artmonia_stage1_erp")throw new Error("These integration tests only accept the isolated stage1 localhost database.");}
const db=url?new PrismaClient({adapter:new PrismaPg({connectionString:url,max:2})}):null;
after(async()=>{await db?.$disconnect();});
const rollback=new Error("rollback synthetic fixture");
async function fixture(tx:Prisma.TransactionClient) {
 const user=await tx.user.create({data:{fullName:"Synthetic report owner",email:randomUUID()+"@example.invalid"}});
 const other=await tx.user.create({data:{fullName:"Synthetic other owner",email:randomUUID()+"@example.invalid"}});
 const contact=await tx.contact.create({data:{fullName:"Synthetic learner"}});
 const program=await tx.program.create({data:{name:"Synthetic program "+randomUUID(),defaultMonthlyFee:100}});
 const student=await tx.student.create({data:{code:"TEST-"+randomUUID(),contactId:contact.id,managerId:user.id,admissionTracking:true,lifecycleStatus:"SLOT_WAITING",registeredAt:new Date("2026-09-01T00:00:00Z")}});
 const enrollment=await tx.enrollment.create({data:{studentId:student.id,programId:program.id,monthlyFee:100,startDate:new Date("2026-10-10T00:00:00Z")}});
 const lead=await tx.lead.create({data:{contactId:contact.id,managerId:user.id,programInterestId:program.id,stage:"CONTACTED",convertedStudentId:student.id,createdAt:new Date("2026-10-10T05:00:00Z"),nextFollowUpAt:new Date("2026-10-10T08:00:00Z"),nextActionType:"PAYMENT_REMINDER"}});
 return {user,other,contact,program,student,enrollment,lead};
}
type Fixture=Awaited<ReturnType<typeof fixture>>;
async function isolated(run:(tx:Prisma.TransactionClient,f:Fixture)=>Promise<void>){
 assert.ok(db);
 try{await db.$transaction(async tx=>{await run(tx,await fixture(tx));throw rollback;},{timeout:30000});}catch(error){if(error!==rollback)throw error;}
}
const window=(date="2026-10-10",managerId?:string)=>filteredDailyReportWindow({from:date,to:date,managerId},new Date("2026-10-12T12:00:00Z"));
const totals=async(tx:Prisma.TransactionClient,date="2026-10-10",managerId?:string)=>(await tx.$queryRaw<DailyReportTotals[]>(dailyReportSummarySql(window(date,managerId))))[0];
async function payment(tx:Prisma.TransactionClient,f:Fixture,amount:number,date="2026-10-10",purpose:"ADMISSION"|"INITIAL_BALANCE"|"RENEWAL"|"ONE_OFF"|"OTHER"="ADMISSION",signed=true){
 const row=await tx.payment.create({data:{studentId:f.student.id,amount,paidAt:new Date(date+"T00:00:00Z"),paymentMonth:new Date("2026-10-01T00:00:00Z"),createdById:f.user.id,idempotencyKey:randomUUID()}});
 await recordCourseSalePayment(tx,{studentId:f.student.id,paymentId:row.id,purpose,contractConfirmed:signed,actorId:f.user.id});
 return row;
}
test("report counts factual unique contacts and operations; stage changes never create conversations",{skip:!url},()=>isolated(async(tx,f)=>{
 const fresh=await tx.contact.create({data:{fullName:"Synthetic unworked"}});
 await tx.lead.create({data:{contactId:fresh.id,managerId:f.user.id,stage:"QUALIFIED",createdAt:new Date("2026-10-10T08:00:00Z")}});
 const old=await tx.contact.create({data:{fullName:"Synthetic earlier lead"}});
 const oldLead=await tx.lead.create({data:{contactId:old.id,managerId:f.user.id,stage:"CONTACTED",createdAt:new Date("2026-10-09T08:00:00Z")}});
 await tx.leadStageHistory.create({data:{leadId:oldLead.id,oldStage:"NEW",newStage:"CONTACTED",changedById:f.user.id,createdAt:new Date("2026-10-10T07:00:00Z")}});
 let t=await totals(tx);assert.equal(t.contacted,0);assert.equal(t.unworked,2);
 for(const [leadId,contactId,outcome] of [[f.lead.id,f.contact.id,"UNANSWERED"],[f.lead.id,f.contact.id,"UNANSWERED"],[f.lead.id,f.contact.id,"TALKED"],[oldLead.id,old.id,"TALKED"],[oldLead.id,old.id,"TALKED"]])await tx.leadContactEvent.create({data:{leadId,contactId,actorId:f.user.id,channel:"PHONE",outcome,occurredAt:new Date("2026-10-10T09:00:00Z"),idempotencyKey:randomUUID()}});
 t=await totals(tx);assert.equal(t.leads,2);assert.equal(t.contacted,2);assert.equal(t.contactOps,5);assert.equal(t.newContacted,1);assert.equal(t.oldContacted,1);assert.equal(t.unanswered,0);assert.equal(t.unworked,1);
 assert.equal((await totals(tx,"2026-10-10",f.other.id)).contactOps,0);
 for(const kind of dailyReportDetailKinds)assert.ok(Array.isArray(await tx.$queryRaw(dailyReportDetailsSql(window(),kind,0))));
}));
test("replanning preserves previous day overdue and records overdue replanning",{skip:!url},()=>isolated(async(tx,f)=>{
 await tx.leadWorkItem.create({data:{leadId:f.lead.id,ownerId:f.user.id,kind:"CALL",plannedAt:new Date("2026-10-09T08:00:00Z"),createdAt:new Date("2026-10-08T08:00:00Z")}});
 await syncLeadWorkPlan(tx,{leadId:f.lead.id,ownerId:f.user.id,kind:"CALL",plannedAt:new Date("2026-10-11T08:00:00Z")},new Date("2026-10-10T08:00:00Z"));
 // The new plan's recorded creation is synthetic too.
 await tx.leadWorkItem.updateMany({where:{leadId:f.lead.id,cancelledAt:null},data:{createdAt:new Date("2026-10-10T08:00:00Z")}});
 assert.equal((await totals(tx,"2026-10-09")).overdue,1);
 const t=await totals(tx);assert.equal(t.overdue,0);assert.equal(t.overdueReplanned,1);assert.equal(t.tomorrow,1);
}));
test("appointment plan, creation and actual result dates remain separate",{skip:!url},()=>isolated(async(tx,f)=>{
 await tx.crmAppointment.create({data:{leadId:f.lead.id,ownerId:f.user.id,kind:"CONSULTATION",plannedAt:new Date("2026-10-10T08:00:00Z"),createdAt:new Date("2026-10-08T08:00:00Z"),outcome:"ATTENDED",occurredAt:new Date("2026-10-11T08:00:00Z"),idempotencyKey:randomUUID()}});
 const old=await tx.crmAppointment.create({data:{leadId:f.lead.id,ownerId:f.user.id,kind:"TRIAL",plannedAt:new Date("2026-10-10T09:00:00Z"),createdAt:new Date("2026-10-08T08:00:00Z"),outcome:"RESCHEDULED",reason:"Synthetic reschedule",idempotencyKey:randomUUID()}});
 await tx.crmAppointment.create({data:{leadId:f.lead.id,ownerId:f.user.id,kind:"TRIAL",plannedAt:new Date("2026-10-12T09:00:00Z"),createdAt:new Date("2026-10-10T08:00:00Z"),previousId:old.id,idempotencyKey:randomUUID()}});
 const t=await totals(tx);assert.equal(t.scheduled,2);assert.equal(t.attended,0);assert.equal(t.rescheduled,1);assert.equal(t.appointmentCreated,1);
 assert.equal((await totals(tx,"2026-10-11")).attended,1);
}));
test("deposit qualifies once on paid date; balance and renewals add cash without another sale",{skip:!url},()=>isolated(async(tx,f)=>{
 assert.equal((await totals(tx)).sales,0);
 const plan=await tx.leadWorkItem.create({data:{leadId:f.lead.id,ownerId:f.user.id,kind:"CALL",source:"PRIMARY",plannedAt:new Date("2026-10-11T08:00:00Z")}});
 const meeting=await tx.leadWorkItem.create({data:{leadId:f.lead.id,ownerId:f.user.id,kind:"APPOINTMENT",source:"APPOINTMENT",plannedAt:new Date("2026-10-11T09:00:00Z")}});
 const p=await payment(tx,f,20);await recordCourseSalePayment(tx,{studentId:f.student.id,paymentId:p.id,purpose:"ADMISSION",contractConfirmed:true,actorId:f.user.id});
 assert.ok((await tx.leadWorkItem.findUniqueOrThrow({where:{id:plan.id}})).cancelledAt);
 assert.equal((await tx.leadWorkItem.findUniqueOrThrow({where:{id:meeting.id}})).cancelledAt,null);
 const closedLead=await tx.lead.findUniqueOrThrow({where:{id:f.lead.id}});
 assert.equal(closedLead.stage,"REGISTERED");
 assert.equal(closedLead.nextFollowUpAt,null);
 assert.equal(closedLead.nextActionType,null);
 const openFollowUps=await tx.$queryRaw<{count:number}[]>`
   select count(*)::int as count from erp.leads l
   where l.id=${f.lead.id}::uuid
     and l.stage not in ('REGISTERED'::"erp"."LeadStage",'LOST'::"erp"."LeadStage")
     and l.next_follow_up_at is not null`;
 assert.equal(openFollowUps[0].count,0);
 await payment(tx,f,80,"2026-10-11","INITIAL_BALANCE");
 await payment(tx,f,100,"2026-10-11","RENEWAL");
 assert.equal(await tx.courseSale.count(),1);assert.equal((await tx.courseSale.findFirstOrThrow()).status,"COMPLETE");
 assert.equal((await totals(tx)).sales,1);assert.equal((await totals(tx)).deposit,"20.00");
 const t=await totals(tx,"2026-10-11");assert.equal(t.sales,0);assert.equal(t.balance,"80.00");assert.equal(t.renewal,"100.00");assert.equal(t.payments,"180.00");
 await assert.rejects(()=>assertSalePaymentEditable(tx,p.id));
}));
test("STOPPED return can qualify in slot waiting; freeze and completion returns cannot",{skip:!url},()=>isolated(async(tx,f)=>{
 await tx.student.update({where:{id:f.student.id},data:{admissionTracking:false}});
 await tx.studentStatusHistory.create({data:{studentId:f.student.id,oldStatus:"STOPPED",newStatus:"SLOT_WAITING",eventType:"REACTIVATED",effectiveAt:new Date("2026-10-10T00:00:00Z"),reason:"Synthetic return",changedById:f.user.id}});
 await payment(tx,f,20);
 assert.equal((await totals(tx)).returnSales,1);assert.equal((await totals(tx)).sales,1);
 const sale=await tx.courseSale.findFirstOrThrow();
 assert.equal(sale.kind,"RETURN");
 // Company / HR KPI newSales uses the same course_sales window (includes RETURN).
 const [kpi]=await tx.$queryRaw<{count:number}[]>`select ${companySalesCountSql(Prisma.sql`${"2026-10-01"}`,Prisma.sql`${"2026-11-01"}`)} as count`;
 assert.equal(kpi.count,1);
 for(const oldStatus of ["FROZEN","COMPLETED"] as const) {
  await tx.studentStatusHistory.create({data:{studentId:f.student.id,oldStatus,newStatus:"SLOT_WAITING",eventType:"REACTIVATED",effectiveAt:new Date("2026-10-11T00:00:00Z"),reason:"Synthetic lifecycle",changedById:f.user.id}});
  await assert.rejects(()=>payment(tx,f,20,"2026-10-11"));
 }
}));
test("cancellation removes the KPI at its effective cutoff and retains actual cash",{skip:!url},()=>isolated(async(tx,f)=>{
 await payment(tx,f,20);
 const sale=await tx.courseSale.findFirstOrThrow();
 await tx.courseSale.update({where:{id:sale.id},data:{status:"CANCELLED",cancelledAt:new Date("2026-10-11T08:00:00Z"),cancellationReason:"Synthetic cancellation"}});
 assert.equal((await totals(tx)).sales,1);
 const w=filteredDailyReportWindow({from:"2026-10-10",to:"2026-10-11"},new Date("2026-10-12T12:00:00Z"));
 const t=(await tx.$queryRaw<DailyReportTotals[]>(dailyReportSummarySql(w)))[0];
 assert.equal(t.sales,0);assert.equal(t.originalSales,1);assert.equal(t.cancelledSales,1);assert.equal(t.payments,"20.00");
}));
test("payments, workshop money and unknown old money reconcile without inventing sales",{skip:!url},()=>isolated(async(tx,f)=>{
 await tx.payment.create({data:{studentId:f.student.id,amount:"12.34",paidAt:new Date("2026-10-10T00:00:00Z"),paymentMonth:new Date("2026-10-01T00:00:00Z"),createdById:f.user.id}});
 await payment(tx,f,15,"2026-10-10","ONE_OFF");
 const event=await tx.workshopEvent.create({data:{title:"Synthetic workshop",eventDate:new Date("2026-10-10T00:00:00Z"),startTime:"12:00"}});
 const participant=await tx.workshopParticipant.create({data:{eventId:event.id,fullName:"Synthetic workshop guest"}});
 await tx.workshopPayment.create({data:{eventId:event.id,participantId:participant.id,amount:"25.66",paidAt:new Date("2026-10-10T00:00:00Z"),createdById:f.user.id}});
 const t=await totals(tx);assert.equal(t.sales,0);assert.equal(t.unclassified,"12.34");assert.equal(t.oneOff,"15.00");assert.equal(t.other,"25.66");assert.equal(t.payments,"38.00");
}));
test("assigned payment and admission access deny another manager and replay rejects changed money",{skip:!url},()=>isolated(async(tx,f)=>{
 const actor:ErpActor={id:f.other.id,authUserId:null,currentSessionId:null,fullName:"Synthetic actor",email:"synthetic@example.invalid",profilePhotoUrl:null,roles:[],permissions:new Map([["billing.payment.create","ASSIGNED"],["crm.lead.read","ALL"],["crm.lead.convert","ASSIGNED"]])};
 await assert.rejects(()=>lockPaymentStudent(tx,actor,f.student.id));
 await assert.rejects(()=>assertAdmissionLeadActor(tx,actor,f.lead.id));
 actor.id=f.user.id;await lockPaymentStudent(tx,actor,f.student.id);
 const p=await payment(tx,f,20);
 const input={studentId:f.student.id,idempotencyKey:p.idempotencyKey!,amount:20,paidAt:p.paidAt,method:p.method,scheduleType:p.scheduleType,receiptPurpose:"ADMISSION",actorId:f.user.id};
 assert.equal((await replayPayment(tx,input))?.id,p.id);
 await assert.rejects(()=>replayPayment(tx,{...input,amount:21}));
}));
test("private report tables keep RLS enabled; database blocks deletion and refund bypass",{skip:!url},()=>isolated(async(tx,f)=>{
 const rows=await tx.$queryRaw<{name:string;enabled:boolean}[]>`select relname name,relrowsecurity enabled from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='erp' and relname in ('lead_contact_events','lead_work_items','crm_appointments','course_sales')`;
 assert.equal(rows.length,4);assert.ok(rows.every(r=>r.enabled));
 const p=await payment(tx,f,20);
 await tx.$executeRawUnsafe("SAVEPOINT cash_guard");
 await assert.rejects(()=>tx.payment.delete({where:{id:p.id}}));
 await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT cash_guard");
 await tx.$executeRawUnsafe("SAVEPOINT refund_guard");
 await assert.rejects(()=>tx.refundAdjustment.create({data:{studentId:f.student.id,paymentId:p.id,amount:20,reason:"Synthetic blocked refund"}}));
 await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT refund_guard");
}));

test("non-admission cash remains deletable through existing financial flows",{skip:!url},()=>isolated(async(tx,f)=>{
 const p=await tx.payment.create({data:{studentId:f.student.id,amount:20,paidAt:new Date("2026-10-10T00:00:00Z"),paymentMonth:new Date("2026-10-01T00:00:00Z"),createdById:f.user.id}});
 await tx.payment.delete({where:{id:p.id}});
 assert.equal(await tx.payment.count({where:{id:p.id}}),0);
}));

test("invalid admission payment rolls back both cash and sale; legacy facts are never promoted",{skip:!url},()=>isolated(async(tx,f)=>{
 for(const [amount,signed] of [[10,true],[20,false]] as const) {
  await tx.$executeRawUnsafe("SAVEPOINT invalid_admission");
  await assert.rejects(()=>payment(tx,f,amount,"2026-10-10","ADMISSION",signed));
  await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT invalid_admission");
  assert.equal(await tx.payment.count(),0);assert.equal(await tx.courseSale.count(),0);
 }
 await tx.student.update({where:{id:f.student.id},data:{admissionTracking:false}});
 await assert.rejects(()=>payment(tx,f,20));
 assert.equal(await tx.courseSale.count(),0);
}));
test("return route belongs to the current CRM admission, never the original old lead",{skip:!url},()=>isolated(async(tx,f)=>{
 await tx.studentStatusHistory.create({data:{studentId:f.student.id,oldStatus:"STOPPED",newStatus:"SLOT_WAITING",eventType:"REACTIVATED",effectiveAt:new Date("2026-10-10T00:00:00Z"),changedById:f.user.id,reason:"Synthetic return"}});
 const current=await tx.lead.create({data:{contactId:f.contact.id,managerId:f.user.id,stage:"CONTACTED",createdAt:new Date("2026-10-10T09:00:00Z"),nextFollowUpAt:new Date("2026-10-10T12:00:00Z"),nextActionType:"FOLLOW_UP"}});
 const p=await tx.payment.create({data:{studentId:f.student.id,amount:20,paidAt:new Date("2026-10-10T00:00:00Z"),paymentMonth:new Date("2026-10-01T00:00:00Z"),createdById:f.user.id}});
 await recordCourseSalePayment(tx,{studentId:f.student.id,paymentId:p.id,purpose:"ADMISSION",contractConfirmed:true,actorId:f.user.id,admissionLeadId:current.id});
 const sale=await tx.courseSale.findFirstOrThrow();assert.equal(sale.kind,"RETURN");assert.equal(sale.route,"CRM");assert.equal(sale.leadId,current.id);
 const closed=await tx.lead.findUniqueOrThrow({where:{id:current.id}});
 assert.equal(closed.stage,"REGISTERED");
 assert.equal(closed.nextFollowUpAt,null);
 assert.equal(closed.nextActionType,null);
 assert.equal((await totals(tx)).crmSales,1);
 assert.equal((await totals(tx)).returnSales,1);
}));
test("lifecycle uses effective date, deduplicates each status, and excludes synthetic test students",{skip:!url},()=>isolated(async(tx,f)=>{
 for(const status of ["FROZEN","FROZEN","STOPPED"] as const)await tx.studentStatusHistory.create({data:{studentId:f.student.id,oldStatus:"ACTIVE",newStatus:status,effectiveAt:new Date("2026-10-10T00:00:00Z"),changedById:f.user.id,reason:"Synthetic lifecycle",createdAt:new Date("2026-10-09T08:00:00Z")}});
 const t=await totals(tx);assert.equal(t.frozen,1);assert.equal(t.stopped,1);
 await payment(tx,f,20);await tx.student.update({where:{id:f.student.id},data:{isTestData:true}});
 const hidden=await totals(tx);assert.equal(hidden.frozen,0);assert.equal(hidden.stopped,0);assert.equal(hidden.sales,0);assert.equal(hidden.payments,"0");
}));

test("legacy migration preserves known tasks and cash without inferring actual conversations or sale eligibility",{skip:!url},()=>isolated(async(tx,f)=>{
 const {readFile}=await import("node:fs/promises");
 const source=await readFile("prisma/migrations/20261010120000_daily_sales_facts/migration.sql","utf8");
 const statements=source.match(/INSERT INTO erp\.[\s\S]+?;/g)??[];
 assert.equal(statements.length,3);
 await tx.lead.update({where:{id:f.lead.id},data:{createdAt:new Date("2026-10-08T08:00:00Z"),nextFollowUpAt:new Date("2026-10-09T08:00:00Z"),nextActionType:"CALL"}});
 await tx.task.create({data:{title:"Synthetic old completed follow-up",type:"lead_follow_up",entityType:"lead",entityId:f.lead.id,ownerUserId:f.user.id,createdById:f.user.id,status:"DONE",createdAt:new Date("2026-10-08T08:00:00Z"),dueAt:new Date("2026-10-09T08:00:00Z"),completedAt:new Date("2026-10-10T08:00:00Z")}});
 await tx.task.create({data:{title:"Synthetic old trial",type:"lead_appointment",entityType:"lead",entityId:f.lead.id,ownerUserId:f.user.id,createdById:f.user.id,status:"DONE",description:"TRIAL",completionNote:"ATTENDED",createdAt:new Date("2026-10-08T08:00:00Z"),dueAt:new Date("2026-10-10T08:00:00Z")}});
 const cash=await tx.payment.create({data:{studentId:f.student.id,amount:"12.34",paidAt:new Date("2026-10-10T00:00:00Z"),paymentMonth:new Date("2026-10-01T00:00:00Z"),createdById:f.user.id}});
 for(const statement of statements)await tx.$executeRawUnsafe(statement);
 assert.equal(await tx.leadContactEvent.count(),0);assert.equal(await tx.courseSale.count(),0);
 const legacy=await tx.crmAppointment.findFirstOrThrow();assert.equal(legacy.isLegacy,true);assert.equal(legacy.occurredAt,null);assert.equal(legacy.outcome,"ATTENDED");
 const money=await tx.payment.findUniqueOrThrow({where:{id:cash.id}});assert.equal(money.receiptPurpose,"UNCLASSIFIED");assert.equal(money.amount.toString(),"12.34");
 assert.equal((await totals(tx)).completed,1);assert.equal((await totals(tx)).legacyAppointments,1);assert.equal((await totals(tx)).attended,0);
 const primary=await tx.leadWorkItem.findFirstOrThrow({where:{source:"PRIMARY"}});assert.equal(primary.isLegacy,true);assert.ok(primary.createdAt>new Date("2026-10-09T20:00:00Z"));
}));
