import type { Prisma } from "@/generated/prisma/client";
import { resolveNextPaymentAt } from "@/modules/students/payment-schedule";

export async function resolveStudentNextPaymentAt(
  tx: Prisma.TransactionClient,
  input: {
    studentId: string;
    paymentMonth: Date;
  },
) {
  const assignment = await tx.studentScheduleAssignment.findFirst({
    where: {
      validTo: null,
      enrollment: {
        studentId: input.studentId,
        student: { billingPaused: false },
      },
    },
    orderBy: [{ validFrom: "desc" }, { createdAt: "desc" }],
    select: { validFrom: true },
  });

  return resolveNextPaymentAt({
    slotStartedAt: assignment?.validFrom ?? null,
    paymentMonth: input.paymentMonth,
  });
}

export async function clearStudentPaymentSchedules(
  tx: Prisma.TransactionClient,
  studentIds: string[],
) {
  const uniqueStudentIds = [...new Set(studentIds)];
  if (uniqueStudentIds.length === 0) return;

  await tx.payment.updateMany({
    where: {
      studentId: { in: uniqueStudentIds },
      nextPaymentAt: { not: null },
    },
    data: { nextPaymentAt: null },
  });
}

export async function startStudentPaymentSchedule(
  tx: Prisma.TransactionClient,
  input: {
    studentId: string;
    slotStartedAt: Date;
  },
) {
  const latestPayment = await tx.payment.findFirst({
    where: { studentId: input.studentId },
    orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
    select: { id: true, paymentMonth: true },
  });

  await clearStudentPaymentSchedules(tx, [input.studentId]);
  if (!latestPayment) return;

  await tx.payment.update({
    where: { id: latestPayment.id },
    data: {
      nextPaymentAt: resolveNextPaymentAt({
        slotStartedAt: input.slotStartedAt,
        paymentMonth: latestPayment.paymentMonth,
      }),
    },
  });
}

export async function restartStudentPaymentScheduleForActiveSlot(
  tx: Prisma.TransactionClient,
  input: {
    studentId: string;
    activatedAt: Date;
  },
) {
  const activeAssignment = await tx.studentScheduleAssignment.findFirst({
    where: {
      validTo: null,
      enrollment: { studentId: input.studentId },
    },
    select: { id: true },
  });

  if (!activeAssignment) {
    await clearStudentPaymentSchedules(tx, [input.studentId]);
    return;
  }

  await startStudentPaymentSchedule(tx, {
    studentId: input.studentId,
    slotStartedAt: input.activatedAt,
  });
}
