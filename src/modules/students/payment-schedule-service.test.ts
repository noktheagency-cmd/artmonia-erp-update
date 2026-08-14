import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@/generated/prisma/client";
import {
  resolveStudentNextPaymentAt,
  startStudentPaymentSchedule,
} from "./payment-schedule-service";

function utcDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

test("requires an active slot and unpaused billing before scheduling", async () => {
  let receivedWhere: unknown;
  const tx = {
    studentScheduleAssignment: {
      findFirst: async (args: { where: unknown }) => {
        receivedWhere = args.where;
        return null;
      },
    },
  } as unknown as Prisma.TransactionClient;

  const result = await resolveStudentNextPaymentAt(tx, {
    studentId: "student-1",
    paymentMonth: utcDate("2026-08-01"),
  });

  assert.equal(result, null);
  assert.deepEqual(receivedWhere, {
    validTo: null,
    enrollment: {
      studentId: "student-1",
      student: { billingPaused: false },
    },
  });
});

test("replaces legacy dates with one schedule on the latest payment", async () => {
  const updates: unknown[] = [];
  const tx = {
    payment: {
      findFirst: async () => ({
        id: "payment-2",
        paymentMonth: utcDate("2026-08-01"),
        scheduleType: "MONTHLY",
      }),
      updateMany: async (args: unknown) => {
        updates.push(args);
      },
      update: async (args: unknown) => {
        updates.push(args);
      },
    },
  } as unknown as Prisma.TransactionClient;

  await startStudentPaymentSchedule(tx, {
    studentId: "student-1",
    slotStartedAt: utcDate("2026-08-08"),
  });

  assert.deepEqual(updates, [
    {
      where: {
        studentId: { in: ["student-1"] },
        nextPaymentAt: { not: null },
      },
      data: { nextPaymentAt: null },
    },
    {
      where: { id: "payment-2" },
      data: { nextPaymentAt: utcDate("2026-09-08") },
    },
  ]);
});

test("does not restart a monthly schedule after a one-time full payment", async () => {
  const updates: unknown[] = [];
  const tx = {
    payment: {
      findFirst: async () => ({
        id: "payment-3",
        paymentMonth: utcDate("2026-08-01"),
        scheduleType: "ONE_TIME",
      }),
      updateMany: async (args: unknown) => {
        updates.push(args);
      },
      update: async (args: unknown) => {
        updates.push(args);
      },
    },
  } as unknown as Prisma.TransactionClient;

  await startStudentPaymentSchedule(tx, {
    studentId: "student-1",
    slotStartedAt: utcDate("2026-08-08"),
  });

  assert.deepEqual(updates, [
    {
      where: {
        studentId: { in: ["student-1"] },
        nextPaymentAt: { not: null },
      },
      data: { nextPaymentAt: null },
    },
  ]);
});
