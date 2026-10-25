import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@/generated/prisma/client";
import {
  assertManualStudentStatusTransition,
  closeCompletedStudentBilling,
  enrollmentStatusForStudentLifecycle,
  getStudentLifecycleEventType,
  getStatusChangeReason,
  resolveActivationBillingPeriod,
  syncActivationBilling,
} from "./lifecycle-service";

function utcDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

test("geri qayıdan tələbə REACTIVATED kimi SLOT_WAITING mərhələsinə keçir", () => {
  assert.equal(getStudentLifecycleEventType("FROZEN", "SLOT_WAITING"), "REACTIVATED");
  assert.doesNotThrow(() => assertManualStudentStatusTransition("FROZEN", "SLOT_WAITING"));
});

test("inactive tələbənin birbaşa ACTIVE edilməsi bloklanır", () => {
  assert.throws(
    () => assertManualStudentStatusTransition("STOPPED", "ACTIVE"),
    /Əvvəl Slot gözləyir statusuna keçirin/,
  );
});

test("slot gözləyən tələbənin yeni enrollment-i aktiv açılmır", () => {
  assert.equal(enrollmentStatusForStudentLifecycle("SLOT_WAITING"), "PAUSED");
  assert.equal(enrollmentStatusForStudentLifecycle("ACTIVE"), "ACTIVE");
});

test("BK-10: FROZEN keeps enrollment active and does not pause billing", async () => {
  const { isBillingPausedStatus, buildStudentStatusUpdateData } = await import(
    "./lifecycle-service"
  );
  assert.equal(isBillingPausedStatus("FROZEN"), false);
  assert.equal(enrollmentStatusForStudentLifecycle("FROZEN"), "ACTIVE");
  const data = buildStudentStatusUpdateData("FROZEN", new Date("2026-09-01T00:00:00Z"));
  assert.equal(data.billingPaused, false);
  assert.equal(data.freezeReserved, true);
});

function activationTx(enrollment: {
  startDate: Date;
  firstLessonAt: Date | null;
  billingAnchorDate?: Date | null;
  frozenAtDue?: boolean;
  admissionTracking?: boolean;
}) {
  let enrollmentUpdate: unknown;
  const studentUpdates: unknown[] = [];
  let invoiceUpdate: unknown;
  const tx = {
    $queryRaw: async () => [],
    studentStatusHistory: { findFirst: async () => enrollment.frozenAtDue ? { newStatus: "FROZEN" } : null },
    student: {
      update: async (args: unknown) => {
        studentUpdates.push(args);
      },
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
          admissionTracking: enrollment.admissionTracking ?? false,
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
      findFirst: async (args: { where: { OR: unknown } }) => {
        assert.deepEqual(args.where.OR, [{ enrollmentId: "enrollment-1" }, { enrollmentId: null }]);
        return ({
        id: "invoice-1",
        amount: 200,
        balanceDue: 0,
        enrollmentId: "enrollment-1",
      }); },
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

test("confirmed return attendance anchors the new period without changing the original first lesson", async () => {
  for (const scenario of [
    { original: "2026-08-11", returned: "2026-10-04", next: "2026-11-04" },
    { original: "2026-04-01", returned: "2026-09-27", next: "2026-10-27" },
  ]) {
    const original = utcDate(scenario.original);
    const returned = utcDate(scenario.returned);
    const state = activationTx({ startDate: original, firstLessonAt: original });
    const result = await syncActivationBilling(state.tx, {
      studentId: "student-test", studentCode: "ART-TEST", effectiveAt: returned,
      isReactivation: true, useActualLessonDate: true,
    });
    assert.equal(result.originalFirstLessonAt.toISOString(), original.toISOString());
    assert.equal(result.billingAnchorDate.toISOString(), returned.toISOString());
    assert.deepEqual(state.getStudentUpdates(), [{ where: { id: "student-test" }, data: { billingAnchorDate: returned } }]);
    const invoice = state.getInvoiceUpdate() as { data: { dueDate: Date } };
    assert.equal(invoice.data.dueDate.toISOString(), returned.toISOString());
    const { billingDateForMonth } = await import("./payment-billing-period");
    const nextMonth = new Date(Date.UTC(returned.getUTCFullYear(), returned.getUTCMonth() + 1, 1));
    assert.equal(billingDateForMonth(nextMonth, result.billingAnchorDate).toISOString(), utcDate(scenario.next).toISOString());
  }
});

test("new admission with an absent planned first day records the actual first lesson as its origin",async()=>{
  const planned=utcDate("2026-10-01"),actual=utcDate("2026-10-05");
  const state=activationTx({startDate:planned,firstLessonAt:planned,billingAnchorDate:null,admissionTracking:true});
  const result=await syncActivationBilling(state.tx,{studentId:"new-student",studentCode:"SYNTH",effectiveAt:actual,useActualLessonDate:true});
  assert.equal(result.originalFirstLessonAt.toISOString(),actual.toISOString());
  assert.equal(result.billingAnchorDate.toISOString(),actual.toISOString());
  assert.deepEqual(state.getStudentUpdates(),[
    {where:{id:"new-student",billingAnchorDate:null},data:{originalFirstLessonAt:actual}},
    {where:{id:"new-student"},data:{billingAnchorDate:actual}},
  ]);
});

test("completion closes enrollment and outstanding invoices without deleting history", async () => {
  let enrollmentUpdate: unknown;
  let invoiceUpdate: unknown;
  let scheduleUpdateCalled = false;
  const tx = {
    enrollment: {
      findMany: async () => [{ id: "enrollment-1", teacherId: null }],
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
    studentScheduleAssignment: {
      deleteMany: async () => ({ count: 0 }),
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

test("slot activation after freezing cannot recreate the cancelled month", async () => {
  const { tx, getInvoiceUpdate } = activationTx({
    startDate: utcDate("2026-02-07"),
    firstLessonAt: utcDate("2026-02-07"),
    frozenAtDue: true,
  });
  await syncActivationBilling(tx, {
    studentId: "student-1", studentCode: "ART-0001", effectiveAt: utcDate("2026-08-17"),
  });
  assert.equal((getInvoiceUpdate() as { data: { periodMonth: Date } }).data.periodMonth.toISOString().slice(0,10), "2026-09-01");
});

test("reactivation before a future anchor month cannot invoice the earlier month", () => {
  const period = resolveActivationBillingPeriod({
    effectiveAt: utcDate("2026-08-29"),
    billingAnchorDate: utcDate("2026-09-14"),
    isReactivation: true,
  });

  assert.equal(period.toISOString().slice(0, 10), "2026-09-01");
});
