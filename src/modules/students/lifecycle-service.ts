import {
  EnrollmentStatus,
  InvoiceStatus,
  StudentLifecycleStatus,
} from "@/generated/prisma/client";
import type { Prisma } from "@/generated/prisma/client";
import { toNumber } from "@/modules/shared/format";

export function isBillingPausedStatus(status: StudentLifecycleStatus) {
  switch (status) {
    case StudentLifecycleStatus.GROUP_WAITING:
    case StudentLifecycleStatus.FROZEN:
    case StudentLifecycleStatus.STOPPED:
    case StudentLifecycleStatus.DECLINED:
    case StudentLifecycleStatus.COMPLETED:
      return true;
    default:
      return false;
  }
}

export function buildStudentStatusUpdateData(
  status: StudentLifecycleStatus,
  effectiveAt: Date
): Prisma.StudentUpdateInput {
  const data: Prisma.StudentUpdateInput = {
    lifecycleStatus: status,
    billingPaused: isBillingPausedStatus(status),
  };

  if (status === StudentLifecycleStatus.ACTIVE) {
    data.stoppedAt = null;
    data.completedAt = null;
    data.freezeReturnAt = null;
  }

  if (status === StudentLifecycleStatus.STOPPED || status === StudentLifecycleStatus.DECLINED) {
    data.stoppedAt = effectiveAt;
  }

  if (status === StudentLifecycleStatus.COMPLETED) {
    data.completedAt = effectiveAt;
  }

  return data;
}

export function getStatusChangeReason(status: StudentLifecycleStatus) {
  if (status === StudentLifecycleStatus.ACTIVE) {
    return "Tələbə aktiv edildi";
  }

  if (status === StudentLifecycleStatus.GROUP_WAITING) {
    return "Tələbə qrup gözləyir statusuna keçirildi";
  }

  if (status === StudentLifecycleStatus.DECLINED) {
    return "Tələbə imtina etdi";
  }

  if (status === StudentLifecycleStatus.STOPPED) {
    return "Tələbə dayandırıldı";
  }

  return "Tələbə statusu yeniləndi";
}

export async function syncActivationBilling(
  tx: Prisma.TransactionClient,
  input: {
    studentId: string;
    studentCode: string;
    effectiveAt: Date;
  }
) {
  const enrollment = await tx.enrollment.findFirst({
    where: {
      studentId: input.studentId,
      status: {
        in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.PAUSED],
      },
    },
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      monthlyFee: true,
    },
  });

  if (!enrollment) {
    throw new Error("Aktiv etmək üçün tələbənin enrollment məlumatı tapılmadı");
  }

  await tx.enrollment.update({
    where: { id: enrollment.id },
    data: {
      status: EnrollmentStatus.ACTIVE,
      startDate: input.effectiveAt,
      firstLessonAt: input.effectiveAt,
    },
  });

  const existingInvoice = await tx.invoice.findFirst({
    where: {
      studentId: input.studentId,
      status: { not: InvoiceStatus.VOID },
      periodMonth: startOfMonth(input.effectiveAt),
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      amount: true,
      balanceDue: true,
      enrollmentId: true,
    },
  });

  if (existingInvoice) {
    await tx.invoice.update({
      where: { id: existingInvoice.id },
      data: {
        enrollmentId: existingInvoice.enrollmentId ?? enrollment.id,
        periodMonth: startOfMonth(input.effectiveAt),
        dueDate: input.effectiveAt,
        status: resolveInvoiceStatus({
          amount: toNumber(existingInvoice.amount),
          balanceDue: toNumber(existingInvoice.balanceDue),
          dueDate: input.effectiveAt,
        }),
      },
    });
    return;
  }

  const amount = toNumber(enrollment.monthlyFee);

  await tx.invoice.create({
    data: {
      studentId: input.studentId,
      enrollmentId: enrollment.id,
      periodMonth: startOfMonth(input.effectiveAt),
      issueDate: input.effectiveAt,
      dueDate: input.effectiveAt,
      amount,
      balanceDue: amount,
      status: resolveInvoiceStatus({
        amount,
        balanceDue: amount,
        dueDate: input.effectiveAt,
      }),
      idempotencyKey: `student-activation-${input.studentCode}-${startOfMonth(input.effectiveAt).toISOString().slice(0, 10)}`,
    },
  });
}

function resolveInvoiceStatus({
  amount,
  balanceDue,
  dueDate,
}: {
  amount: number;
  balanceDue: number;
  dueDate: Date;
}) {
  if (balanceDue <= 0) {
    return InvoiceStatus.PAID;
  }

  if (dueDate < startOfToday()) {
    return InvoiceStatus.OVERDUE;
  }

  return balanceDue < amount ? InvoiceStatus.PARTIAL : InvoiceStatus.OPEN;
}

function startOfMonth(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}
