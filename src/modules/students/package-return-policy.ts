import { EnrollmentStatus, StudentLifecycleStatus } from "@/generated/prisma/client";
import { PublicActionError } from "@/server/actions/public-action-error";

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
