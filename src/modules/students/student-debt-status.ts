export type StudentPaymentStatusTone = "success" | "neutral" | "warning" | "danger";
export type StudentPaymentStatusCode = "PAID" | "UPCOMING" | "DUE" | "OVERDUE" | "OVERDUE_3_PLUS";

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
}): { code: StudentPaymentStatusCode; label: string; tone: StudentPaymentStatusTone } {
  if (balance <= 0) {
    return { code: "PAID", label: "Ödənilib", tone: "success" };
  }

  if (!nextPaymentAt) {
    return { code: "DUE", label: "Ödəniş gözləyir", tone: "warning" };
  }

  if (nextPaymentAt > today) {
    return { code: "UPCOMING", label: "Gələcək ödəniş", tone: "neutral" };
  }

  if (nextPaymentAt < today) {
    const overdueDays = Math.floor((today.getTime() - nextPaymentAt.getTime()) / 86_400_000);
    return overdueDays >= 3
      ? { code: "OVERDUE_3_PLUS", label: "3+ gün gecikib", tone: "danger" }
      : { code: "OVERDUE", label: "Gecikib", tone: "danger" };
  }

  return { code: "DUE", label: "Ödəniş günü çatıb", tone: "warning" };
}
