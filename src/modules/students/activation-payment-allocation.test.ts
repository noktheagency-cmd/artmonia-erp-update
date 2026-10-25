import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@/generated/prisma/client";
import { allocateActivationPayments } from "./activation-payment-allocation";

test("paid admission is allocated once when its first actual lesson opens billing", async () => {
  const writes: Array<{payment:string;amount:string}> = [];
  let balance = new Prisma.Decimal(149);
  const payments = [50,99].map((amount,index)=>({id:`payment-${index}`,amount:new Prisma.Decimal(amount),allocations:[] as Array<{invoiceId:string;amountAllocated:Prisma.Decimal}>}));
  const tx = {
    payment:{findMany:async ({where}:{where:Prisma.PaymentWhereInput})=>{
      assert.deepEqual(where.courseSale,{is:{studentId:"student",enrollmentId:"current",status:"COMPLETE",cancelledAt:null}});
      assert.equal(where.refundedAt,null); return payments;
    }},
    invoice:{findUniqueOrThrow:async()=>({amount:new Prisma.Decimal(149),balanceDue:balance,dueDate:new Date("2026-10-05")}),update:async({data}:{data:{balanceDue:Prisma.Decimal}})=>{balance=data.balanceDue;}},
    paymentAllocation:{upsert:async({create}:{create:{paymentId:string;amountAllocated:Prisma.Decimal}})=>{
      payments.find(p=>p.id===create.paymentId)!.allocations.push({invoiceId:"invoice",amountAllocated:create.amountAllocated});
      writes.push({payment:create.paymentId,amount:create.amountAllocated.toFixed(2)});
    }},auditLog:{create:async()=>({})},
  } as unknown as Prisma.TransactionClient;
  const input={studentId:"student",enrollmentId:"current",invoiceId:"invoice",actorId:"actor"};
  await allocateActivationPayments(tx,input); await allocateActivationPayments(tx,input);
  assert.equal(balance.toFixed(2),"0.00");
  assert.deepEqual(writes,[{payment:"payment-0",amount:"50.00"},{payment:"payment-1",amount:"99.00"}]);
});
test("already spent receipt cannot pay another activation invoice",async()=>{
  let writes=0;
  const tx={payment:{findMany:async()=>[{id:"payment",amount:new Prisma.Decimal(100),allocations:[{invoiceId:"old",amountAllocated:new Prisma.Decimal(100)}]}]},
    invoice:{findUniqueOrThrow:async()=>({amount:new Prisma.Decimal(100),balanceDue:new Prisma.Decimal(100)}),update:async()=>{writes++;}},
    paymentAllocation:{upsert:async()=>{writes++;}},auditLog:{create:async()=>{writes++;}},
  } as unknown as Prisma.TransactionClient;
  await allocateActivationPayments(tx,{studentId:"student",enrollmentId:"current",invoiceId:"new"}); assert.equal(writes,0);
});
