export type WorkshopPaymentState = "GIFT" | "UNPAID" | "ADVANCE" | "PAID" | "CANCELLED";

export function calculateWorkshopParticipantFinance(input: {
  listPrice: number;
  discountAmount: number;
  activePaid: number;
  isGift?: boolean;
  isCancelled?: boolean;
}) {
  const listPrice = roundMoney(Math.max(input.listPrice, 0));
  const discountAmount = roundMoney(Math.min(Math.max(input.discountAmount, 0), listPrice));
  const netPrice = input.isGift ? 0 : roundMoney(listPrice - discountAmount);
  const activePaid = roundMoney(Math.max(input.activePaid, 0));
  const balance = roundMoney(Math.max(netPrice - activePaid, 0));
  const state: WorkshopPaymentState = input.isCancelled
    ? "CANCELLED"
    : input.isGift
      ? "GIFT"
      : activePaid <= 0
        ? "UNPAID"
        : balance > 0
          ? "ADVANCE"
          : "PAID";

  return { listPrice, discountAmount, netPrice, activePaid, balance, state };
}

export function assertWorkshopPaymentWithinBalance(amount: number, balance: number) {
  const normalizedAmount = roundMoney(amount);
  const normalizedBalance = roundMoney(balance);
  if (normalizedAmount <= 0) throw new Error("Ödəniş məbləği sıfırdan böyük olmalıdır");
  if (normalizedAmount > normalizedBalance) throw new Error("Ödəniş qalıq məbləğdən çox ola bilməz");
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
