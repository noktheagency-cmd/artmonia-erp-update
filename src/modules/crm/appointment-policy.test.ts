import test from "node:test";
import assert from "node:assert/strict";
import { appointmentSchema, appointmentInstant } from "./appointment-policy";
const input={leadId:"00000000-0000-4000-8000-000000000001",idempotencyKey:"00000000-0000-4000-8000-000000000002",date:"2026-09-20",time:"12:00",kind:"TRIAL",outcome:"SCHEDULED"} as const;
test("appointment requires a real date, time and stable request identity",()=>{
 assert.equal(appointmentSchema.safeParse(input).success,true);
 assert.equal(appointmentSchema.safeParse({...input,kind:"MEETING"}).success,true);
 for(const extra of [{date:"2026-02-30"},{time:"24:00"},{leadId:"bad"},{outcome:"DONE"},{idempotencyKey:""}])assert.equal(appointmentSchema.safeParse({...input,...extra}).success,false);
 assert.equal(appointmentInstant("2026-09-20","12:00").toISOString(),"2026-09-20T08:00:00.000Z");
});
test("actual trial requires actual time and teacher; stage is not attendance",()=>{
 assert.equal(appointmentSchema.safeParse({...input,outcome:"ATTENDED"}).success,false);
 assert.equal(appointmentSchema.safeParse({...input,outcome:"ATTENDED",occurredDate:input.date,occurredTime:"12:30"}).success,false);
 assert.equal(appointmentSchema.safeParse({...input,outcome:"ATTENDED",occurredDate:input.date,occurredTime:"12:30",teacherId:input.leadId}).success,true);
});
test("cancellation and rescheduling need a reason",()=>{
 for(const outcome of ["CANCELLED","RESCHEDULED"]) {
  assert.equal(appointmentSchema.safeParse({...input,outcome}).success,false);
  assert.equal(appointmentSchema.safeParse({...input,outcome,reason:"Owner requested"}).success,true);
 }
});
