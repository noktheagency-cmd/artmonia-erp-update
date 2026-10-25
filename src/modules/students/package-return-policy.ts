import { EnrollmentStatus, StudentLifecycleStatus, type Prisma } from "@/generated/prisma/client";
import { PublicActionError } from "@/server/actions/public-action-error";

/** A paused package from an older visit must not block the same program on return.
 * Current ACTIVE packages and drafts from this return still conflict.
 */
export function openPackageConflictWhere(studentId: string, programId: string, returnedAt?: Date): Prisma.EnrollmentWhereInput {
  return { studentId, programId, OR: [
    {status:EnrollmentStatus.ACTIVE},
    {status:EnrollmentStatus.PAUSED,...(returnedAt ? {startDate:{gte:returnedAt}} : {})},
  ] };
}

export function planNewStudentPackage(input: {
  lifecycleStatus: StudentLifecycleStatus;
  billingPaused: boolean;
  hasOpenPackages: boolean;
  canChangeStatus: boolean;
}) {
  if (input.lifecycleStatus === StudentLifecycleStatus.DECLINED) {
    throw new PublicActionError("İmtina etmiş tələbəni əvvəlcə Slot gözləyir statusuna keçirin.");
  }
  const returningAfterCompletion = input.lifecycleStatus === StudentLifecycleStatus.COMPLETED;
  if (returningAfterCompletion && !input.canChangeStatus) {
    throw new PublicActionError("Tamamlamış tələbəni yeni paketlə qaytarmaq üçün status dəyişmə icazəsi tələb olunur.", "FORBIDDEN");
  }
  if (returningAfterCompletion && input.hasOpenPackages) {
    throw new PublicActionError("Tamamlamış tələbənin açıq paketi var. Yeni paketdən əvvəl mövcud qeydiyyatlar yoxlanılmalıdır.");
  }
  return {
    returningAfterCompletion,
    enrollmentStatus: returningAfterCompletion || input.billingPaused || input.lifecycleStatus !== StudentLifecycleStatus.ACTIVE
      ? EnrollmentStatus.PAUSED : EnrollmentStatus.ACTIVE,
  };
}
