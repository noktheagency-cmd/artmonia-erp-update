import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@/generated/prisma/client";
import {
  closeCompletedStudentBilling,
  getStatusChangeReason,
  resolveActivationBillingPeriod,
  syncActivationBilling,
} from "./lifecycle-service";

function utcDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function activationTx(enrollment: {
  startDate: Date;
  firstLessonAt: Date | null;
  billingAnchorDate?: Date | null;
}) {
  let enrollmentUpdate: unknown;
  const studentUpdates: unknown[] = [];
  let invoiceUpdate: unknown;
  const tx = {
    student: {
      updateMany: async (args: unknown) => {
        studentUpdates.push(args);
      },
    },
    enrollment: {
      findFirst: async () => ({
        id: "enrollment-1",
        monthlyFee: 200,
        student: {
          originalFirstLessonAt: enrollment.firstLessonAt,
          billingAnchorDate: enrollment.billingAnchorDate === undefined
            ? enrollment.firstLessonAt
            : enrollment.billingAnchorDate,
        },
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
      update: async (args: unknown) => {
        invoiceUpdate = args;
      },
      create: async () => undefined,
    },
  } as unknown as Prisma.TransactionClient;

  return {
    tx,
    getEnrollmentUpdate: () => enrollmentUpdate,
    getStudentUpdates: () => studentUpdates,
    getInvoiceUpdate: () => invoiceUpdate,
  };
}

test("activation preserves a manually imported first lesson date", async () => {
  const firstLessonAt = utcDate("2024-09-10");
  const { tx, getEnrollmentUpdate, getInvoiceUpdate } = activationTx({
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
  assert.deepEqual(getInvoiceUpdate(), {
    where: { id: "invoice-1" },
    data: {
      enrollmentId: "enrollment-1",
      periodMonth: utcDate("2026-08-01"),
      dueDate: utcDate("2026-08-10"),
      status: "PAID",
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

test("reactivation keeps the original lesson date and starts a new current period", async () => {
  const originalFirstLessonAt = utcDate("2026-02-10");
  const returnAt = utcDate("2026-06-03");
  const { tx, getEnrollmentUpdate, getStudentUpdates } = activationTx({
    startDate: originalFirstLessonAt,
    firstLessonAt: originalFirstLessonAt,
  });

  const result = await syncActivationBilling(tx, {
    studentId: "student-1",
    studentCode: "ART-0001",
    effectiveAt: returnAt,
    isReactivation: true,
  });

  assert.deepEqual(getStudentUpdates(), []);
  assert.deepEqual(getEnrollmentUpdate(), {
    where: { id: "enrollment-1" },
    data: {
      status: "ACTIVE",
      startDate: returnAt,
      firstLessonAt: returnAt,
    },
  });
  assert.deepEqual(result, {
    enrollmentId: "enrollment-1",
    previousFirstLessonAt: originalFirstLessonAt,
    currentFirstLessonAt: returnAt,
    originalFirstLessonAt,
    billingAnchorDate: originalFirstLessonAt,
    reactivated: true,
  });
  assert.equal(
    getStatusChangeReason("ACTIVE", "FROZEN"),
    "Tələbə yenidən aktiv edildi",
  );
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

test("reactivation after the anchor day starts from the next billing month", () => {
  const period = resolveActivationBillingPeriod({
    effectiveAt: utcDate("2026-08-23"),
    billingAnchorDate: utcDate("2026-06-02"),
    isReactivation: true,
  });

  assert.equal(period.toISOString().slice(0, 10), "2026-09-01");
});

test("reactivation on the anchor day keeps the current billing month", () => {
  const period = resolveActivationBillingPeriod({
    effectiveAt: utcDate("2026-08-23"),
    billingAnchorDate: utcDate("2025-09-23"),
    isReactivation: true,
  });

  assert.equal(period.toISOString().slice(0, 10), "2026-08-01");
});

test("initial activation does not backfill months before activation", () => {
  const period = resolveActivationBillingPeriod({
    effectiveAt: utcDate("2026-08-23"),
    billingAnchorDate: utcDate("2026-06-02"),
    isReactivation: false,
  });

  assert.equal(period.toISOString().slice(0, 10), "2026-08-01");
});

test("initial activation cannot invoice a month before the first lesson anchor", () => {
  const period = resolveActivationBillingPeriod({
    effectiveAt: utcDate("2026-08-29"),
    billingAnchorDate: utcDate("2026-09-05"),
    isReactivation: false,
  });

  assert.equal(period.toISOString().slice(0, 10), "2026-09-01");
});

test("reactivation before a future anchor month cannot invoice the earlier month", () => {
  const period = resolveActivationBillingPeriod({
    effectiveAt: utcDate("2026-08-29"),
    billingAnchorDate: utcDate("2026-09-14"),
    isReactivation: true,
  });

  assert.equal(period.toISOString().slice(0, 10), "2026-09-01");
});
