import { Prisma } from "@/generated/prisma/client";
import { resolveNextPaymentAt } from "@/modules/students/payment-schedule";

export async function resolveStudentNextPaymentAt(
  tx: Prisma.TransactionClient,
  input: {
    studentId: string;
    paymentMonth: Date;
  },
) {
  const openCycle = await tx.studentBillingCycle.findFirst({
    where: {
      studentId: input.studentId,
      status: { in: ["DRAFT", "OPEN", "PARTIAL", "OVERDUE"] },
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    select: { dueDate: true },
  });

  if (openCycle) return openCycle.dueDate;

  const student = await tx.student.findUnique({
    where: { id: input.studentId },
    select: { billingAnchorDate: true, billingPaused: true },
  });

  if (!student || student.billingPaused) return null;

  const candidate = resolveNextPaymentAt({
    billingAnchorDate: student.billingAnchorDate,
    paymentMonth: input.paymentMonth,
  });
  if (!candidate) return null;
  const [row] = await tx.$queryRaw<Array<{ dueDate: Date | null }>>(Prisma.sql`
    select erp.next_unfrozen_billing_date(${input.studentId}::uuid,${candidate}::date) as "dueDate"
  `);
  return row?.dueDate ?? null;
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
  void input.slotStartedAt;
  await clearStudentPaymentSchedules(tx, [input.studentId]);
}

export async function restartStudentPaymentScheduleForActiveSlot(
  tx: Prisma.TransactionClient,
  input: {
    studentId: string;
  },
) {
  await clearStudentPaymentSchedules(tx, [input.studentId]);
}
