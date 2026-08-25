"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { writeAuditLog } from "@/modules/audit/audit-service";
import { isPrivilegedActor, requireMutationActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";

export async function applyBillingMigrationReviewAction(formData: FormData): Promise<void> {
  const actor = await requireMutationActor("billing.invoice.read");
  if (!isPrivilegedActor(actor)) {
    throw new Error("Billing migration təsdiqi yalnız rəhbərlik rolu üçün açıqdır.");
  }

  const reviewId = String(formData.get("reviewId") ?? "").trim();
  if (!reviewId) throw new Error("Migration review seçilməyib.");

  const prisma = getPrisma();
  await prisma.$transaction(async (tx) => {
    const review = await tx.studentBillingMigrationReview.findUnique({
      where: { id: reviewId },
    });
    if (!review) throw new Error("Migration review tapılmadı.");
    if (review.reviewStatus !== "PENDING") return;
    if (!review.billingAnchorDate) {
      throw new Error("İlk dərs tarixi təsdiqlənmədən bu qeyd tətbiq edilə bilməz.");
    }

    const cleared = await tx.payment.updateMany({
      where: { studentId: review.studentId, nextPaymentAt: { not: null } },
      data: { nextPaymentAt: null },
    });
    await tx.studentBillingMigrationReview.update({
      where: { id: review.id },
      data: {
        reviewStatus: "APPLIED",
        reviewedById: actor.id,
        reviewedAt: new Date(),
        appliedAt: new Date(),
      },
    });
    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "student.billing_migration.apply",
      entityType: "student",
      entityId: review.studentId,
      before: {
        legacyNextPaymentAt: review.oldNextPaymentAt?.toISOString() ?? null,
        reviewStatus: review.reviewStatus,
      } satisfies Prisma.InputJsonValue,
      after: {
        billingAnchorDate: review.billingAnchorDate.toISOString(),
        proposedNextPaymentAt: review.proposedNextPaymentAt?.toISOString() ?? null,
        legacyPaymentDatesCleared: cleared.count,
        reviewStatus: "APPLIED",
      } satisfies Prisma.InputJsonValue,
      reason: `${actor.fullName} billing migration uyğunsuzluğunu təsdiqlədi`,
    });
  });

  revalidatePath("/finance/billing-migration");
  revalidatePath("/students");
  revalidatePath("/finance");
}
