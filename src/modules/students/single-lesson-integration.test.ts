import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma,PrismaClient } from "@/generated/prisma/client";
import { bookSingleLesson,markSingleLesson,paySingleLesson } from "./single-lesson-service";
import { currentBakuDateValue } from "@/lib/baku-date";
import { buildStudentNextPaymentDateSql } from "./student-billing-sql";
import type { EffectivePermissions,PermissionCode } from "@/server/rbac/permissions";

test("pay-per-visit booking, attendance, payment and replay keep monthly billing closed",{skip:process.env.RUN_SINGLE_LESSON_DB_TESTS!=="1"},async()=>{
  const prisma=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL,max:1})});
  const rollback=new Error("synthetic rollback");
  try {
    await assert.rejects(prisma.$transaction(async tx=>{
      const id=randomUUID();
      const user=await tx.user.create({data:{fullName:"Synthetic operator",email:`${id}@example.invalid`}});
      const teacher=await tx.teacher.create({data:{fullName:`Synthetic teacher ${id}`}});
      const program=await tx.program.create({data:{name:`Synthetic program ${id}`}});
      const contact=await tx.contact.create({data:{fullName:"Synthetic learner"}});
      const student=await tx.student.create({data:{code:`SYNTH-${id}`,contactId:contact.id,managerId:user.id,registeredAt:new Date(currentBakuDateValue()),lifecycleStatus:"SLOT_WAITING",billingPaused:true}});
      const actor={id:user.id,permissions:new Map<PermissionCode,"ALL">(["student.read","student.update","attendance.manage","billing.payment.create"].map(p=>[p as PermissionCode,"ALL"])) as EffectivePermissions};
      const input={requestId:randomUUID(),studentId:student.id,teacherId:teacher.id,programId:program.id,date:currentBakuDateValue(),time:"15:00",duration:120,room:"Synthetic",price:"25.00"};
      const lesson=await bookSingleLesson(tx,input,actor);
      assert.equal((await bookSingleLesson(tx,input,actor)).id,lesson.id);
      await markSingleLesson(tx,{lessonId:lesson.id,status:"ATTENDED"},actor);
      await markSingleLesson(tx,{lessonId:lesson.id,status:"ATTENDED"},actor);
      const payment={lessonId:lesson.id,requestId:randomUUID(),paidDate:currentBakuDateValue(),method:"CASH" as const};
      await paySingleLesson(tx,payment,actor); await paySingleLesson(tx,payment,actor);
      assert.equal(await tx.singleLesson.count({where:{studentId:student.id}}),1);
      assert.equal(await tx.enrollment.count({where:{studentId:student.id}}),0);
      assert.equal(await tx.courseSale.count({where:{studentId:student.id}}),0);
      assert.equal(await tx.studentBillingCycle.count({where:{studentId:student.id}}),0);
      const invoices=await tx.invoice.findMany({where:{studentId:student.id}});
      assert.equal(invoices.length,1); assert.equal(invoices[0].balanceDue.toFixed(2),"0.00");assert.equal(invoices[0].enrollmentId,null);
      const receipts=await tx.payment.findMany({where:{studentId:student.id}});
      assert.equal(receipts.length,1);assert.equal(receipts[0].receiptPurpose,"ONE_OFF");assert.equal(receipts[0].nextPaymentAt,null);
      const final=await tx.student.findUniqueOrThrow({where:{id:student.id}});
      assert.equal(final.lifecycleStatus,"SLOT_WAITING");assert.equal(final.billingPaused,true);assert.equal(final.billingAnchorDate,null);
      // A prepaid future single visit must not advance an existing monthly student's next month.
      const today=new Date(currentBakuDateValue());
      await tx.student.update({where:{id:student.id},data:{lifecycleStatus:"ACTIVE",billingPaused:false,billingAnchorDate:today}});
      const enrollment=await tx.enrollment.create({data:{studentId:student.id,teacherId:teacher.id,programId:program.id,status:"ACTIVE",startDate:today,firstLessonAt:today,monthlyFee:149}});
      await tx.invoice.create({data:{studentId:student.id,enrollmentId:enrollment.id,periodMonth:new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),1)),issueDate:today,dueDate:today,amount:149,balanceDue:0,status:"PAID"}});
      const nextDateSql=Prisma.sql`select ${buildStudentNextPaymentDateSql(Prisma.sql`${student.id}::uuid`)} as date`;
      const before=(await tx.$queryRaw<Array<{date:Date}>>(nextDateSql))[0].date.toISOString();
      const future=await bookSingleLesson(tx,{...input,requestId:randomUUID(),date:new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth()+2,1)).toISOString().slice(0,10)},actor);
      await paySingleLesson(tx,{...payment,lessonId:future.id,requestId:randomUUID()},actor);
      assert.equal((await tx.$queryRaw<Array<{date:Date}>>(nextDateSql))[0].date.toISOString(),before);
      throw rollback;
    },{timeout:20000}),error=>error===rollback);
  } finally { await prisma.$disconnect(); }
});
