import {
  EnrollmentStatus,
  Prisma,
  StudentLifecycleStatus,
} from "@/generated/prisma/client";
import { writeAuditLog } from "@/modules/audit/audit-service";
import { planLifecycleHistoryChange } from "@/modules/students/lifecycle-history-policy";
import {
  buildStudentStatusUpdateData,
  syncActivationBilling,
} from "@/modules/students/lifecycle-service";
import { restartStudentPaymentScheduleForActiveSlot } from "@/modules/students/payment-schedule-service";
import { isGiftDiscount } from "@/modules/students/student-create-rules";
import { PublicActionError } from "@/server/actions/public-action-error";

/**
 * BK-05…08: first monthly PRESENT activates; plan/slot/payment date do not.
 * Paid new admissions need course_sale COMPLETE before that PRESENT.
 */
export async function assertFirstPeriodFullyPaidForAttendance(
  tx: Prisma.TransactionClient,
  input: { studentId: string; enrollmentId: string },
) {
  const student = await tx.student.findUnique({
    where: { id: input.studentId },
    select: {
      id: true,
      admissionTracking: true,
      lifecycleStatus: true,
    },
  });
  if (!student) throw new PublicActionError("Tələbə tapılmadı", "NOT_FOUND");
  if (student.lifecycleStatus !== StudentLifecycleStatus.SLOT_WAITING) return;

  const enrollment = await tx.enrollment.findUnique({
    where: { id: input.enrollmentId },
    select: { id: true, monthlyFee: true, discountType: true, studentId: true },
  });
  if (!enrollment || enrollment.studentId !== input.studentId) {
    throw new PublicActionError("Tələbə paketi tapılmadı");
  }
  if (enrollment.monthlyFee.lte(0) || isGiftDiscount(enrollment.discountType)) return;
  if (!student.admissionTracking) return;

  const sale = await tx.courseSale.findFirst({
    where: {
      studentId: input.studentId,
      enrollmentId: input.enrollmentId,
      cancelledAt: null,
    },
    orderBy: [{ qualifiedAt: "desc" }, { createdAt: "desc" }],
    select: { id: true, status: true, initialFee: true },
  });
  if (!sale || sale.status !== "COMPLETE") {
    throw new PublicActionError(
      "İlk aylıq dərsə qədər ilk dövrün tam haqqı ödənməlidir və sistemdə qeydə alınmalıdır.",
    );
  }

  // Harden COMPLETE: status alone is not enough if payment rows drifted.
  const paid = await tx.payment.aggregate({
    where: { courseSaleId: sale.id },
    _sum: { amount: true },
  });
  const paidAmount = paid._sum.amount ?? new Prisma.Decimal(0);
  if (paidAmount.lt(sale.initialFee)) {
    throw new PublicActionError(
      "İlk aylıq dərsə qədər ilk dövrün tam haqqı ödənməlidir və sistemdə qeydə alınmalıdır.",
    );
  }
}

export async function activateStudentFromFirstPresent(
  tx: Prisma.TransactionClient,
  input: {
    actorId: string | null;
    studentId: string;
    enrollmentId: string;
    lessonDate: Date;
  },
) {
  await assertFirstPeriodFullyPaidForAttendance(tx, {
    studentId: input.studentId,
    enrollmentId: input.enrollmentId,
  });

  const student = await tx.student.findUnique({
    where: { id: input.studentId },
    select: {
      id: true,
      code: true,
      lifecycleStatus: true,
      billingPaused: true,
      statusHistory: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 1,
        select: { eventType: true },
      },
    },
  });
  if (!student) throw new PublicActionError("Tələbə tapılmadı", "NOT_FOUND");
  if (student.lifecycleStatus !== StudentLifecycleStatus.SLOT_WAITING) return null;

  await planLifecycleHistoryChange(tx, {
    studentId: student.id,
    currentStatus: student.lifecycleStatus,
    requestedStatus: StudentLifecycleStatus.ACTIVE,
    effectiveAt: input.lessonDate,
  });

  const isReactivation = student.statusHistory[0]?.eventType === "REACTIVATED";
  await tx.student.update({
    where: { id: student.id },
    data: buildStudentStatusUpdateData(StudentLifecycleStatus.ACTIVE, input.lessonDate),
  });
  await tx.studentStatusHistory.create({
    data: {
      studentId: student.id,
      oldStatus: student.lifecycleStatus,
      newStatus: StudentLifecycleStatus.ACTIVE,
      reason: "İlk faktiki aylıq dərs iştirakı ilə tələbə aktiv edildi",
      effectiveAt: input.lessonDate,
      changedById: input.actorId,
    },
  });
  await syncActivationBilling(tx, {
    studentId: student.id,
    studentCode: student.code,
    effectiveAt: input.lessonDate,
    isReactivation,
    useActualLessonDate: true,
  });
  await restartStudentPaymentScheduleForActiveSlot(tx, { studentId: student.id });

  if (input.actorId) {
    await writeAuditLog(tx, {
      actorUserId: input.actorId,
      action: isReactivation ? "student.reactivation.complete" : "student.status.change",
      entityType: "student",
      entityId: student.id,
      before: {
        lifecycleStatus: student.lifecycleStatus,
        billingPaused: student.billingPaused,
      },
      after: {
        lifecycleStatus: StudentLifecycleStatus.ACTIVE,
        billingPaused: false,
        reactivated: isReactivation,
        createsNewSale: false,
        activatedBy: "first_present",
        lessonDate: input.lessonDate.toISOString().slice(0, 10),
      },
      reason: "İlk faktiki aylıq dərs iştirakı ilə tələbə aktiv edildi",
    });
  }

  return { studentId: student.id, isReactivation };
}

/** BK-08: planned first lesson passed without activation — period has not started. */
export function hasMissedPlannedFirstLesson(input: {
  lifecycleStatus: StudentLifecycleStatus | string;
  plannedFirstLessonAt: Date | null | undefined;
  asOf?: Date;
}) {
  if (input.lifecycleStatus !== StudentLifecycleStatus.SLOT_WAITING) return false;
  if (!input.plannedFirstLessonAt) return false;
  const asOf = input.asOf ?? new Date();
  const today = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate()));
  const planned = new Date(Date.UTC(
    input.plannedFirstLessonAt.getUTCFullYear(),
    input.plannedFirstLessonAt.getUTCMonth(),
    input.plannedFirstLessonAt.getUTCDate(),
  ));
  return planned.getTime() < today.getTime();
}

export const attendanceEligibleEnrollmentWhere = {
  status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.PAUSED] },
  student: {
    lifecycleStatus: {
      in: [StudentLifecycleStatus.ACTIVE, StudentLifecycleStatus.SLOT_WAITING],
    },
  },
} as const;
