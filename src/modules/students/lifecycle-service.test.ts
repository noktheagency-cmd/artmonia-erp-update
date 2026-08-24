import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@/generated/prisma/client";
import {
  closeCompletedStudentBilling,
  syncActivationBilling,
} from "./lifecycle-service";

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

test("completion closes enrollment and outstanding invoices without deleting history", async () => {
  let enrollmentUpdate: unknown;
  let invoiceUpdate: unknown;
  let scheduleUpdateCalled = false;
  const tx = {
    enrollment: {
      updateMany: async (args: unknown) => {
        enrollmentUpdate = args;
        return { count: 1 };
      },
    },
    invoice: {
      updateMany: async (args: unknown) => {
        invoiceUpdate = args;
        return { count: 2 };
      },
    },
    $executeRaw: async () => {
      scheduleUpdateCalled = true;
      return 1;
    },
  } as unknown as Prisma.TransactionClient;

  const result = await closeCompletedStudentBilling(
    tx,
    "student-1",
    utcDate("2026-08-24"),
  );

  assert.deepEqual(result, {
    completedEnrollmentCount: 1,
    voidedInvoiceCount: 2,
    closedScheduleAssignmentCount: 1,
  });
  assert.deepEqual(enrollmentUpdate, {
    where: {
      studentId: "student-1",
      status: { in: ["ACTIVE", "PAUSED"] },
    },
    data: { status: "COMPLETED" },
  });
  assert.deepEqual(invoiceUpdate, {
    where: {
      studentId: "student-1",
      status: { not: "VOID" },
      balanceDue: { gt: 0 },
    },
    data: {
      status: "VOID",
      balanceDue: 0,
    },
  });
  assert.equal(scheduleUpdateCalled, true);
});
