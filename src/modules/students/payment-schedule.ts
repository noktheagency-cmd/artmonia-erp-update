const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const AZ_DATE_PATTERN = /^(\d{2})[./](\d{2})[./](\d{4})$/;

/**
 * Returns the next monthly payment date anchored to an active group start.
 * Students without an active group do not have a next-payment schedule.
 */
export function resolveNextPaymentAt({
  groupJoinedAt,
  paymentMonth,
}: {
  groupJoinedAt: Date | null;
  paymentMonth: Date;
}) {
  if (!groupJoinedAt) {
    return null;
  }

  const joinedMonthIndex = monthIndex(groupJoinedAt);
  const paymentMonthIndex = monthIndex(paymentMonth);
  const targetMonthIndex = Math.max(joinedMonthIndex + 1, paymentMonthIndex + 1);

  return utcDateInMonth(targetMonthIndex, groupJoinedAt.getUTCDate());
}

export function resolveNextPaymentDateInput({
  groupJoinedAt,
  paidAt,
}: {
  groupJoinedAt: string | null | undefined;
  paidAt: string;
}) {
  const paidDate = parseDateInput(paidAt);

  if (!paidDate) {
    return "";
  }

  const joinedDate = groupJoinedAt ? parseDateInput(groupJoinedAt) : null;
  const nextPaymentAt = resolveNextPaymentAt({
    groupJoinedAt: joinedDate,
    paymentMonth: new Date(Date.UTC(paidDate.getUTCFullYear(), paidDate.getUTCMonth(), 1)),
  });

  return nextPaymentAt ? formatDateInput(nextPaymentAt) : "";
}

function monthIndex(value: Date) {
  return value.getUTCFullYear() * 12 + value.getUTCMonth();
}

function utcDateInMonth(targetMonthIndex: number, requestedDay: number) {
  const year = Math.floor(targetMonthIndex / 12);
  const month = targetMonthIndex - year * 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  return new Date(Date.UTC(year, month, Math.min(requestedDay, lastDay)));
}

function parseDateInput(value: string) {
  const trimmed = value.trim();
  const isoMatch = trimmed.match(ISO_DATE_PATTERN);

  if (isoMatch) {
    return new Date(Date.UTC(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3])));
  }

  const azMatch = trimmed.match(AZ_DATE_PATTERN);
  if (azMatch) {
    return new Date(Date.UTC(Number(azMatch[3]), Number(azMatch[2]) - 1, Number(azMatch[1])));
  }

  return null;
}

function formatDateInput(value: Date) {
  return [
    value.getUTCFullYear().toString(),
    (value.getUTCMonth() + 1).toString().padStart(2, "0"),
    value.getUTCDate().toString().padStart(2, "0"),
  ].join("-");
}
