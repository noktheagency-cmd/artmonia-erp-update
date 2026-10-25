import { Prisma } from "@/generated/prisma/client";
import { writeAuditLog } from "@/modules/audit/audit-service";

/** Allocates only unspent cash from this completed admission to its first invoice.
 * Old receipts and another admission cycle cannot pay the new cycle twice.
 * Caller holds the student row lock inside the attendance transaction.
 */
export async function allocateActivationPayments(tx: Prisma.TransactionClient, input: {
  studentId: string; enrollmentId: string; invoiceId: string; actorId?: string | null;
}) {
  const payments = await tx.payment.findMany({ where: {
    studentId: input.studentId, refundedAt: null,
    courseSale: { is: { studentId: input.studentId, enrollmentId: input.enrollmentId, status: "COMPLETE", cancelledAt: null } },
  }, orderBy: [{ paidAt: "asc" },{ createdAt: "asc" }], select: {
    id: true, amount: true, allocations: { select: { invoiceId: true, amountAllocated: true } },
  } });
  if (!payments.length) return;
  const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: input.invoiceId }, select: { amount: true, balanceDue: true, dueDate: true } });
  let balance = new Prisma.Decimal(invoice.balanceDue);
  if (balance.lte(0)) return;
  const allocations: Array<{ paymentId: string; amount: string }> = [];
  for (const payment of payments) {
    const allocated = payment.allocations.reduce((sum,a)=>sum.plus(a.amountAllocated),new Prisma.Decimal(0));
    const available = payment.amount.minus(allocated);
    if (available.lte(0)) continue;
    const amount = Prisma.Decimal.min(available,balance);
    const existing = payment.allocations.find(a=>a.invoiceId===input.invoiceId);
    await tx.paymentAllocation.upsert({ where: { paymentId_invoiceId: { paymentId: payment.id, invoiceId: input.invoiceId } },
      create: { paymentId: payment.id, invoiceId: input.invoiceId, amountAllocated: amount, mode: "SELECTED_INVOICE" },
      update: { amountAllocated: amount.plus(existing?.amountAllocated ?? 0) },
    });
    balance = balance.minus(amount); allocations.push({paymentId:payment.id,amount:amount.toFixed(2)});
    if (balance.lte(0)) break;
  }
  if (!allocations.length) return;
  await tx.invoice.update({ where: { id: input.invoiceId }, data: { balanceDue: balance, status: balance.lte(0) ? "PAID" : "PARTIAL" } });
  await writeAuditLog(tx, { actorUserId: input.actorId, action: "student.activation.allocate_paid_admission", entityType: "student", entityId: input.studentId,
    before: { invoiceId: input.invoiceId, balance: invoice.balanceDue.toFixed(2) }, after: { invoiceId: input.invoiceId, balance: balance.toFixed(2), allocations },
    reason: "Əvvəl qəbul olunmuş cari qəbul ödənişləri ilk faktiki dərsin fakturasına ayrıldı" });
}
