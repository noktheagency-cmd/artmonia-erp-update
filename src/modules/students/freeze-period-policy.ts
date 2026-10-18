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

/**
 * BK-10: Freeze only reserves the seat. Monthly fee continues and the payment
 * day does not move, so overlapping invoices are never voided by freeze.
 */
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

  if (input.status === "VOID") {
    return {
      cycleStart,
      cycleEnd,
      overlaps,
      decision: "KEEP" as const,
      reason: "Əvvəldən ləğv olunub",
    };
  }

  if (overlaps) {
    return {
      cycleStart,
      cycleEnd,
      overlaps: true,
      decision: "KEEP" as const,
      reason:
        "Dondurma yalnız yeri saxlayır; aylıq haqq və ödəniş günü davam edir (BK-10)",
    };
  }

  return {
    cycleStart,
    cycleEnd,
    overlaps: false,
    decision: "KEEP" as const,
    reason: "Dövr dondurulmaya düşmür",
  };
}
