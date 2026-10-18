import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@/generated/prisma/client";
import {
  activateStudentFromFirstPresent,
  assertFirstPeriodFullyPaidForAttendance,
  hasMissedPlannedFirstLesson,
} from "./activation-from-attendance";
import { syncActivationBilling } from "./lifecycle-service";

function utcDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function money(value: number) {
  return { lte: (other: number) => value <= other };
}

test("BK-08: planned first lesson in the past while still SLOT_WAITING is missed", () => {
  assert.equal(
    hasMissedPlannedFirstLesson({
      lifecycleStatus: "SLOT_WAITING",
      plannedFirstLessonAt: utcDate("2026-10-01"),
      asOf: utcDate("2026-10-18"),
    }),
    true,
  );
  assert.equal(
    hasMissedPlannedFirstLesson({
      lifecycleStatus: "SLOT_WAITING",
      plannedFirstLessonAt: utcDate("2026-10-18"),
      asOf: utcDate("2026-10-18"),
    }),
    false,
  );
  assert.equal(
    hasMissedPlannedFirstLesson({
      lifecycleStatus: "ACTIVE",
      plannedFirstLessonAt: utcDate("2026-10-01"),
      asOf: utcDate("2026-10-18"),
    }),
    false,
  );
});

function decimal(value: number) {
  return {
    lt: (other: { valueOf?: () => number } | number) =>
      value < (typeof other === "number" ? other : Number(other)),
    lte: (other: number) => value <= other,
    gte: (other: { valueOf?: () => number } | number) =>
      value >= (typeof other === "number" ? other : Number(other)),
    valueOf: () => value,
    toString: () => String(value),
  };
}

test("BK-05: SLOT_WAITING with DEPOSIT sale cannot attend first monthly lesson", async () => {
  const tx = {
    student: {
      findUnique: async () => ({
        id: "student-1",
        admissionTracking: true,
        lifecycleStatus: "SLOT_WAITING",
      }),
    },
    enrollment: {
      findUnique: async () => ({
        id: "enrollment-1",
        studentId: "student-1",
        monthlyFee: money(200),
        discountType: null,
      }),
    },
    courseSale: {
      findFirst: async () => ({ id: "sale-1", status: "DEPOSIT", initialFee: decimal(200) }),
    },
    payment: {
      aggregate: async () => ({ _sum: { amount: decimal(20) } }),
    },
  } as unknown as Prisma.TransactionClient;

  await assert.rejects(
    () => assertFirstPeriodFullyPaidForAttendance(tx, {
      studentId: "student-1",
      enrollmentId: "enrollment-1",
    }),
    /ilk dövrün tam haqqı/i,
  );
});

test("BK-05: COMPLETE sale allows first monthly attendance gate", async () => {
  const tx = {
    student: {
      findUnique: async () => ({
        id: "student-1",
        admissionTracking: true,
        lifecycleStatus: "SLOT_WAITING",
      }),
    },
    enrollment: {
      findUnique: async () => ({
        id: "enrollment-1",
        studentId: "student-1",
        monthlyFee: money(200),
        discountType: null,
      }),
    },
    courseSale: {
      findFirst: async () => ({ id: "sale-1", status: "COMPLETE", initialFee: decimal(200) }),
    },
    payment: {
      aggregate: async () => ({ _sum: { amount: decimal(200) } }),
    },
  } as unknown as Prisma.TransactionClient;

  await assert.doesNotReject(() => assertFirstPeriodFullyPaidForAttendance(tx, {
    studentId: "student-1",
    enrollmentId: "enrollment-1",
  }));
});

test("BK-05: COMPLETE status with underpaid sum still blocks attendance", async () => {
  const tx = {
    student: {
      findUnique: async () => ({
        id: "student-1",
        admissionTracking: true,
        lifecycleStatus: "SLOT_WAITING",
      }),
    },
    enrollment: {
      findUnique: async () => ({
        id: "enrollment-1",
        studentId: "student-1",
        monthlyFee: money(200),
        discountType: null,
      }),
    },
    courseSale: {
      findFirst: async () => ({ id: "sale-1", status: "COMPLETE", initialFee: decimal(200) }),
    },
    payment: {
      aggregate: async () => ({ _sum: { amount: decimal(50) } }),
    },
  } as unknown as Prisma.TransactionClient;

  await assert.rejects(
    () => assertFirstPeriodFullyPaidForAttendance(tx, {
      studentId: "student-1",
      enrollmentId: "enrollment-1",
    }),
    /ilk dövrün tam haqqı/i,
  );
});

test("BK-05: gift / zero-fee package skips COMPLETE sale gate", async () => {
  const tx = {
    student: {
      findUnique: async () => ({
        id: "student-1",
        admissionTracking: true,
        lifecycleStatus: "SLOT_WAITING",
      }),
    },
    enrollment: {
      findUnique: async () => ({
        id: "enrollment-1",
        studentId: "student-1",
        monthlyFee: money(0),
        discountType: "GIFT",
      }),
    },
    courseSale: {
      findFirst: async () => {
        throw new Error("sale should not be queried for gift");
      },
    },
  } as unknown as Prisma.TransactionClient;

  await assert.doesNotReject(() => assertFirstPeriodFullyPaidForAttendance(tx, {
    studentId: "student-1",
    enrollmentId: "enrollment-1",
  }));
});

test("BK-06/07: first PRESENT activation uses actual lesson as billing anchor", async () => {
  const lessonDate = utcDate("2026-10-05");
  const plannedDate = utcDate("2026-10-01");
  let enrollmentUpdate: unknown;
  let studentBillingUpdate: unknown;

  const tx = {
    $queryRaw: async () => [],
    studentStatusHistory: { findFirst: async () => null },
    student: {
      updateMany: async () => undefined,
      update: async (args: unknown) => {
        studentBillingUpdate = args;
      },
    },
    enrollment: {
      findFirst: async () => ({
        id: "enrollment-1",
        startDate: plannedDate,
        firstLessonAt: plannedDate,
        monthlyFee: 200,
        lessonsPerMonth: 8,
        discountType: null,
        student: {
          originalFirstLessonAt: plannedDate,
          billingAnchorDate: null,
        },
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

  await syncActivationBilling(tx, {
    studentId: "student-1",
    studentCode: "ART-0001",
    effectiveAt: lessonDate,
    useActualLessonDate: true,
  });

  assert.deepEqual(studentBillingUpdate, {
    where: { id: "student-1" },
    data: { billingAnchorDate: lessonDate },
  });
  assert.deepEqual(enrollmentUpdate, {
    where: { id: "enrollment-1" },
    data: {
      status: "ACTIVE",
      startDate: lessonDate,
      firstLessonAt: lessonDate,
    },
  });
});

test("BK-06: activateStudentFromFirstPresent is no-op when already ACTIVE", async () => {
  const tx = {
    student: {
      findUnique: async () => ({
        id: "student-1",
        code: "ART-1",
        admissionTracking: true,
        lifecycleStatus: "ACTIVE",
        billingPaused: false,
        statusHistory: [],
      }),
    },
    enrollment: {
      findUnique: async () => ({
        id: "enrollment-1",
        studentId: "student-1",
        monthlyFee: money(200),
        discountType: null,
      }),
    },
  } as unknown as Prisma.TransactionClient;

  const result = await activateStudentFromFirstPresent(tx, {
    actorId: "actor-1",
    studentId: "student-1",
    enrollmentId: "enrollment-1",
    lessonDate: utcDate("2026-10-05"),
  });
  assert.equal(result, null);
});
