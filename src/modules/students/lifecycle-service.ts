import {
  EnrollmentStatus,
  InvoiceStatus,
  Prisma,
  StudentLifecycleEventType,
  StudentLifecycleStatus,
} from "@/generated/prisma/client";
import { toNumber } from "@/modules/shared/format";
import { billingDateForMonth } from "@/modules/students/payment-billing-period";
import { resolveEnrollmentBillingTerms } from "@/modules/students/enrollment-billing-terms";

export function isBillingPausedStatus(status: StudentLifecycleStatus) {
  switch (status) {
    case StudentLifecycleStatus.SLOT_WAITING:
    case StudentLifecycleStatus.FROZEN:
    case StudentLifecycleStatus.STOPPED:
    case StudentLifecycleStatus.DECLINED:
    case StudentLifecycleStatus.COMPLETED:
      return true;
    default:
      return false;
  }
}

export function enrollmentStatusForStudentLifecycle(status: StudentLifecycleStatus) {
  return status === StudentLifecycleStatus.ACTIVE
    ? EnrollmentStatus.ACTIVE
    : EnrollmentStatus.PAUSED;
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

export function getStatusChangeReason(
  status: StudentLifecycleStatus,
  previousStatus?: StudentLifecycleStatus,
) {
  if (status === StudentLifecycleStatus.ACTIVE) {
    if (
      previousStatus === StudentLifecycleStatus.FROZEN
      || previousStatus === StudentLifecycleStatus.STOPPED
    ) {
      return "Tələbə yenidən aktiv edildi";
    }
    return "Tələbə aktiv edildi";
  }

  if (status === StudentLifecycleStatus.SLOT_WAITING) {
    if (previousStatus && isInactiveStudentStatus(previousStatus)) {
      return "Tələbə geri qayıtdı və yeni slot gözləyir";
    }
    return "Tələbə slot gözləyir statusuna keçirildi";
  }

  if (status === StudentLifecycleStatus.DECLINED) {
    return "Tələbə imtina etdi";
  }

  if (status === StudentLifecycleStatus.STOPPED) {
    return "Tələbə dayandırıldı";
  }

  if (status === StudentLifecycleStatus.COMPLETED) {
    return "Tələbə tədrisi tamamladı və maliyyə öhdəliyi bağlandı";
  }

  return "Tələbə statusu yeniləndi";
}

export function isInactiveStudentStatus(status: StudentLifecycleStatus) {
  return status === StudentLifecycleStatus.FROZEN
    || status === StudentLifecycleStatus.STOPPED
    || status === StudentLifecycleStatus.COMPLETED
    || status === StudentLifecycleStatus.DECLINED;
}

export function isReactivationTransition(
  previousStatus: StudentLifecycleStatus,
  nextStatus: StudentLifecycleStatus,
) {
  return isInactiveStudentStatus(previousStatus)
    && nextStatus === StudentLifecycleStatus.SLOT_WAITING;
}

export function getStudentLifecycleEventType(
  previousStatus: StudentLifecycleStatus,
  nextStatus: StudentLifecycleStatus,
) {
  return isReactivationTransition(previousStatus, nextStatus)
    ? StudentLifecycleEventType.REACTIVATED
    : StudentLifecycleEventType.STATUS_CHANGE;
}

export function assertManualStudentStatusTransition(
  previousStatus: StudentLifecycleStatus,
  nextStatus: StudentLifecycleStatus,
) {
  if (previousStatus !== nextStatus && nextStatus === StudentLifecycleStatus.ACTIVE) {
    throw new Error(
      "Tələbə birbaşa aktiv edilə bilməz. Əvvəl Slot gözləyir statusuna keçirin, sonra müəllim və slot seçin.",
    );
  }
}

export async function pauseStudentLifecycleRelations(
  tx: Prisma.TransactionClient,
  input: {
    studentId: string;
    effectiveAt: Date;
    changedById?: string;
    clearTeacherAssignment: boolean;
  },
) {
  const enrollments = await tx.enrollment.findMany({
    where: {
      studentId: input.studentId,
      status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.PAUSED] },
    },
    select: { id: true, teacherId: true },
  });
  const enrollmentIds = enrollments.map((enrollment) => enrollment.id);

  const futureAssignments = enrollmentIds.length
    ? await tx.studentScheduleAssignment.deleteMany({
        where: {
          enrollmentId: { in: enrollmentIds },
          validTo: null,
          validFrom: { gte: input.effectiveAt },
        },
      })
    : { count: 0 };
  const closedScheduleAssignmentCount = enrollmentIds.length
    ? await tx.$executeRaw(Prisma.sql`
        update erp.student_schedule_assignments
        set valid_to = ${input.effectiveAt}::date - 1, updated_at = now()
        where enrollment_id in (${Prisma.join(
          enrollmentIds.map((id) => Prisma.sql`${id}::uuid`),
        )})
          and valid_to is null
          and valid_from < ${input.effectiveAt}::date
      `)
    : 0;

  const pausedEnrollments = await tx.enrollment.updateMany({
    where: {
      id: { in: enrollmentIds },
      status: EnrollmentStatus.ACTIVE,
    },
    data: { status: EnrollmentStatus.PAUSED },
  });

  const teacherAssignments = input.clearTeacherAssignment
    ? enrollments.filter((enrollment) => enrollment.teacherId)
    : [];
  if (teacherAssignments.length) {
    await tx.teacherAssignmentHistory.createMany({
      data: teacherAssignments.map((enrollment) => ({
        enrollmentId: enrollment.id,
        oldTeacherId: enrollment.teacherId,
        newTeacherId: null,
        reason: "Tələbə geri qayıtdı; yeni müəllim və slot seçilməlidir",
        changedById: input.changedById,
      })),
    });
    await tx.enrollment.updateMany({
      where: { id: { in: teacherAssignments.map((enrollment) => enrollment.id) } },
      data: { teacherId: null },
    });
  }

  return {
    pausedEnrollmentCount: pausedEnrollments.count,
    deletedFutureScheduleAssignmentCount: futureAssignments.count,
    closedScheduleAssignmentCount,
    clearedTeacherAssignmentCount: teacherAssignments.length,
  };
}

