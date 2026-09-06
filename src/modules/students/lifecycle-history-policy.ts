import { Prisma, type StudentLifecycleStatus } from "@/generated/prisma/client";
import { PublicActionError } from "@/server/actions/public-action-error";

export function classifyLifecycleHistoryChange(input: {
  currentStatus: StudentLifecycleStatus;
  requestedStatus: StudentLifecycleStatus;
  laterStatus: StudentLifecycleStatus | null;
  hasLaterReactivation: boolean;
}) {
  if (!input.laterStatus) return { historicalOnly: false };
  if (
    input.requestedStatus === "FROZEN"
    && input.currentStatus === "ACTIVE"
    && input.laterStatus === "ACTIVE"
    && input.hasLaterReactivation
  ) return { historicalOnly: true };
  throw new PublicActionError(
    "Seçilən tarixdən sonra status dəyişiklikləri var. Tarixlər ziddiyyət təşkil edir; sonrakı bərpa və status qeydləri yoxlanılmalıdır. Cari status və slotlar dəyişdirilmədi.",
  );
}

/** Lock the student so concurrent status edits cannot use stale lifecycle state. */
export async function planLifecycleHistoryChange(
  tx: Prisma.TransactionClient,
  input: {
    studentId: string;
    currentStatus: StudentLifecycleStatus;
    requestedStatus: StudentLifecycleStatus;
    effectiveAt: Date;
  },
) {
  const locked = await tx.$queryRaw<Array<{ status: StudentLifecycleStatus }>>(Prisma.sql`
    select lifecycle_status::text as status from erp.students
    where id = ${input.studentId}::uuid for update
  `);
  if (locked[0]?.status !== input.currentStatus) {
    throw new PublicActionError("Tələbənin statusu dəyişib. Səhifəni yeniləyib təkrar yoxlayın.");
  }
  const later = await tx.studentStatusHistory.findFirst({
    where: { studentId: input.studentId, effectiveAt: { gt: input.effectiveAt } },
    orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    select: { newStatus: true },
  });
  const reactivation = later ? await tx.studentStatusHistory.findFirst({
    where: {
      studentId: input.studentId,
      effectiveAt: { gt: input.effectiveAt },
      eventType: "REACTIVATED",
    },
    select: { id: true },
  }) : null;
  return classifyLifecycleHistoryChange({
    ...input,
    laterStatus: later?.newStatus ?? null,
    hasLaterReactivation: Boolean(reactivation),
  });
}
