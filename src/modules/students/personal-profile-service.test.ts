import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@/generated/prisma/client";
import { updatePersonalStudentProfile } from "./personal-profile-service";
import { planNewStudentPackage } from "./package-return-policy";
import { assertManualStudentStatusTransition, getStudentLifecycleEventType } from "./lifecycle-service";

const studentId = "bedcddf0-a861-44e8-ac09-11713666b80d";
const actorId = "00000000-0000-4000-8000-000000000001";
const input = {
  studentId, fullName: "Nigar Vəliyeva", phone: "0501234567",
  registeredDate: "2026-06-08", notes: "Yeni proqramla maraqlanır",
};
function mockTx(status: string, managerId: string | null = null) {
  const writes: Array<{ table: string; data: Record<string, unknown> }> = [];
  const tx = {
    $queryRaw: async () => [{ id: studentId }],
    student: {
      findUnique: async () => ({ id: studentId, contactId: "contact-1", managerId,
        lifecycleStatus: status, billingPaused: true, educationLevel: null,
        campaignId: null, registeredAt: new Date("2026-06-08"), notes: null,
        contact: { fullName: "Nigar", phoneDisplay: "0501234567", phoneNormalized: "+994501234567", email: null, source: null },
      }),
      update: async ({ data }: { data: Record<string, unknown> }) => { writes.push({ table: "student", data }); },
    },
    contact: { update: async ({ data }: { data: Record<string, unknown> }) => { writes.push({ table: "contact", data }); } },
    auditLog: { create: async ({ data }: { data: Record<string, unknown> }) => { writes.push({ table: "auditLog", data }); } },
    user: { findFirst: async () => managerId ? { id: managerId } : null },
  } as unknown as Prisma.TransactionClient;
  return { tx, writes };
}

for (const status of ["COMPLETED", "SLOT_WAITING", "STOPPED", "FROZEN", "ACTIVE", "DECLINED"]) {
  test(`personal edit works without ANY enrollment/slot for ${status}`, async () => {
    const { tx, writes } = mockTx(status);
    await updatePersonalStudentProfile(tx, {
      ...input, lifecycleStatus: "ACTIVE", programId: "tampered", monthlyFee: 1,
      billingAnchorDate: "2026-09-01", firstLessonDate: "2026-09-01",
    }, { id: actorId, canManageAllStudents: true });
    assert.deepEqual(writes.map(write => write.table), ["contact", "student", "auditLog"]);
    assert.deepEqual(Object.keys(writes[1].data).sort(), ["campaignId", "educationLevel", "managerId", "notes", "registeredAt"]);
    assert.equal(writes[0].data.fullName, "Nigar Vəliyeva");
    assert.equal(writes[2].data.action, "student.profile.update");
  });
}

test("scoped employee cannot edit somebody else's student", async () => {
  const { tx, writes } = mockTx("SLOT_WAITING", "other-manager");
  await assert.rejects(updatePersonalStudentProfile(tx, input, { id: actorId, canManageAllStudents: false }), /icazəniz yoxdur/);
  assert.equal(writes.length, 0);
});

test("scoped employee cannot reassign their student via injected managerId", async () => {
  const { tx, writes } = mockTx("SLOT_WAITING", actorId);
  await updatePersonalStudentProfile(tx, { ...input, managerId: "00000000-0000-4000-8000-000000000002" }, { id: actorId, canManageAllStudents: false });
  assert.equal(writes[1].data.managerId, actorId);
});

test("admin cannot reassign manager or campaign from the student edit form", async () => {
  const { tx, writes } = mockTx("ACTIVE", actorId);
  await updatePersonalStudentProfile(tx, {
    ...input,
    managerId: "00000000-0000-4000-8000-000000000002",
    campaignId: "00000000-0000-4000-8000-000000000003",
  }, { id: actorId, canManageAllStudents: true });
  assert.equal(writes[1].data.managerId, actorId);
  assert.equal(writes[1].data.campaignId, null);
});

test("impossible calendar date is rejected before writes", async () => {
  const { tx, writes } = mockTx("COMPLETED");
  await assert.rejects(updatePersonalStudentProfile(tx, { ...input, registeredDate: "2026-02-31" }, { id: actorId, canManageAllStudents: true }), /tarixi düzgün deyil/);
  assert.equal(writes.length, 0);
});

test("completed student returns through paused package, never direct activation", () => {
  assert.deepEqual(planNewStudentPackage({ lifecycleStatus: "COMPLETED", billingPaused: true, hasOpenPackages: false, canChangeStatus: true }), {
    returningAfterCompletion: true, enrollmentStatus: "PAUSED",
  });
  assert.equal(getStudentLifecycleEventType("COMPLETED", "SLOT_WAITING"), "REACTIVATED");
  assert.throws(() => assertManualStudentStatusTransition("COMPLETED", "ACTIVE"), /Slot gözləyir/);
});

test("Nigar: slot-waiting student with only completed Amsterdam can get a new paused package", () => {
  assert.deepEqual(planNewStudentPackage({ lifecycleStatus: "SLOT_WAITING", billingPaused: true, hasOpenPackages: false, canChangeStatus: false }), {
    returningAfterCompletion: false, enrollmentStatus: "PAUSED",
  });
});

test("package return preserves permissions and lifecycle invariants", () => {
  assert.throws(() => planNewStudentPackage({ lifecycleStatus: "COMPLETED", billingPaused: true, hasOpenPackages: false, canChangeStatus: false }), /icazəsi/);
  assert.throws(() => planNewStudentPackage({ lifecycleStatus: "COMPLETED", billingPaused: true, hasOpenPackages: true, canChangeStatus: true }), /açıq paketi/);
  assert.throws(() => planNewStudentPackage({ lifecycleStatus: "DECLINED", billingPaused: true, hasOpenPackages: false, canChangeStatus: true }), /Slot gözləyir/);
  assert.equal(planNewStudentPackage({ lifecycleStatus: "ACTIVE", billingPaused: false, hasOpenPackages: true, canChangeStatus: false }).enrollmentStatus, "ACTIVE");
});