export async function closeCompletedStudentBilling(
  tx: Prisma.TransactionClient,
  studentId: string,
  effectiveAt: Date,
) {
  const scheduleResult = await pauseStudentLifecycleRelations(tx, {
    studentId,
    effectiveAt,
    clearTeacherAssignment: false,
  });
  const [enrollments, invoices] = await Promise.all([
    tx.enrollment.updateMany({
      where: {
        studentId,
        status: {
          in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.PAUSED],
        },
      },
      data: {
        status: EnrollmentStatus.COMPLETED,
      },
    }),
    tx.invoice.updateMany({
      where: {
        studentId,
        status: { not: InvoiceStatus.VOID },
        balanceDue: { gt: 0 },
      },
      data: {
        status: InvoiceStatus.VOID,
        balanceDue: 0,
      },
    }),
  ]);

  return {
    completedEnrollmentCount: enrollments.count,
    voidedInvoiceCount: invoices.count,
    closedScheduleAssignmentCount:
      scheduleResult.closedScheduleAssignmentCount
      + scheduleResult.deletedFutureScheduleAssignmentCount,
  };
}

export async function syncActivationBilling(
  tx: Prisma.TransactionClient,
  input: {
    studentId: string;
    studentCode: string;
    effectiveAt: Date;
    isReactivation?: boolean;
  }
) {
  const enrollment = await tx.enrollment.findFirst({
    where: {
      studentId: input.studentId,
      status: {
        in: [
          EnrollmentStatus.ACTIVE,
          EnrollmentStatus.PAUSED,
          EnrollmentStatus.COMPLETED,
        ],
      },
    },
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      startDate: true,
      firstLessonAt: true,
      monthlyFee: true,
      lessonsPerMonth: true,
      discountType: true,
      student: {
        select: {
          originalFirstLessonAt: true,
          billingAnchorDate: true,
        },
      },
    },
  });

  if (!enrollment) {
    throw new Error("Aktiv etmək üçün tələbənin enrollment məlumatı tapılmadı");
  }

  const originalFirstLessonAt =
    enrollment.student.originalFirstLessonAt
    ?? enrollment.firstLessonAt
    ?? input.effectiveAt;
  const currentFirstLessonAt = input.isReactivation
    ? input.effectiveAt
    : enrollment.firstLessonAt ?? input.effectiveAt;
  const billingAnchorDate = enrollment.student.billingAnchorDate ?? originalFirstLessonAt;

  if (!enrollment.student.originalFirstLessonAt) {
    await tx.student.updateMany({
      where: { id: input.studentId, originalFirstLessonAt: null },
      data: { originalFirstLessonAt },
    });
  }

  if (!enrollment.student.billingAnchorDate) {
    await tx.student.updateMany({
      where: { id: input.studentId, billingAnchorDate: null },
      data: { billingAnchorDate },
    });
  }

  await tx.enrollment.update({
    where: { id: enrollment.id },
    data: {
      status: EnrollmentStatus.ACTIVE,
      startDate: input.isReactivation
        ? input.effectiveAt
        : enrollment.firstLessonAt
          ? enrollment.startDate
          : input.effectiveAt,
      firstLessonAt: currentFirstLessonAt,
    },
  });

  let periodMonth = resolveActivationBillingPeriod({
    effectiveAt: input.effectiveAt,
    billingAnchorDate,
    isReactivation: Boolean(input.isReactivation),
  });
  let dueDate = billingDateForMonth(periodMonth, billingAnchorDate);
  const [explicitFreeze] = await tx.$queryRaw<Array<{ dueDate: Date | null }>>(Prisma.sql`
    select erp.next_unfrozen_billing_date(${input.studentId}::uuid,${periodMonth}::date) as "dueDate"
  `);
  if (explicitFreeze && !explicitFreeze.dueDate) throw new Error("Dondurulma dövrü açıqdır. Əvvəlcə bərpa tarixini qeyd edin.");
  if (explicitFreeze?.dueDate) {
    dueDate = explicitFreeze.dueDate;
    periodMonth = startOfMonth(dueDate);
  }
  const historyAtDue = await tx.studentStatusHistory.findFirst({
    where: { studentId: input.studentId, effectiveAt: { lte: billingDateForMonth(periodMonth,billingAnchorDate) } },
    orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    select: { newStatus: true, freezeReserved: true },
  });
  if (historyAtDue?.newStatus === StudentLifecycleStatus.FROZEN && !historyAtDue.freezeReserved) {
    // An import/slot activation must not recreate a cycle cancelled for freezing.
    periodMonth = new Date(Date.UTC(periodMonth.getUTCFullYear(), periodMonth.getUTCMonth() + 1, 1));
    dueDate = billingDateForMonth(periodMonth, billingAnchorDate);
  }
  const [paymentRule] = await tx.$queryRaw<Array<{dueDate:Date}>>(Prisma.sql`
    select erp.student_payment_due_date(${input.studentId}::uuid,${periodMonth}::date) as "dueDate"
  `);
  if (paymentRule?.dueDate) dueDate=paymentRule.dueDate;
  const existingInvoice = await tx.invoice.findFirst({
    where: {
      studentId: input.studentId,
      status: { not: InvoiceStatus.VOID },
      periodMonth,
      OR: [{ enrollmentId: enrollment.id }, { enrollmentId: null }],
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
        periodMonth,
        dueDate,
        status: resolveInvoiceStatus({
          amount: toNumber(existingInvoice.amount),
          balanceDue: toNumber(existingInvoice.balanceDue),
          dueDate,
        }),
      },
    });
    return {
      enrollmentId: enrollment.id,
      previousFirstLessonAt: enrollment.firstLessonAt,
      currentFirstLessonAt,
      originalFirstLessonAt,
      billingAnchorDate,
      reactivated: Boolean(input.isReactivation),
    };
  }

  const billingTerms = await resolveEnrollmentBillingTerms(tx, {
    enrollmentId: enrollment.id,
    periodMonth,
    fallbackMonthlyFee: toNumber(enrollment.monthlyFee),
    fallbackLessonsPerMonth: enrollment.lessonsPerMonth,
    fallbackDiscountType: enrollment.discountType,
  });
  const amount = billingTerms.monthlyFee;

  await tx.invoice.create({
    data: {
      studentId: input.studentId,
      enrollmentId: enrollment.id,
      periodMonth,
      issueDate: dueDate,
      dueDate,
      amount,
      balanceDue: amount,
      status: resolveInvoiceStatus({
        amount,
        balanceDue: amount,
        dueDate,
      }),
      idempotencyKey: `student-activation-${input.studentCode}-${periodMonth.toISOString().slice(0, 10)}`,
    },
  });

  return {
    enrollmentId: enrollment.id,
    previousFirstLessonAt: enrollment.firstLessonAt,
    currentFirstLessonAt,
    originalFirstLessonAt,
    billingAnchorDate,
    reactivated: Boolean(input.isReactivation),
  };
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

export function resolveActivationBillingPeriod({
  effectiveAt,
  billingAnchorDate,
  isReactivation,
}: {
  effectiveAt: Date;
  billingAnchorDate: Date;
  isReactivation: boolean;
}) {
  const currentMonth = startOfMonth(effectiveAt);
  const anchorMonth = startOfMonth(billingAnchorDate);
  const firstEligibleMonth = anchorMonth > currentMonth
    ? anchorMonth
    : currentMonth;
  if (!isReactivation) return firstEligibleMonth;

  const currentDueDate = billingDateForMonth(firstEligibleMonth, billingAnchorDate);
  if (effectiveAt.getTime() <= currentDueDate.getTime()) return firstEligibleMonth;

  return new Date(Date.UTC(
    firstEligibleMonth.getUTCFullYear(),
    firstEligibleMonth.getUTCMonth() + 1,
    1,
  ));
}

function startOfMonth(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}
