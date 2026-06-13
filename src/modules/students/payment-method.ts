export const studentPaymentMethodValues = [
  "CASH",
  "CARD",
  "BANK_TRANSFER",
  "ONLINE",
  "OTHER",
] as const;

export const studentPaymentMethodLabels: Record<
  (typeof studentPaymentMethodValues)[number],
  string
> = {
  CASH: "Nağd",
  CARD: "Kart",
  BANK_TRANSFER: "Bank köçürməsi",
  ONLINE: "Onlayn",
  OTHER: "Digər",
};

export const studentPaymentMethodOptions = studentPaymentMethodValues.map((value) => ({
  value,
  label: studentPaymentMethodLabels[value],
}));

export function getStudentPaymentMethodLabel(value: string) {
  return (
    studentPaymentMethodLabels[
      value as (typeof studentPaymentMethodValues)[number]
    ] ?? value
  );
}
