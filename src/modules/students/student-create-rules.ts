export const STUDENT_GIFT_DISCOUNT_VALUE = "GIFT";

export function isGiftDiscount(value: string | null | undefined) {
  return value === STUDENT_GIFT_DISCOUNT_VALUE;
}

export function resolveStudentMonthlyFee(
  discountType: string | null | undefined,
  monthlyFee: number,
) {
  return isGiftDiscount(discountType) ? 0 : monthlyFee;
}
