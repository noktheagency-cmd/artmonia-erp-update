import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@/generated/prisma/client";
import { resolveRegistrationMeetingAttendance } from "./registration-attend-policy";

test("BK-18: no appointments allows convert without inventing attendance", async () => {
  const tx = {
    crmAppointment: {
      findMany: async () => [],
      update: async () => {
        throw new Error("should not update");
      },
    },
  } as unknown as Prisma.TransactionClient;

  const result = await resolveRegistrationMeetingAttendance(tx, {
    leadId: "lead-1",
    confirmMeetingAttended: false,
    actorId: "user-1",
  });
  assert.deepEqual(result, { required: false, confirmed: false });
});

test("BK-18: already ATTENDED does not require second confirmation", async () => {
  const tx = {
    crmAppointment: {
      findMany: async () => [
        { id: "a1", outcome: "ATTENDED", plannedAt: new Date(), teacherId: null, kind: "CONSULTATION" },
        { id: "a2", outcome: "SCHEDULED", plannedAt: new Date(), teacherId: null, kind: "TRIAL" },
      ],
      update: async () => {
        throw new Error("should not update");
      },
    },
  } as unknown as Prisma.TransactionClient;

  const result = await resolveRegistrationMeetingAttendance(tx, {
    leadId: "lead-1",
    confirmMeetingAttended: false,
    actorId: "user-1",
  });
  assert.deepEqual(result, { required: false, confirmed: true });
});

test("BK-18: open SCHEDULED without confirm is rejected", async () => {
  const tx = {
    crmAppointment: {
      findMany: async () => [
        { id: "a1", outcome: "SCHEDULED", plannedAt: new Date(), teacherId: null, kind: "CONSULTATION" },
      ],
      update: async () => {
        throw new Error("should not update");
      },
    },
  } as unknown as Prisma.TransactionClient;

  await assert.rejects(
    () =>
      resolveRegistrationMeetingAttendance(tx, {
        leadId: "lead-1",
        confirmMeetingAttended: false,
        actorId: "user-1",
      }),
    /iştirakı təsdiqləyin/i,
  );
});

test("BK-18: confirm marks SCHEDULED appointment ATTENDED once", async () => {
  const updates: Array<{ id: string; outcome: string }> = [];
  const tx = {
    crmAppointment: {
      findMany: async () => [
        { id: "a1", outcome: "SCHEDULED", plannedAt: new Date(), teacherId: null, kind: "TRIAL" },
      ],
      update: async ({ where, data }: { where: { id: string }; data: { outcome: string } }) => {
        updates.push({ id: where.id, outcome: data.outcome });
        return {};
      },
    },
  } as unknown as Prisma.TransactionClient;

  const result = await resolveRegistrationMeetingAttendance(tx, {
    leadId: "lead-1",
    confirmMeetingAttended: true,
    actorId: "user-1",
    now: new Date("2026-10-18T10:00:00+04:00"),
  });
  assert.equal(result.required, true);
  assert.equal(result.confirmed, true);
  assert.deepEqual(updates, [{ id: "a1", outcome: "ATTENDED" }]);
});
