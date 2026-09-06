import { z } from "zod";
import { billingDateForMonth } from "./payment-billing-period";
import { currentBakuDateValue } from "./payment-date-policy";

const dateValue = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Tarixi düzgün seçin")
  .refine(
    (value) =>
      !Number.isNaN(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value,
    "Tarix mövcud deyil",
  );
export const freezePeriodSchema = z
  .object({
    studentId: z.string().uuid(),
    requestId: z.string().uuid(),
    startDate: dateValue,
    endDate: z.union([dateValue, z.literal("")]),
    note: z.string().trim().min(3, "Dondurulma səbəbini yazın").max(1000),
  })
  .superRefine((value, ctx) => {
    const today = currentBakuDateValue();
    if (value.startDate > today || value.endDate > today)
      ctx.addIssue({
        code: "custom",
        message: "Faktiki tarix gələcəkdə ola bilməz",
      });
    if (value.endDate && value.endDate <= value.startDate)
      ctx.addIssue({
        code: "custom",
        message: "Bərpa tarixi başlanğıcdan sonra olmalıdır",
      });
  });
export type FreezePeriodInput = z.infer<typeof freezePeriodSchema>;
export type FreezeInvoiceDecision = "VOID" | "REVIEW" | "KEEP";

/** Half-open ranges: the return date is the first teaching day, not a frozen day. */
export function assessFrozenInvoice(input: {
  periodMonth: string;
  anchorDate: string;
  startDate: string;
  endDate: string;
  today: string;
  amount: number;
  balance: number;
  allocated: number;
  status: string;
}) {
  const month = new Date(input.periodMonth);
  const anchor = new Date(input.anchorDate);
  const cycleStart = billingDateForMonth(month, anchor)
    .toISOString()
    .slice(0, 10);
  const cycleEnd = billingDateForMonth(
    new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1)),
    anchor,
  )
    .toISOString()
    .slice(0, 10);
  const overlaps =
    input.startDate < cycleEnd &&
    (!input.endDate || input.endDate > cycleStart);
  // An open freeze confirms only elapsed cycles; a later early return must not undo future write-offs.
  const fullyCovered =
    input.startDate <= cycleStart && (input.endDate || input.today) >= cycleEnd;
  let decision: FreezeInvoiceDecision = "KEEP";
  let reason = "Dövr dondurulmaya düşmür";
  if (input.status === "VOID") reason = "Əvvəldən ləğv olunub";
  else if (overlaps) {
    if (
      fullyCovered &&
      input.allocated === 0 &&
      input.balance === input.amount &&
      input.amount > 0 &&
      input.status !== "PAID"
    ) {
      decision = "VOID";
      reason = "Tam dövr dondurulub, ödəniş yoxdur";
    } else {
      decision = "REVIEW";
      reason =
        input.allocated > 0 ||
        input.status === "PAID" ||
        input.balance !== input.amount
          ? "Ödəniş/balans mövcuddur — maliyyə baxışı tələb olunur"
          : "Dövr qismən əhatə olunur və ya hələ başa çatmayıb";
    }
  }
  return { cycleStart, cycleEnd, decision, reason };
}
