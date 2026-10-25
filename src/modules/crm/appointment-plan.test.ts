import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@/generated/prisma/client";
import { appointmentSchema } from "./appointment-policy";
import { assertAppointmentReplay, materializeLeadMeetingPlan } from "./appointment-plan";

const lead = {
  id: "00000000-0000-4000-8000-000000000001", managerId: "00000000-0000-4000-8000-000000000002",
  stage: "QUALIFIED" as const, convertedStudentId: null, nextActionType: "CONSULTATION_REMINDER" as const,
  nextFollowUpAt: new Date("2026-10-25T09:00:00.000Z"),
};
const input = appointmentSchema.parse({
  leadId: lead.id, idempotencyKey: "00000000-0000-4000-8000-000000000003", leadPlanAt: lead.nextFollowUpAt.toISOString(),
  kind: "CONSULTATION", date: "2026-10-25", time: "13:00", outcome: "ATTENDED", occurredDate: "2026-10-25", occurredTime: "14:00",
});

function fixture({ existing = false, reuseWork = true, failCreate = false } = {}) {
  const appointments: Prisma.CrmAppointmentUncheckedCreateInput[] = [];
  const works: Prisma.LeadWorkItemUncheckedCreateInput[] = [];
  const searches: Prisma.CrmAppointmentFindFirstArgs[] = [];
  const tx = {
    crmAppointment: {
      findFirst: async (args: Prisma.CrmAppointmentFindFirstArgs) => {
        searches.push(args);
        return existing ? { id: "existing-appointment" } : null;
      },
      create: async ({ data }: { data: Prisma.CrmAppointmentUncheckedCreateInput }) => {
        if (failCreate) throw new Error("database write failed");
        appointments.push(data);
        return { ...data, id: "created-appointment", outcome: "SCHEDULED", occurredAt: null };
      },
    },
    leadWorkItem: {
      findFirst: async () => reuseWork ? { id: "existing-work" } : null,
      create: async ({ data }: { data: Prisma.LeadWorkItemUncheckedCreateInput }) => {
        works.push(data);
        return { ...data, id: "created-work" };
      },
    },
  } as unknown as Prisma.TransactionClient;
  return { tx, appointments, works, searches };
}

test("outcome materialization preserves the planned date and reuses the open reminder work", async () => {
  for (const outcome of ["ATTENDED", "NO_SHOW"] as const) {
    const db = fixture();
    const before = await materializeLeadMeetingPlan(db.tx, lead, { ...input, outcome });
    assert.equal(before.id, "created-appointment");
    assert.equal(before.outcome, "SCHEDULED");
    assert.equal(before.occurredAt, null);
    assert.equal(db.appointments[0].plannedAt, lead.nextFollowUpAt);
    assert.equal(db.appointments[0].ownerId, lead.managerId);
    assert.equal(db.appointments[0].reminderWorkId, "existing-work");
    assert.equal(db.appointments[0].idempotencyKey, `lead-plan:${lead.id}:${input.leadPlanAt}`);
    assert.equal(db.works.length, 0);
  }
});

test("a reminder without a work record gets one appointment work record", async () => {
  const db = fixture({ reuseWork: false });
  await materializeLeadMeetingPlan(db.tx, lead, input);
  assert.equal(db.works.length, 1);
  assert.equal(db.works[0].source, "APPOINTMENT");
  assert.equal(db.appointments[0].reminderWorkId, "created-work");
});

test("stale, closed, reassigned-kind and unrelated plan targets are rejected before writes", async () => {
  const changedLeads = [
    { ...lead, nextFollowUpAt: new Date("2026-10-26T09:00:00Z") },
    { ...lead, nextFollowUpAt: null }, { ...lead, nextActionType: "CALL" as const },
    { ...lead, managerId: null }, { ...lead, stage: "REGISTERED" as const },
    { ...lead, stage: "LOST" as const }, { ...lead, convertedStudentId: lead.id },
    { ...lead, id: "different-lead" }, { ...lead, nextActionType: "TRIAL_LESSON_REMINDER" as const },
  ];
  for (const changed of changedLeads) {
    const db = fixture();
    await assert.rejects(() => materializeLeadMeetingPlan(db.tx, changed, input), /planı dəyişib/);
    assert.equal(db.appointments.length + db.works.length + db.searches.length, 0);
  }
});

test("a concurrently recorded appointment blocks a duplicate profile-plan materialization", async () => {
  const db = fixture({ existing: true });
  await assert.rejects(() => materializeLeadMeetingPlan(db.tx, lead, input), /artıq mövcuddur/);
  assert.equal(db.appointments.length + db.works.length, 0);
  assert.deepEqual(db.searches[0].where, {
    leadId: lead.id,
    OR: [{ outcome: "SCHEDULED" }, { plannedAt: { gte: new Date("2026-10-24T20:00:00Z"), lt: new Date("2026-10-25T20:00:00Z") } }],
  });
});

test("a failed materialization propagates to the enclosing outcome transaction", async () => {
  const db = fixture({ failCreate: true });
  await assert.rejects(() => materializeLeadMeetingPlan(db.tx, lead, input), /database write failed/);
  assert.equal(db.appointments.length, 0);
});

test("only an explicit attendance or no-show outcome can materialize a reminder", async () => {
  for (const outcome of ["SCHEDULED", "CANCELLED", "RESCHEDULED"] as const) {
    const db = fixture();
    await assert.rejects(() => materializeLeadMeetingPlan(db.tx, lead, { ...input, outcome }), /planı dəyişib/);
    assert.equal(db.appointments.length + db.works.length, 0);
  }
});

test("same-request retries are accepted, while changed targets, outcomes and actors are rejected", () => {
  const saved = { ...input, requestedAppointmentId: null, appointmentId: "materialized-appointment" };
  assert.doesNotThrow(() => assertAppointmentReplay(saved, input, "actor-1", "actor-1"));
  for (const changed of [
    { ...input, leadPlanAt: "2026-10-26T09:00:00.000Z" }, { ...input, outcome: "NO_SHOW" as const },
    { ...input, appointmentId: lead.id }, { ...input, leadId: lead.managerId },
  ]) assert.throws(() => assertAppointmentReplay(saved, changed, "actor-1", "actor-1"), /məlumatları fərqlidir/);
  assert.throws(() => assertAppointmentReplay(saved, input, "actor-2", "actor-1"), /başqa əməkdaşa/);
});

test("recorded appointment retries preserve their requested target identity", () => {
  const direct = { ...input, leadPlanAt: undefined, appointmentId: lead.id };
  const saved = { ...direct, requestedAppointmentId: lead.id };
  assert.doesNotThrow(() => assertAppointmentReplay(saved, direct, "actor-1", "actor-1"));
  assert.throws(() => assertAppointmentReplay(saved, { ...direct, appointmentId: lead.managerId }, "actor-1", "actor-1"), /məlumatları fərqlidir/);
});
