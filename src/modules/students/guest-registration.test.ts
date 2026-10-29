import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import type { ErpActor } from "@/server/auth/actor";
import { singleLessonSchema } from "./single-lesson-policy";
import { guestRegistrationSchema, registerGuestStudent } from "./guest-registration-service";
import { assertGuestVisitAvailable } from "./guest-visit-scheduling";

const ids = { idempotencyKey: randomUUID(), programId: randomUUID(), teacherId: randomUUID() };
const input = { ...ids, fullName: "Synthetic guest", phone: "0501234567", guestDate: "2026-10-26", guestTime: "15:00", guestDuration: 60, guestPrice: "25" };
test("direct guest registration accepts empty optional form selections", () => {
  for (const empty of [undefined, "", "__empty__", "  "]) {
    const form = new FormData();
    for (const [key, value] of Object.entries(input)) form.set(key, String(value));
    if (empty !== undefined) {
      for (const key of ["leadId", "educationLevel", "source", "email"]) form.set(key, empty);
    }
    const parsed = guestRegistrationSchema.parse(Object.fromEntries(form));
    assert.equal(parsed.leadId, undefined);
    assert.equal(parsed.educationLevel, undefined);
    assert.equal(parsed.source, undefined);
    assert.equal(parsed.email, undefined);
  }
});
test("guest registration preserves CRM selection and rejects malformed lead IDs", () => {
  const leadId = randomUUID();
  assert.equal(guestRegistrationSchema.parse({ ...input, leadId }).leadId, leadId);
  for (const invalid of ["not-a-uuid", "123"]) {
    assert.equal(guestRegistrationSchema.safeParse({ ...input, leadId: invalid }).success, false);
  }
});
test("empty lead selection uses direct student permission rather than CRM conversion", async () => {
  const actor = { id: randomUUID(), permissions: new Map([["crm.lead.convert", "ALL"]]) } as ErpActor;
  await assert.rejects(registerGuestStudent({} as Prisma.TransactionClient, { ...input, leadId: "__empty__" }, actor), /Missing permission: student.create/);
});
test("guest registration cannot bypass direct or CRM permissions", async () => {
  const actor = { id: randomUUID(), permissions: new Map() } as ErpActor;
  const tx = {} as Prisma.TransactionClient;
  await assert.rejects(registerGuestStudent(tx, input, actor), /Missing permission/);
  await assert.rejects(registerGuestStudent(tx, { ...input, leadId: randomUUID() }, actor), /Missing permission/);
});
test("one-time scheduling rejects impossible dates and lessons crossing midnight", () => {
  const lesson = { requestId: randomUUID(), studentId: randomUUID(), ...ids, date: "2026-10-26", time: "15:00", duration: 60, price: "25" };
  assert.equal(singleLessonSchema.safeParse({ ...lesson, date: "2026-02-30" }).success, false);
  assert.equal(singleLessonSchema.safeParse({ ...lesson, time: "23:30" }).success, false);
  assert.equal(singleLessonSchema.safeParse({ ...lesson, time: "23:00" }).success, true);
});
test("the same guest cannot be booked into overlapping visits", async () => {
  const tx = { $executeRaw: async () => 1, $queryRaw: async () => [{ id: randomUUID() }] } as unknown as Prisma.TransactionClient;
  await assert.rejects(assertGuestVisitAvailable(tx, { studentId: randomUUID(), date: "2026-10-26", time: "15:00", duration: 60 }), /həmin vaxtda/);
});
