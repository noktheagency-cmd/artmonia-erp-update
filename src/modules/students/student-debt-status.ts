export type StudentPaymentStatusTone = "success" | "neutral" | "warning" | "danger";

export function isStudentDebtDue({
  balance,
  nextPaymentAt,
  today,
}: {
  balance: number;
  nextPaymentAt: Date | null | undefined;
  today: Date;
}) {
  return balance > 0 && (!nextPaymentAt || nextPaymentAt <= today);
}

export function resolveStudentPaymentStatus({
  balance,
  nextPaymentAt,
  today,
}: {
  balance: number;
  nextPaymentAt: Date | null | undefined;
  today: Date;
}): { label: string; tone: StudentPaymentStatusTone } {
  if (balance <= 0) {
    return { label: "Ödənilib", tone: "success" };
  }

  if (!nextPaymentAt) {
    return { label: "Qalıq borc", tone: "warning" };
  }

  if (nextPaymentAt > today) {
    return { label: "Planlı ödəniş", tone: "neutral" };
  }

  if (nextPaymentAt < today) {
    return { label: "Gecikmiş ödəniş", tone: "danger" };
  }

  return { label: "Qalıq borc", tone: "warning" };
}

export function resolveStudentLifecycleStatus({
  lifecycleStatus,
  debtDue,
}: {
  lifecycleStatus: string;
  debtDue: boolean;
}) {
  if (lifecycleStatus !== "ACTIVE" && lifecycleStatus !== "DEBT") {
    return lifecycleStatus;
  }

  return debtDue ? "DEBT" : "ACTIVE";
}
