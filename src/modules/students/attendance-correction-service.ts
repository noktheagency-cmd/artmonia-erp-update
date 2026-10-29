import { Prisma } from "@/generated/prisma/client";
import { writeAuditLog } from "@/modules/audit/audit-service";
import { buildStudentStatusUpdateData } from "./lifecycle-service";
import { clearStudentPaymentSchedules } from "./payment-schedule-service";

/** Called after the corrected mark is persisted, under the student's row lock. */
export async function reconcileStudentAfterAttendanceCorrection(
  tx: Prisma.TransactionClient,
  input: { studentId: string; actorId: string; lessonDate: Date },
) {
  const student = await tx.student.findUnique({
    where: { id: input.studentId },
    select: { lifecycleStatus: true, billingPaused: true },
  });
  if (student?.lifecycleStatus !== "ACTIVE") return false;
  // A returning student's old course attendance does not activate the new cycle.
  const waiting = await tx.studentStatusHistory.findFirst({
    where: { studentId: input.studentId, newStatus: "SLOT_WAITING" },
    orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    select: { effectiveAt: true },
  });
  if (waiting && input.lessonDate < waiting.effectiveAt) return false;
  const present = await tx.attendanceRecord.findFirst({
    where: {
      enrollment: { studentId: input.studentId },
      status: "PRESENT",
      session: {
        status: { notIn: ["CANCELLED", "RESCHEDULED"] },
        ...(waiting ? { sessionDate: { gte: waiting.effectiveAt } } : {}),
      },
    },
    select: { id: true },
  });
  if (present) return false;
  const reason = "Davamiyyət düzəlişi: ilk faktiki dərs iştirakı qalmadığı üçün Slot gözləyir statusuna qaytarıldı";
  await tx.student.update({ where: { id: input.studentId }, data: buildStudentStatusUpdateData("SLOT_WAITING", input.lessonDate) });
  await tx.studentStatusHistory.create({ data: {
    studentId: input.studentId, oldStatus: "ACTIVE", newStatus: "SLOT_WAITING",
    effectiveAt: waiting && waiting.effectiveAt > input.lessonDate ? waiting.effectiveAt : input.lessonDate,
    changedById: input.actorId, reason,
  } });
  await tx.enrollment.updateMany({ where: { studentId: input.studentId, status: "ACTIVE" }, data: { status: "PAUSED" } });
  await clearStudentPaymentSchedules(tx, [input.studentId]);
  await writeAuditLog(tx, {
    actorUserId: input.actorId, action: "student.activation.reverse", entityType: "student", entityId: input.studentId,
    before: student, after: { lifecycleStatus: "SLOT_WAITING", billingPaused: true }, reason,
  });
  return true;
}
