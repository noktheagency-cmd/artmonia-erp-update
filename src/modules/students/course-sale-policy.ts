import { Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { PublicActionError } from "@/server/actions/public-action-error";

import { receiptPurposes } from "./receipt-purpose";
export { receiptPurposes, receiptPurposeLabels } from "./receipt-purpose";
export const receiptPurposeSchema = z.enum(receiptPurposes).default("UNCLASSIFIED");
export const contractConfirmationSchema = z.preprocess((value) => value === "on" || value === "true", z.boolean());

export function admissionCycle(input: { studentId: string; admissionTracking: boolean; returnId?: string | null; oldStatus?: string | null }) {
  if (input.returnId) {
    if (input.oldStatus !== "STOPPED") throw new PublicActionError("Dondurma bərpası və paket keçidi yeni satış yaratmır.");
    return { key: `return:${input.returnId}`, kind: "RETURN" };
  }
  if (!input.admissionTracking) throw new PublicActionError("Köhnə qəbulun uyğunluğu ayrıca yoxlanmalıdır; yeni satış kimi təxmin edilmir.");
  return { key: `new:${input.studentId}`, kind: "NEW" };
}

export function assertAdmissionPayment(amount: Prisma.Decimal, contractConfirmed: boolean) {
  if (amount.lt(20)) throw new PublicActionError("Uyğun satış üçün bir qəbul ödənişi ən azı 20 AZN olmalıdır. Kiçik hissələrin yığılması ayrıca qərardır.");
  if (!contractConfirmed) throw new PublicActionError("Müqavilənin imzalandığını təsdiqləyin.");
}

export function assertDepositCancellation(paid: Prisma.Decimal, initialFee: Prisma.Decimal, status: string) {
  if (status !== "DEPOSIT" || paid.gte(initialFee)) throw new PublicActionError("Tam ilk dövr ödənişindən sonra satış ləğv edilə bilməz.");
}
