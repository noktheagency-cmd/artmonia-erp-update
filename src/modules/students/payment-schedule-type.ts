export const studentPaymentScheduleTypeValues = ["MONTHLY", "ONE_TIME"] as const;

export type StudentPaymentScheduleType =
  (typeof studentPaymentScheduleTypeValues)[number];

export const studentPaymentScheduleTypeOptions = [
  { value: "MONTHLY", label: "Aylıq ödəniş" },
  { value: "ONE_TIME", label: "Birdəfəlik tam ödəniş" },
] satisfies Array<{ value: StudentPaymentScheduleType; label: string }>;

export const AVANS_PAYMENT_KIND = "AVANS";
export const AVANS_DEFAULT_AMOUNT = "20.00";

export const studentPaymentKindOptions = [
  { value: "MONTHLY", label: "Aylıq ödəniş" },
  { value: "ONE_TIME", label: "Birdəfəlik tam ödəniş" },
  { value: AVANS_PAYMENT_KIND, label: "Avans" },
];

export function storedScheduleTypeForPaymentKind(kind: string): StudentPaymentScheduleType {
  return kind === "ONE_TIME" ? "ONE_TIME" : "MONTHLY";
}

export function getStudentPaymentScheduleTypeLabel(
  value: string | null | undefined,
) {
  return value === "ONE_TIME" ? "Birdəfəlik tam ödəniş" : "Aylıq ödəniş";
}
