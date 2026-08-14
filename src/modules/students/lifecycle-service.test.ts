import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@/generated/prisma/client";
import { syncActivationBilling } from "./lifecycle-service";

function utcDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function activationTx(enrollment: {
  startDate: Date;
  firstLessonAt: Date | null;
}) {
  let enrollmentUpdate: unknown;
  const tx = {
    enrollment: {
      findFirst: async () => ({
        id: "enrollment-1",
        monthlyFee: 200,
        ...enrollment,
      }),
      update: async (args: unknown) => {
        enrollmentUpdate = args;
      },
    },
    invoice: {
      findFirst: async () => ({
        id: "invoice-1",
        amount: 200,
        balanceDue: 0,
        enrollmentId: "enrollment-1",
      }),
      update: async () => undefined,
      create: async () => undefined,
    },
  } as unknown as Prisma.TransactionClient;

  return { tx, getEnrollmentUpdate: () => enrollmentUpdate };
}

test("activation preserves a manually imported first lesson date", async () => {
  const firstLessonAt = utcDate("2024-09-10");
  const { tx, getEnrollmentUpdate } = activationTx({
    startDate: firstLessonAt,
    firstLessonAt,
  });

  await syncActivationBilling(tx, {
    studentId: "student-1",
    studentCode: "ART-0001",
    effectiveAt: utcDate("2026-08-15"),
  });

  assert.deepEqual(getEnrollmentUpdate(), {
    where: { id: "enrollment-1" },
    data: {
      status: "ACTIVE",
      startDate: firstLessonAt,
      firstLessonAt,
    },
  });
});

test("activation fills the automatic first lesson date from the active slot", async () => {
  const registeredAt = utcDate("2026-08-01");
  const slotStartedAt = utcDate("2026-08-15");
  const { tx, getEnrollmentUpdate } = activationTx({
    startDate: registeredAt,
    firstLessonAt: null,
  });

  await syncActivationBilling(tx, {
    studentId: "student-1",
    studentCode: "ART-0001",
    effectiveAt: slotStartedAt,
  });

  assert.deepEqual(getEnrollmentUpdate(), {
    where: { id: "enrollment-1" },
    data: {
      status: "ACTIVE",
      startDate: slotStartedAt,
      firstLessonAt: slotStartedAt,
    },
  });
});
