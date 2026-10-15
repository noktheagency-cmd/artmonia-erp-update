import test from "node:test";import assert from "node:assert/strict";
import { Prisma } from "@/generated/prisma/client";
import { admissionCycle,assertAdmissionPayment,assertDepositCancellation } from "./course-sale-policy";
test("sale requires a signed contract and one qualifying payment, including the exact threshold",()=>{
 for(const amount of ["0","10","19.99"])assert.throws(()=>assertAdmissionPayment(new Prisma.Decimal(amount),true));
 assert.throws(()=>assertAdmissionPayment(new Prisma.Decimal(20),false));
 assert.doesNotThrow(()=>assertAdmissionPayment(new Prisma.Decimal(20),true));
});
test("only STOPPED returns create a new admission cycle; legacy admissions are not inferred",()=>{
 const input={studentId:"student",admissionTracking:true};
 assert.equal(admissionCycle(input).key,"new:student");
 assert.equal(admissionCycle({...input,returnId:"return",oldStatus:"STOPPED"}).key,"return:return");
 for(const status of ["FROZEN","COMPLETED","DECLINED","ACTIVE"])assert.throws(()=>admissionCycle({...input,returnId:"return",oldStatus:status}));
 assert.throws(()=>admissionCycle({...input,admissionTracking:false}));
});
test("cancellation stops at the first full fee, retaining decimal boundaries",()=>{
 const fee=new Prisma.Decimal(100);
 assert.doesNotThrow(()=>assertDepositCancellation(new Prisma.Decimal("99.99"),fee,"DEPOSIT"));
 for(const paid of [100,101])assert.throws(()=>assertDepositCancellation(new Prisma.Decimal(paid),fee,"DEPOSIT"));
 for(const status of ["COMPLETE","CANCELLED"])assert.throws(()=>assertDepositCancellation(new Prisma.Decimal(20),fee,status));
});
