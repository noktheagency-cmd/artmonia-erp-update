import assert from "node:assert/strict";
import test from "node:test";
import { assertFirstLessonAttendancePaymentAllowed } from "./first-lesson-payment-gate";
import { Prisma } from "@/generated/prisma/client";
import { assertFirstPeriodFullyPaidForAttendance } from "./activation-from-attendance";

for (const status of ["present", "absent", "excused"]) {
  test(`unpaid first lesson rejects a forged ${status} attendance mark`, () => {
    assert.throws(() => assertFirstLessonAttendancePaymentAllowed(new Set(["unpaid"]), [
      { enrollmentId: "paid", status: "present" },
      { enrollmentId: "unpaid", status },
    ]), /tam ödənişi/);
  });
}

test("an unmarked unpaid student does not prevent saving paid classmates", () => {
  assert.doesNotThrow(() => assertFirstLessonAttendancePaymentAllowed(new Set(["unpaid"]), [
    { enrollmentId: "unpaid", status: null },
    { enrollmentId: "paid", status: "present" },
  ]));
});

test("completing payment unlocks every manual attendance mark", () => {
  for (const status of ["present", "absent", "excused"]) {
    assert.doesNotThrow(() => assertFirstLessonAttendancePaymentAllowed(new Set(), [
      { enrollmentId: "paid", status },
    ]));
  }
});

test("a future-dated receipt unlocks the first lesson only on its payment day", async () => {
  const receiptDate = new Date("2026-10-27T00:00:00Z");
  const tx = {
    student: { findUnique: async () => ({ id: "student", admissionTracking: true, lifecycleStatus: "SLOT_WAITING" }) },
    enrollment: { findUnique: async () => ({ id: "enrollment", studentId: "student", monthlyFee: new Prisma.Decimal(149), discountType: null }) },
    courseSale: { findFirst: async () => ({ id: "sale", status: "COMPLETE", initialFee: new Prisma.Decimal(149) }) },
    payment: { aggregate: async ({ where }: { where: { paidAt?: { lte: Date } } }) => ({
      _sum: { amount: new Prisma.Decimal(!where.paidAt || receiptDate <= where.paidAt.lte ? 149 : 0) },
    }) },
  } as unknown as Prisma.TransactionClient;
  await assert.rejects(() => assertFirstPeriodFullyPaidForAttendance(tx, {
    studentId: "student", enrollmentId: "enrollment", lessonDate: new Date("2026-10-26T00:00:00Z"),
  }), /tam haqqı/);
  await assert.doesNotReject(() => assertFirstPeriodFullyPaidForAttendance(tx, {
    studentId: "student", enrollmentId: "enrollment", lessonDate: receiptDate,
  }));
});
