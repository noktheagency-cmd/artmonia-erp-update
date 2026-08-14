export const studentPaymentScheduleTypeValues = ["MONTHLY", "ONE_TIME"] as const;

export type StudentPaymentScheduleType =
  (typeof studentPaymentScheduleTypeValues)[number];

export const studentPaymentScheduleTypeOptions = [
  { value: "MONTHLY", label: "Aylıq ödəniş" },
  { value: "ONE_TIME", label: "Birdəfəlik tam ödəniş" },
] satisfies Array<{ value: StudentPaymentScheduleType; label: string }>;

export function getStudentPaymentScheduleTypeLabel(
  value: string | null | undefined,
) {
  return value === "ONE_TIME" ? "Birdəfəlik tam ödəniş" : "Aylıq ödəniş";
}
