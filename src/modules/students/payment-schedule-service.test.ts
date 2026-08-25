import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@/generated/prisma/client";
import {
  restartStudentPaymentScheduleForActiveSlot,
  resolveStudentNextPaymentAt,
  startStudentPaymentSchedule,
} from "./payment-schedule-service";

function utcDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

test("oldest open billing cycle is the automatic next payment date", async () => {
  const tx = {
    studentBillingCycle: {
      findFirst: async () => ({ dueDate: utcDate("2026-08-22") }),
    },
  } as unknown as Prisma.TransactionClient;

  const result = await resolveStudentNextPaymentAt(tx, {
    studentId: "student-1",
    paymentMonth: utcDate("2026-08-01"),
  });

  assert.deepEqual(result, utcDate("2026-08-22"));
});

test("falls back to the protected first-lesson anchor when no cycle is open", async () => {
  const tx = {
    studentBillingCycle: { findFirst: async () => null },
    student: {
      findUnique: async () => ({
        billingAnchorDate: utcDate("2026-08-18"),
        billingPaused: false,
      }),
    },
  } as unknown as Prisma.TransactionClient;

  const result = await resolveStudentNextPaymentAt(tx, {
    studentId: "student-1",
    paymentMonth: utcDate("2026-08-01"),
  });

  assert.deepEqual(result, utcDate("2026-09-18"));
});

test("does not schedule while billing is paused", async () => {
  const tx = {
    studentBillingCycle: { findFirst: async () => null },
    student: {
      findUnique: async () => ({ billingAnchorDate: utcDate("2026-08-18"), billingPaused: true }),
    },
  } as unknown as Prisma.TransactionClient;

  assert.equal(await resolveStudentNextPaymentAt(tx, {
    studentId: "student-1",
    paymentMonth: utcDate("2026-08-01"),
  }), null);
});

test("slot changes only clear legacy persisted next-payment dates", async () => {
  const updates: unknown[] = [];
  const tx = {
    payment: {
      updateMany: async (args: unknown) => updates.push(args),
    },
  } as unknown as Prisma.TransactionClient;

  await startStudentPaymentSchedule(tx, {
    studentId: "student-1",
    slotStartedAt: utcDate("2026-08-08"),
  });
  await restartStudentPaymentScheduleForActiveSlot(tx, { studentId: "student-1" });

  assert.deepEqual(updates, [
    {
      where: { studentId: { in: ["student-1"] }, nextPaymentAt: { not: null } },
      data: { nextPaymentAt: null },
    },
    {
      where: { studentId: { in: ["student-1"] }, nextPaymentAt: { not: null } },
      data: { nextPaymentAt: null },
    },
  ]);
});
