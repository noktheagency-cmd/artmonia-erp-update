import { Prisma } from "@/generated/prisma/client";
import { PublicActionError } from "@/server/actions/public-action-error";
import { writeAuditLog } from "@/modules/audit/audit-service";
import { admissionCycle, assertAdmissionPayment, type receiptPurposes } from "./course-sale-policy";

type Purpose = (typeof receiptPurposes)[number];
export async function recordCourseSalePayment(tx: Prisma.TransactionClient, input: {
  studentId: string; paymentId: string; purpose: Purpose; contractConfirmed?: boolean; actorId: string; admissionLeadId?: string;
}) {
  await tx.$queryRaw`select id from erp.students where id = ${input.studentId}::uuid for update`;
  const student = await tx.student.findUniqueOrThrow({ where: { id: input.studentId }, select: {
    admissionTracking: true, managerId: true, lifecycleStatus: true, contact: { select: { id: true, phoneNormalized: true } }, sourceLead: { select: { id: true } },
    enrollments: { where: { status: { in: ["ACTIVE", "PAUSED"] } }, orderBy: { createdAt: "desc" }, take: 1, select: { id: true, monthlyFee: true } },
  } });
  const payment = await tx.payment.findUniqueOrThrow({ where: { id: input.paymentId } });
  if (payment.studentId !== input.studentId) throw new PublicActionError("Ödəniş başqa tələbəyə aiddir.");
  if (payment.courseSaleId || payment.receiptPurpose !== "UNCLASSIFIED") {
    if (payment.receiptPurpose !== input.purpose) throw new PublicActionError("Təkrar əməliyyatın ödəniş bölgüsü əvvəlki qeydlə uyğun deyil.");
    return;
  }
  if (input.purpose !== "ADMISSION" && input.purpose !== "INITIAL_BALANCE") {
    const latestSale = input.purpose === "RENEWAL" ? await tx.courseSale.findFirst({ where: { studentId: input.studentId }, orderBy: [{ qualifiedAt: "desc" }, { createdAt: "desc" }] }) : null;
    if (latestSale?.status === "DEPOSIT") throw new PublicActionError("Əvvəl ilk dövrün qalığını tamamlayın.");
    await tx.payment.update({ where: { id: payment.id }, data: { receiptPurpose: input.purpose } });
    return;
  }
  const returning = await tx.studentStatusHistory.findFirst({ where: { studentId: input.studentId, eventType: "REACTIVATED" }, orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }] });
  const lastSale = input.purpose === "INITIAL_BALANCE" && returning?.oldStatus !== "STOPPED" ? await tx.courseSale.findFirst({ where: { studentId: input.studentId }, orderBy: [{ qualifiedAt: "desc" }, { createdAt: "desc" }] }) : null;
  const existingDeposit = lastSale?.status === "DEPOSIT" ? lastSale : null;
  const cycle = existingDeposit ? { key: existingDeposit.cycleKey, kind: existingDeposit.kind } : admissionCycle({ studentId: input.studentId, admissionTracking: student.admissionTracking, returnId: returning?.id, oldStatus: returning?.oldStatus });
  let sale = await tx.courseSale.findUnique({ where: { cycleKey: cycle.key } });
  if (sale && sale.status !== "DEPOSIT") throw new PublicActionError("Bu qəbul dövrü artıq tamamlanıb və ya ləğv edilib.");
  if (sale && sale.enrollmentId !== student.enrollments[0]?.id) throw new PublicActionError("Bu qəbul əvvəlki paketə aiddir. Cari ödənişin təyinatını yoxlayın.");
  if (!sale && input.purpose === "INITIAL_BALANCE") throw new PublicActionError("İlk dövrün qalığı üçün açıq beh satışı tapılmadı.");
  if (!sale) {
    if (!["SLOT_WAITING", "ACTIVE"].includes(student.lifecycleStatus)) throw new PublicActionError("Əvvəl yeni qəbulu və ya dayandırılmış tələbənin qayıdışını başladın.");
    assertAdmissionPayment(payment.amount, input.contractConfirmed ?? false);
    const enrollment = student.enrollments[0];
    if (!enrollment || enrollment.monthlyFee.lte(0)) throw new PublicActionError("Satış üçün uyğun ödənişli paket seçilməlidir.");
    if (!student.managerId) throw new PublicActionError("Satış sahibi seçilməlidir.");
    if (returning && payment.paidAt < returning.effectiveAt) throw new PublicActionError("Qayıdışdan əvvəlki pul təkrar qəbul ödənişi sayıla bilməz.");
    let saleLeadId = cycle.kind === "NEW" ? student.sourceLead?.id ?? null : null;
    if (input.admissionLeadId) {
      const lead = await tx.lead.findUnique({ where: { id: input.admissionLeadId }, include: { contact: { select: { phoneNormalized: true } } } });
      if (!lead || lead.stage === "LOST" || lead.stage === "REGISTERED" || lead.managerId !== student.managerId || (lead.contactId !== student.contact.id && (!student.contact.phoneNormalized || lead.contact.phoneNormalized !== student.contact.phoneNormalized))
        || (cycle.kind === "RETURN" && (!returning || lead.createdAt < returning.effectiveAt || lead.id === student.sourceLead?.id))) throw new PublicActionError("Bu müraciət cari qəbul dövrünə və satış sahibinə uyğun deyil.");
      if (cycle.kind === "NEW" && saleLeadId && saleLeadId !== lead.id) throw new PublicActionError("Yeni qəbulun ilkin müraciəti dəyişdirilə bilməz.");
      saleLeadId = lead.id;
    }
    sale = await tx.courseSale.create({ data: {
      studentId: input.studentId, enrollmentId: enrollment.id, ownerId: student.managerId,
      leadId: saleLeadId,
      cycleKey: cycle.key, kind: cycle.kind, route: saleLeadId ? "CRM" : "DIRECT",
      qualifiedAt: payment.paidAt, initialFee: enrollment.monthlyFee, contractConfirmedAt: new Date(),
    } });
    if (sale.leadId) {
      const lead = await tx.lead.findUniqueOrThrow({ where: { id: sale.leadId } });
      await tx.lead.update({ where: { id: lead.id }, data: { stage: "REGISTERED" } });
      if (lead.stage !== "REGISTERED") await tx.leadStageHistory.create({ data: { leadId: lead.id, oldStage: lead.stage, newStage: "REGISTERED", changedById: input.actorId, reason: "Uyğun ödənişli qəbul tamamlandı" } });
      await tx.leadWorkItem.updateMany({ where: { leadId: lead.id, source: "PRIMARY", completedAt: null, cancelledAt: null }, data: { cancelledAt: new Date(), result: "REGISTERED" } });
    }
    await writeAuditLog(tx, { actorUserId: input.actorId, action: "student.sale.qualified", entityType: "student", entityId: input.studentId,
      after: { saleId: sale.id, kind: sale.kind, route: sale.route, ownerId: sale.ownerId, qualifiedAt: sale.qualifiedAt.toISOString(), initialFee: sale.initialFee.toString() } });
  }
  if (payment.paidAt < sale.qualifiedAt) throw new PublicActionError("İlkin satışdan əvvəlki pul qalıq ödənişi sayıla bilməz.");
  const prior = await tx.payment.aggregate({ where: { courseSaleId: sale.id }, _sum: { amount: true } });
  const paid = (prior._sum.amount ?? new Prisma.Decimal(0)).plus(payment.amount);
  const category = prior._sum.amount ? "INITIAL_BALANCE" : "ADMISSION";
  if (category !== input.purpose) throw new PublicActionError("Bu qəbulun ilk ödənişi artıq var. İlk dövrün qalığını seçin.");
  await tx.payment.update({ where: { id: payment.id }, data: { courseSaleId: sale.id, receiptPurpose: category } });
  if (paid.gte(sale.initialFee)) await tx.courseSale.update({ where: { id: sale.id }, data: { status: "COMPLETE" } });
}

export async function assertSalePaymentEditable(tx: Prisma.TransactionClient, paymentId: string) {
  const payment = await tx.payment.findUnique({ where: { id: paymentId }, select: { courseSaleId: true } });
  if (payment?.courseSaleId) throw new PublicActionError("Satışa bağlı pulun silinməsi, refund və tarix/məbləğ dəyişikliyi bu əməliyyatda mümkün deyil.");
}
