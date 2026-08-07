import type { Prisma } from "@/generated/prisma/client";
import { resolveNextPaymentAt } from "@/modules/students/payment-schedule";

export async function resolveStudentNextPaymentAt(
  tx: Prisma.TransactionClient,
  input: {
    studentId: string;
    paymentMonth: Date;
  },
) {
  const membership = await tx.groupMembership.findFirst({
    where: {
      endedAt: null,
      group: { isActive: true },
      enrollment: {
        studentId: input.studentId,
        student: { billingPaused: false },
      },
    },
    orderBy: [{ joinedAt: "desc" }, { createdAt: "desc" }],
    select: { joinedAt: true },
  });

  return resolveNextPaymentAt({
    groupJoinedAt: membership?.joinedAt ?? null,
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
    groupStartedAt: Date;
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
        groupJoinedAt: input.groupStartedAt,
        paymentMonth: latestPayment.paymentMonth,
      }),
    },
  });
}

export async function restartStudentPaymentScheduleForActiveGroup(
  tx: Prisma.TransactionClient,
  input: {
    studentId: string;
    activatedAt: Date;
  },
) {
  const activeMembership = await tx.groupMembership.findFirst({
    where: {
      endedAt: null,
      group: { isActive: true },
      enrollment: { studentId: input.studentId },
    },
    select: { id: true },
  });

  if (!activeMembership) {
    await clearStudentPaymentSchedules(tx, [input.studentId]);
    return;
  }

  await startStudentPaymentSchedule(tx, {
    studentId: input.studentId,
    groupStartedAt: input.activatedAt,
  });
}
