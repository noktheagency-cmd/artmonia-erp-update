export const STUDENT_GIFT_DISCOUNT_VALUE = "GIFT";

export const studentFirstLessonModeValues = ["AUTO", "MANUAL"] as const;

export type StudentFirstLessonMode =
  (typeof studentFirstLessonModeValues)[number];

export const studentFirstLessonModeOptions = [
  { value: "AUTO", label: "Avtomatik" },
  { value: "MANUAL", label: "Manual tarix" },
] satisfies Array<{ value: StudentFirstLessonMode; label: string }>;

export function isGiftDiscount(value: string | null | undefined) {
  return value === STUDENT_GIFT_DISCOUNT_VALUE;
}

export function resolveStudentMonthlyFee(
  discountType: string | null | undefined,
  monthlyFee: number,
) {
  return isGiftDiscount(discountType) ? 0 : monthlyFee;
}

export function resolveInitialFirstLessonAt({
  lifecycleStatus,
  registeredAt,
  mode,
  requestedFirstLessonAt,
}: {
  lifecycleStatus: string;
  registeredAt: Date;
  mode: StudentFirstLessonMode;
  requestedFirstLessonAt: Date | null;
}) {
  if (mode === "MANUAL") {
    return requestedFirstLessonAt;
  }

  return lifecycleStatus === "ACTIVE" ? registeredAt : null;
}
