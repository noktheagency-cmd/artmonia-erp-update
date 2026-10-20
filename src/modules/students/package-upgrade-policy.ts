import { PublicActionError } from "@/server/actions/public-action-error";

/**
 * BK-15: package upgrade is blocked during the first billing period.
 * Upgrade may take effect only from the second period onward.
 * Downgrades and non-upgrade term edits are unaffected.
 * Before activation (no billing anchor) fee/lesson edits are initial package setup, not upgrades.
 */
export function isPackageUpgrade(input: {
  previousMonthlyFee: number;
  previousLessonsPerMonth: number | null;
  monthlyFee: number;
  lessonsPerMonth: number | null;
}) {
  if (input.monthlyFee > input.previousMonthlyFee) return true;
  if (
    input.lessonsPerMonth != null
    && input.previousLessonsPerMonth != null
    && input.lessonsPerMonth > input.previousLessonsPerMonth
  ) {
    return true;
  }
  return false;
}

export function earliestPackageUpgradeMonth(billingAnchorDate: Date) {
  const firstMonth = startOfUtcMonth(billingAnchorDate);
  return new Date(Date.UTC(firstMonth.getUTCFullYear(), firstMonth.getUTCMonth() + 1, 1));
}

export function assertPackageUpgradeAllowed(input: {
  previousMonthlyFee: number;
  previousLessonsPerMonth: number | null;
  monthlyFee: number;
  lessonsPerMonth: number | null;
  effectiveMonth: Date;
  billingAnchorDate: Date | null | undefined;
}) {
  if (!isPackageUpgrade(input)) return;
  if (!input.billingAnchorDate) return;

  const effective = startOfUtcMonth(input.effectiveMonth);
  const earliest = earliestPackageUpgradeMonth(input.billingAnchorDate);
  if (effective < earliest) {
    throw new PublicActionError(
      "İlk ay tamamlanmadan paket yüksəltmək olmaz. Yüksəltmə yalnız ikinci dərs dövründən etibarən mümkündür.",
    );
  }
}

function startOfUtcMonth(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
}
