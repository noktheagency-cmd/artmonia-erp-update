"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import {
  FinanceCostCenter,
  FinanceSalaryMode,
  FinanceTransactionType,
  PaymentMethod,
  Prisma,
  WorkshopContactChannel,
  WorkshopEventStatus,
  WorkshopEventType,
  WorkshopFollowUpAction,
  WorkshopFollowUpOutcome,
  WorkshopFollowUpPriority,
  WorkshopFollowUpStatus,
} from "@/generated/prisma/client";
import { writeAuditLog } from "@/modules/audit/audit-service";
import { erpCacheTags } from "@/modules/shared/cache-tags";
import { optionalFormString } from "@/modules/shared/form-values";
import { toNumber } from "@/modules/shared/format";
import { studentPaymentMethodValues } from "@/modules/students/payment-method";
import {
  assertWorkshopPaymentWithinBalance,
  calculateWorkshopParticipantFinance,
} from "@/modules/workshops/finance-rules";
import { requireMutationActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";
import { PublicActionError, safeServerAction } from "@/server/actions/safe-action";
import {
  deleteWorkshopPoster,
  uploadReceipt,
  uploadWorkshopPoster,
} from "@/server/storage/erp-files";

const optionalText = (max: number) =>
  z.preprocess(optionalFormString, z.string().trim().max(max).optional());

const optionalEmail = z.preprocess(
  optionalFormString,
  z.string().trim().email().max(180).optional()
);

const optionalUuid = z.preprocess(
  optionalFormString,
  z.string().uuid().optional()
);

const optionalInt = (min: number, max: number) =>
  z.preprocess((value) => {
    const normalized = optionalFormString(value);
    return normalized ? Number.parseInt(normalized, 10) : undefined;
  }, z.number().int().min(min).max(max).optional());

const requiredInt = (min: number, max: number) =>
  z.preprocess(
    (value) => Number.parseInt(String(value), 10),
    z.number().int().min(min).max(max)
  );

const optionalAmount = z.preprocess((value) => {
  const normalized = optionalFormString(value);
  return normalized ? parseAmountInput(normalized) : undefined;
}, z.number().nonnegative().max(1_000_000).optional());

const requiredPositiveAmount = z.preprocess(
  parseAmountInput,
  z.number().positive().max(1_000_000)
);

const requiredNonnegativeAmount = z.preprocess(
  parseAmountInput,
  z.number().nonnegative().max(1_000_000)
);

const checkbox = z.preprocess(
  (value) => value === "on" || value === "true" || value === "1",
  z.boolean()
);

const eventSchema = z.object({
  title: z.string().trim().min(2).max(140),
  eventType: z.string().trim().min(2).max(80).transform(normalizeEventType),
  status: z.enum([
    WorkshopEventStatus.DRAFT,
    WorkshopEventStatus.SCHEDULED,
    WorkshopEventStatus.ACTIVE,
    WorkshopEventStatus.COMPLETED,
    WorkshopEventStatus.CANCELLED,
  ]),
  eventDate: z.string().trim().min(1).max(20),
  startTime: z.string().trim().regex(/^\d{2}:\d{2}$/),
  durationMinutes: requiredInt(30, 600),
  room: optionalText(90),
  instructor: optionalText(120),
  capacity: optionalInt(1, 1000),
  entryPrice: requiredNonnegativeAmount,
  note: optionalText(700),
});

const createEventSchema = eventSchema;
const updateEventSchema = eventSchema.extend({ eventId: z.string().uuid() });

const participantSchema = z.object({
  eventId: z.string().uuid(),
  studentId: optionalUuid,
  fullName: optionalText(140),
  phone: optionalText(40),
  email: optionalEmail,
  listPrice: optionalAmount,
  discountAmount: optionalAmount,
  advanceAmount: optionalAmount,
  paymentMethod: z.enum(studentPaymentMethodValues).default(PaymentMethod.CASH),
  payerName: optionalText(140),
  receiptReference: optionalText(180),
  isGift: checkbox.default(false),
  note: optionalText(700),
  idempotencyKey: optionalText(180),
});

const updateParticipantSchema = z.object({
  participantId: z.string().uuid(),
  fullName: z.string().trim().min(2).max(140),
  phone: optionalText(40),
  email: optionalEmail,
  listPrice: requiredNonnegativeAmount,
  discountAmount: optionalAmount,
  isGift: checkbox.default(false),
  note: optionalText(700),
});

const workshopFollowUpFields = {
  status: z.enum([
    WorkshopFollowUpStatus.PENDING,
    WorkshopFollowUpStatus.CONTACTED,
    WorkshopFollowUpStatus.NO_ANSWER,
    WorkshopFollowUpStatus.INTERESTED,
    WorkshopFollowUpStatus.CONVERTED,
    WorkshopFollowUpStatus.NOT_INTERESTED,
  ]),
  nextAction: z.enum([
    WorkshopFollowUpAction.NONE,
    WorkshopFollowUpAction.CALL,
    WorkshopFollowUpAction.WHATSAPP,
    WorkshopFollowUpAction.SEND_DETAILS,
    WorkshopFollowUpAction.SEND_OFFER,
    WorkshopFollowUpAction.RESERVE_PLACE,
    WorkshopFollowUpAction.WAIT_RESPONSE,
    WorkshopFollowUpAction.OTHER,
  ]),
  outcome: z.enum([
    WorkshopFollowUpOutcome.NONE,
    WorkshopFollowUpOutcome.POSITIVE_RESPONSE,
    WorkshopFollowUpOutcome.NO_RESPONSE,
    WorkshopFollowUpOutcome.CALLBACK_REQUESTED,
    WorkshopFollowUpOutcome.DECLINED,
    WorkshopFollowUpOutcome.REGISTERED,
  ]),
  contactChannel: z.enum([
    WorkshopContactChannel.NOT_SET,
    WorkshopContactChannel.PHONE,
    WorkshopContactChannel.WHATSAPP,
    WorkshopContactChannel.SMS,
    WorkshopContactChannel.EMAIL,
    WorkshopContactChannel.OTHER,
  ]),
  priority: z.enum([
    WorkshopFollowUpPriority.LOW,
    WorkshopFollowUpPriority.NORMAL,
    WorkshopFollowUpPriority.HIGH,
    WorkshopFollowUpPriority.URGENT,
  ]),
  nextFollowUpAt: optionalText(30),
  assignedToId: z.preprocess(
    (value) => value === "UNASSIGNED" ? undefined : value,
    z.string().uuid().optional(),
  ),
  note: optionalText(1200),
} as const;

const createWorkshopFollowUpSchema = z.object({
  participantId: z.string().uuid(),
  targetEventId: z.string().uuid(),
  ...workshopFollowUpFields,
});

const updateWorkshopFollowUpSchema = z.object({
  followUpId: z.string().uuid(),
  ...workshopFollowUpFields,
});

const paymentSchema = z.object({
  eventId: z.string().uuid(),
  participantId: z.string().uuid(),
  amount: requiredPositiveAmount,
  paidAt: z.string().trim().min(1).max(20),
  paymentMethod: z.enum(studentPaymentMethodValues).default(PaymentMethod.CASH),
  payerName: optionalText(140),
  receiptReference: optionalText(180),
  note: optionalText(700),
  idempotencyKey: optionalText(180),
});

const replacePaymentSchema = paymentSchema.extend({
  paymentId: z.string().uuid(),
  reason: z.string().trim().min(3).max(700),
});

const voidPaymentSchema = z.object({
  paymentId: z.string().uuid(),
  reason: optionalText(700),
});

const expenseSchema = z.object({
  idempotencyKey: z.string().uuid().optional(),
  eventId: z.string().uuid(),
  categoryId: z.string().uuid(),
  amount: requiredPositiveAmount,
  expenseDate: z.string().trim().min(1).max(20),
  method: z.enum(studentPaymentMethodValues).default(PaymentMethod.CASH),
  vendor: z.string().trim().min(2).max(120),
  description: z.string().trim().min(3).max(700),
  receiptReference: optionalText(180),
});

const replaceExpenseSchema = expenseSchema.extend({
  expenseId: z.string().uuid(),
  reason: z.string().trim().min(3).max(700),
});

const voidExpenseSchema = z.object({
  expenseId: z.string().uuid(),
  reason: optionalText(700),
});

async function createWorkshopEventActionImpl(formData: FormData) {
  const actor = await requireMutationActor("workshop.manage");
  const input = createEventSchema.parse(Object.fromEntries(formData));
  const prisma = getPrisma();
  const eventType = resolveEventType(input.eventType);
  const posterUrl = await persistWorkshopPoster(formData.get("poster"));
  let eventId = "";
  try {
    eventId = await prisma.$transaction(async (tx) => {
      const event = await tx.workshopEvent.create({
        data: {
          title: input.title,
          eventType: eventType.kind,
          category: eventType.category,
          status: input.status,
          eventDate: parseDateInput(input.eventDate, "Tədbir tarixi"),
          startTime: input.startTime,
          durationMinutes: input.durationMinutes,
          room: input.room ?? null,
          instructor: input.instructor ?? null,
          capacity: input.capacity ?? null,
          entryPrice: input.entryPrice,
          posterUrl,
          note: input.note ?? null,
          createdById: actor.id,
        },
      });

      await writeAuditLog(tx, {
        actorUserId: actor.id,
        action: "workshop.event.create",
        entityType: "workshop_event",
        entityId: event.id,
        after: eventAuditJson(event),
        reason: input.note ?? "Workshop/masterclass yaradıldı",
      });
      return event.id;
    });
  } catch (error) {
    if (posterUrl) await deleteWorkshopPoster(posterUrl).catch(() => undefined);
    throw error;
  }

  invalidateWorkshopCaches(eventId);
  return { ok: true as const, id: eventId };
}

async function updateWorkshopEventActionImpl(formData: FormData) {
  const actor = await requireMutationActor("workshop.manage");
  const input = updateEventSchema.parse(Object.fromEntries(formData));
  const prisma = getPrisma();
  const eventType = resolveEventType(input.eventType);
  const uploadedPosterUrl = await persistWorkshopPoster(formData.get("poster"));
  let previousPosterUrl: string | null = null;

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.workshopEvent.findUnique({ where: { id: input.eventId } });
      if (!existing) throw new Error("Tədbir tapılmadı");
      previousPosterUrl = existing.posterUrl;

      const activeParticipants = await tx.workshopParticipant.count({
        where: { eventId: input.eventId, cancelledAt: null },
      });
      if (input.capacity && input.capacity < activeParticipants) {
        throw new Error("Tutum aktiv iştirakçı sayından az ola bilməz");
      }

      const updated = await tx.workshopEvent.update({
        where: { id: input.eventId },
        data: {
          title: input.title,
          eventType: eventType.kind,
          category: eventType.category,
          status: input.status,
          eventDate: parseDateInput(input.eventDate, "Tədbir tarixi"),
          startTime: input.startTime,
          durationMinutes: input.durationMinutes,
          room: input.room ?? null,
          instructor: input.instructor ?? null,
          capacity: input.capacity ?? null,
          entryPrice: input.entryPrice,
          posterUrl: uploadedPosterUrl ?? existing.posterUrl,
          note: input.note ?? null,
        },
      });

      await writeAuditLog(tx, {
        actorUserId: actor.id,
        action: "workshop.event.update",
        entityType: "workshop_event",
        entityId: updated.id,
        before: eventAuditJson(existing),
        after: eventAuditJson(updated),
        reason: input.note ?? "Tədbir məlumatları yeniləndi",
      });
    });
  } catch (error) {
    if (uploadedPosterUrl) await deleteWorkshopPoster(uploadedPosterUrl).catch(() => undefined);
    throw error;
  }

  if (uploadedPosterUrl && previousPosterUrl) {
    await deleteWorkshopPoster(previousPosterUrl).catch(() => undefined);
  }

  invalidateWorkshopCaches(input.eventId);
  return { ok: true as const };
}

async function deleteOrCancelWorkshopEventActionImpl(formData: FormData) {
  const actor = await requireMutationActor("workshop.manage");
  const input = z.object({ eventId: z.string().uuid() })
    .parse(Object.fromEntries(formData));
  const prisma = getPrisma();
  let posterUrl: string | null = null;

  await prisma.$transaction(async (tx) => {
    const event = await tx.workshopEvent.findUnique({
      where: { id: input.eventId },
    });
    if (!event) throw new Error("Tədbir tapılmadı");
    posterUrl = event.posterUrl;

    // Replacement records reference another record in the same table, so clear
    // those links before deleting the event's financial history.
    await tx.workshopPayment.updateMany({
      where: { eventId: event.id, replacesPaymentId: { not: null } },
      data: { replacesPaymentId: null },
    });
    await tx.financeExpense.updateMany({
      where: { workshopEventId: event.id, replacesExpenseId: { not: null } },
      data: { replacesExpenseId: null },
    });
    await tx.workshopPayment.deleteMany({ where: { eventId: event.id } });
    await tx.financeExpense.deleteMany({ where: { workshopEventId: event.id } });
    await tx.workshopParticipant.deleteMany({ where: { eventId: event.id } });

    await tx.workshopEvent.delete({ where: { id: event.id } });
    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "workshop.event.delete",
      entityType: "workshop_event",
      entityId: event.id,
      before: eventAuditJson(event),
      reason: "Tədbir və ona bağlı iştirakçı, ödəniş və xərc məlumatları tam silindi",
    });
  });

  if (posterUrl) await deleteWorkshopPoster(posterUrl).catch(() => undefined);

  invalidateWorkshopCaches(input.eventId);
  return { ok: true as const };
}

async function assignWorkshopParticipantActionImpl(formData: FormData) {
  const actor = await requireMutationActor("workshop.manage");
  const input = participantSchema.parse(Object.fromEntries(formData));
  const receipt = await persistReceiptFile(formData.get("receiptFile"), input.idempotencyKey);
  const prisma = getPrisma();

  const participantId = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`
      select id from erp.workshop_events where id = ${input.eventId}::uuid for update
    `);
    const event = await tx.workshopEvent.findUnique({ where: { id: input.eventId } });
    if (!event) throw new Error("Tədbir tapılmadı");
    if (event.status === WorkshopEventStatus.CANCELLED) {
      throw new Error("Ləğv edilmiş tədbirə iştirakçı əlavə etmək olmaz");
    }

    const activeCount = await tx.workshopParticipant.count({
      where: { eventId: event.id, cancelledAt: null },
    });
    if (event.capacity && activeCount >= event.capacity) {
      throw new Error("Tədbirin iştirakçı limiti doludur");
    }

    const student = input.studentId
      ? await tx.student.findUnique({
          where: { id: input.studentId },
          select: { id: true, contact: { select: { fullName: true, phoneDisplay: true, email: true } } },
        })
      : null;
    if (input.studentId && !student) throw new Error("Tələbə tapılmadı");

    if (student) {
      const duplicate = await tx.workshopParticipant.findFirst({
        where: { eventId: event.id, studentId: student.id, cancelledAt: null },
        select: { id: true },
      });
      if (duplicate) throw new Error("Bu tələbə artıq tədbirə əlavə edilib");
    }

    const fullName = input.fullName ?? student?.contact.fullName;
    if (!fullName) throw new Error("İştirakçı adı daxil edilməlidir");
    const listPrice = roundMoney(input.listPrice ?? toNumber(event.entryPrice));
    const discountAmount = input.isGift
      ? listPrice
      : roundMoney(Math.min(input.discountAmount ?? 0, listPrice));
    const netPrice = calculateWorkshopParticipantFinance({
      listPrice,
      discountAmount,
      activePaid: 0,
      isGift: input.isGift,
    }).netPrice;
    const advance = roundMoney(input.advanceAmount ?? 0);
    if (input.isGift && advance > 0) throw new Error("Hədiyyə iştirakçı üçün avans qəbul edilmir");
    if (advance > 0) assertWorkshopPaymentWithinBalance(advance, netPrice);

    const participant = await tx.workshopParticipant.create({
      data: {
        eventId: event.id,
        studentId: student?.id ?? null,
        fullName,
        phone: input.phone ?? student?.contact.phoneDisplay ?? null,
        email: input.email ?? student?.contact.email ?? null,
        paymentMethod: input.paymentMethod as PaymentMethod,
        listPrice,
        amountPaid: advance,
        discountAmount,
        isPaid: advance > 0 && advance >= netPrice,
        isDiscounted: !input.isGift && discountAmount > 0,
        isGift: input.isGift,
        note: input.note ?? null,
        assignedById: actor.id,
      },
    });

    if (advance > 0) {
      await tx.workshopPayment.create({
        data: {
          eventId: event.id,
          participantId: participant.id,
          amount: advance,
          paidAt: new Date(),
          method: input.paymentMethod as PaymentMethod,
          payerName: input.payerName ?? fullName,
          receiptFileName: receipt?.fileName ?? null,
          receiptFilePath: receipt?.filePath ?? null,
          receiptReference: input.receiptReference ?? null,
          note: input.note ?? "İştirakçı qeydiyyatı zamanı avans",
          idempotencyKey: input.idempotencyKey ?? `participant-advance:${participant.id}`,
          createdById: actor.id,
        },
      });
    }

    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "workshop.participant.assign",
      entityType: "workshop_participant",
      entityId: participant.id,
      after: participantAuditJson(participant),
      reason: input.note ?? (advance > 0 ? "İştirakçı avansla əlavə edildi" : "İştirakçı əlavə edildi"),
    });
    return participant.id;
  });

  invalidateWorkshopCaches(input.eventId);
  return { ok: true as const, id: participantId };
}

async function updateWorkshopParticipantActionImpl(formData: FormData) {
  const actor = await requireMutationActor("workshop.manage");
  const input = updateParticipantSchema.parse(Object.fromEntries(formData));
  const prisma = getPrisma();
  let eventId = "";

  await prisma.$transaction(async (tx) => {
    const existing = await tx.workshopParticipant.findUnique({ where: { id: input.participantId } });
    if (!existing) throw new Error("İştirakçı tapılmadı");
    eventId = existing.eventId;
    const paid = await activeParticipantPaidTotal(tx, existing.id);
    const discount = input.isGift
      ? input.listPrice
      : roundMoney(Math.min(input.discountAmount ?? 0, input.listPrice));
    const netPrice = input.isGift ? 0 : roundMoney(input.listPrice - discount);
    if (input.isGift && paid > 0) throw new Error("Ödəniş tarixçəsi olan iştirakçı hədiyyəyə çevrilə bilməz");
    if (paid > netPrice) throw new Error("Yeni qiymət qəbul edilmiş ödənişdən aşağı ola bilməz");

    const updated = await tx.workshopParticipant.update({
      where: { id: existing.id },
      data: {
        fullName: input.fullName,
        phone: input.phone ?? null,
        email: input.email ?? null,
        listPrice: input.listPrice,
        discountAmount: discount,
        isGift: input.isGift,
        isDiscounted: !input.isGift && discount > 0,
        isPaid: paid >= netPrice,
        note: input.note ?? null,
      },
    });
    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "workshop.participant.update",
      entityType: "workshop_participant",
      entityId: updated.id,
      before: participantAuditJson(existing),
      after: participantAuditJson(updated),
      reason: input.note ?? "İştirakçı məlumatları yeniləndi",
    });
  });

  invalidateWorkshopCaches(eventId);
  return { ok: true as const };
}

async function cancelWorkshopParticipantActionImpl(formData: FormData) {
  const actor = await requireMutationActor("workshop.manage");
  const input = z.object({
    participantId: z.string().uuid(),
    reason: optionalText(700),
  }).parse(Object.fromEntries(formData));
  const prisma = getPrisma();
  let eventId = "";

  await prisma.$transaction(async (tx) => {
    const participant = await tx.workshopParticipant.findUnique({ where: { id: input.participantId } });
    if (!participant) throw new Error("İştirakçı tapılmadı");
    eventId = participant.eventId;
    const paymentCount = await tx.workshopPayment.count({ where: { participantId: participant.id } });
    if (paymentCount === 0) {
      await tx.workshopParticipant.delete({ where: { id: participant.id } });
    } else {
      await tx.workshopParticipant.update({
        where: { id: participant.id },
        data: {
          cancelledAt: new Date(),
          cancelledById: actor.id,
          cancelReason: input.reason ?? "İştirakçı ləğv edildi",
        },
      });
    }
    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: paymentCount === 0 ? "workshop.participant.delete" : "workshop.participant.cancel",
      entityType: "workshop_participant",
      entityId: participant.id,
      before: participantAuditJson(participant),
      reason: input.reason ?? "İştirakçı silindi və ya ləğv edildi",
    });
  });

  invalidateWorkshopCaches(eventId);
  return { ok: true as const };
}

async function createWorkshopFollowUpActionImpl(formData: FormData) {
  const actor = await requireMutationActor("workshop.manage");
  const input = createWorkshopFollowUpSchema.parse(Object.fromEntries(formData));
  const prisma = getPrisma();

  await prisma.$transaction(async (tx) => {
    const [participant, targetEvent] = await Promise.all([
      tx.workshopParticipant.findFirst({
        where: { id: input.participantId, cancelledAt: null },
        select: { id: true, eventId: true },
      }),
      tx.workshopEvent.findFirst({
        where: { id: input.targetEventId, status: { not: WorkshopEventStatus.CANCELLED } },
        select: { id: true },
      }),
    ]);
    if (!participant) throw new PublicActionError("Aktiv workshop iştirakçısı tapılmadı");
    if (!targetEvent) throw new PublicActionError("Hədəf tədbir tapılmadı və ya ləğv edilib");
    await assertWorkshopFollowUpAssignee(tx, input.assignedToId);

    const existing = await tx.workshopParticipantFollowUp.findUnique({
      where: { participantId_targetEventId: { participantId: participant.id, targetEventId: targetEvent.id } },
      select: { id: true },
    });
    if (existing) throw new PublicActionError("Bu iştirakçı üçün seçilmiş tədbir üzrə follow-up artıq mövcuddur");

    const state = resolveWorkshopFollowUpState(input);
    const created = await tx.workshopParticipantFollowUp.create({
      data: {
        participantId: participant.id,
        targetEventId: targetEvent.id,
        ...state,
        assignedToId: input.assignedToId ?? null,
        note: input.note ?? null,
        createdById: actor.id,
        updatedById: actor.id,
      },
    });
    await createWorkshopFollowUpActivity(tx, created, actor.id, "CREATED");
    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "workshop.follow_up.create",
      entityType: "workshop_participant_follow_up",
      entityId: created.id,
      after: workshopFollowUpAuditJson(created),
      reason: input.note ?? "Workshop follow-up yaradıldı",
    });
  });

  invalidateWorkshopCaches(input.targetEventId);
  return { ok: true as const };
}

async function updateWorkshopFollowUpActionImpl(formData: FormData) {
  const actor = await requireMutationActor("workshop.manage");
  const input = updateWorkshopFollowUpSchema.parse(Object.fromEntries(formData));
  const prisma = getPrisma();
  let eventId = "";

  await prisma.$transaction(async (tx) => {
    const followUp = await tx.workshopParticipantFollowUp.findUnique({
      where: { id: input.followUpId },
      include: { participant: { select: { cancelledAt: true } } },
    });
    if (!followUp || followUp.participant.cancelledAt) throw new PublicActionError("Aktiv workshop follow-up qeydi tapılmadı");
    eventId = followUp.targetEventId;

    await assertWorkshopFollowUpAssignee(tx, input.assignedToId);

    const state = resolveWorkshopFollowUpState(input);
    const statusChanged = followUp.status !== state.status;
    const lastContactedAt = input.status === WorkshopFollowUpStatus.PENDING
      ? followUp.lastContactedAt
      : statusChanged || followUp.outcome !== state.outcome ? new Date() : followUp.lastContactedAt ?? new Date();

    const updated = await tx.workshopParticipantFollowUp.update({
      where: { id: followUp.id },
      data: {
        ...state,
        lastContactedAt,
        assignedToId: input.assignedToId ?? null,
        note: input.note ?? null,
        updatedById: actor.id,
      },
    });
    await createWorkshopFollowUpActivity(tx, updated, actor.id, statusChanged ? "STATUS_CHANGED" : "UPDATED");

    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "workshop.follow_up.update",
      entityType: "workshop_participant_follow_up",
      entityId: updated.id,
      before: workshopFollowUpAuditJson(followUp),
      after: workshopFollowUpAuditJson(updated),
      reason: input.note ?? "Workshop follow-up yeniləndi",
    });
  });

  invalidateWorkshopCaches(eventId);
  return { ok: true as const };
}

async function recordWorkshopPaymentActionImpl(formData: FormData) {
  const actor = await requireMutationActor("workshop.finance.manage");
  const input = paymentSchema.parse(Object.fromEntries(formData));
  const receipt = await persistReceiptFile(formData.get("receiptFile"), input.idempotencyKey);
  const prisma = getPrisma();

  const payment = await prisma.$transaction(async (tx) => {
    const participant = await getPayableParticipant(tx, input.eventId, input.participantId);
    await assertPaymentFitsBalance(tx, participant, input.amount);
    const created = await tx.workshopPayment.create({
      data: {
        eventId: input.eventId,
        participantId: input.participantId,
        amount: input.amount,
        paidAt: parseDateInput(input.paidAt, "Ödəniş tarixi"),
        method: input.paymentMethod as PaymentMethod,
        payerName: input.payerName ?? participant.fullName,
        receiptFileName: receipt?.fileName ?? null,
        receiptFilePath: receipt?.filePath ?? null,
        receiptReference: input.receiptReference ?? null,
        note: input.note ?? null,
        idempotencyKey: input.idempotencyKey ?? randomUUID(),
        createdById: actor.id,
      },
    });
    await syncParticipantPaymentSnapshot(tx, participant.id);
    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "workshop.payment.create",
      entityType: "workshop_payment",
      entityId: created.id,
      after: paymentAuditJson(created),
      reason: input.note ?? "Workshop ödənişi qəbul edildi",
    });
    return created;
  });

  invalidateWorkshopCaches(input.eventId);
  return { ok: true as const, id: payment.id };
}

async function replaceWorkshopPaymentActionImpl(formData: FormData) {
  const actor = await requireMutationActor("workshop.finance.manage");
  const input = replacePaymentSchema.parse(Object.fromEntries(formData));
  const receipt = await persistReceiptFile(formData.get("receiptFile"), input.idempotencyKey);
  const prisma = getPrisma();

  await prisma.$transaction(async (tx) => {
    const existing = await tx.workshopPayment.findUnique({ where: { id: input.paymentId } });
    if (!existing || existing.voidedAt) throw new Error("Aktiv ödəniş tapılmadı");
    const participant = await getPayableParticipant(tx, existing.eventId, existing.participantId);
    const paidWithoutExisting = roundMoney(
      (await activeParticipantPaidTotal(tx, participant.id)) - toNumber(existing.amount)
    );
    const netPrice = participant.isGift
      ? 0
      : roundMoney(toNumber(participant.listPrice) - toNumber(participant.discountAmount));
    if (paidWithoutExisting + input.amount > netPrice) {
      throw new Error("Düzəlişdən sonra ödəniş iştirakçının qalıq məbləğini keçir");
    }

    await tx.workshopPayment.update({
      where: { id: existing.id },
      data: { voidedAt: new Date(), voidedById: actor.id, voidReason: input.reason },
    });
    const replacement = await tx.workshopPayment.create({
      data: {
        eventId: existing.eventId,
        participantId: existing.participantId,
        amount: input.amount,
        paidAt: parseDateInput(input.paidAt, "Ödəniş tarixi"),
        method: input.paymentMethod as PaymentMethod,
        payerName: input.payerName ?? participant.fullName,
        receiptFileName: receipt?.fileName ?? existing.receiptFileName,
        receiptFilePath: receipt?.filePath ?? existing.receiptFilePath,
        receiptReference: input.receiptReference ?? existing.receiptReference,
        note: input.note ?? existing.note,
        idempotencyKey: input.idempotencyKey ?? randomUUID(),
        createdById: actor.id,
        replacesPaymentId: existing.id,
      },
    });
    await syncParticipantPaymentSnapshot(tx, participant.id);
    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "workshop.payment.replace",
      entityType: "workshop_payment",
      entityId: replacement.id,
      before: paymentAuditJson(existing),
      after: paymentAuditJson(replacement),
      reason: input.reason,
    });
  });

  invalidateWorkshopCaches(input.eventId);
  return { ok: true as const };
}

async function voidWorkshopPaymentActionImpl(formData: FormData) {
  const actor = await requireMutationActor("workshop.finance.manage");
  const input = voidPaymentSchema.parse(Object.fromEntries(formData));
  const prisma = getPrisma();
  let eventId = "";

  await prisma.$transaction(async (tx) => {
    const payment = await tx.workshopPayment.findUnique({ where: { id: input.paymentId } });
    if (!payment || payment.voidedAt) throw new Error("Aktiv ödəniş tapılmadı");
    eventId = payment.eventId;
    await tx.workshopPayment.update({
      where: { id: payment.id },
      data: {
        voidedAt: new Date(),
        voidedById: actor.id,
        voidReason: input.reason ?? "Ödəniş ləğv edildi",
      },
    });
    await syncParticipantPaymentSnapshot(tx, payment.participantId);
    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "workshop.payment.void",
      entityType: "workshop_payment",
      entityId: payment.id,
      before: paymentAuditJson(payment),
      reason: input.reason ?? "Workshop ödənişi ləğv edildi",
    });
  });

  invalidateWorkshopCaches(eventId);
  return { ok: true as const };
}

async function createWorkshopExpenseActionImpl(formData: FormData) {
  const actor = await requireMutationActor("workshop.finance.manage");
  const input = expenseSchema.parse(Object.fromEntries(formData));
  const receipt = await persistReceiptFile(formData.get("receiptFile"), input.idempotencyKey);
  const prisma = getPrisma();
  const expense = await prisma.$transaction(async (tx) => {
    const event = await tx.workshopEvent.findUnique({ where: { id: input.eventId }, select: { id: true, title: true } });
    if (!event) throw new Error("Tədbir tapılmadı");
    const category = await resolveWorkshopExpenseCategory(tx, input.categoryId);
    const created = await tx.financeExpense.create({
      data: {
        workshopEventId: event.id,
        categoryId: category.id,
        transactionType: category.transactionType,
        financialClass: category.financialClass,
        costCenter: FinanceCostCenter.OPERATIONS,
        classificationReviewRequired: false,
        amount: input.amount,
        expenseDate: parseDateInput(input.expenseDate, "Xərc tarixi"),
        method: input.method as PaymentMethod,
        vendor: input.vendor,
        description: input.description,
        salaryMode: FinanceSalaryMode.NONE,
        receiptFileName: receipt?.fileName ?? null,
        receiptFilePath: receipt?.filePath ?? null,
        receiptReference: input.receiptReference ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        createdById: actor.id,
      },
    });
    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "workshop.expense.create",
      entityType: "finance_expense",
      entityId: created.id,
      after: expenseAuditJson(created),
      reason: input.description,
    });
    return created;
  });

  invalidateWorkshopCaches(input.eventId);
  return { ok: true as const, id: expense.id };
}

async function replaceWorkshopExpenseActionImpl(formData: FormData) {
  const actor = await requireMutationActor("workshop.finance.manage");
  const input = replaceExpenseSchema.parse(Object.fromEntries(formData));
  const receipt = await persistReceiptFile(formData.get("receiptFile"), input.idempotencyKey);
  const prisma = getPrisma();

  await prisma.$transaction(async (tx) => {
    const existing = await tx.financeExpense.findUnique({ where: { id: input.expenseId } });
    if (!existing?.workshopEventId || existing.voidedAt) throw new Error("Aktiv workshop xərci tapılmadı");
    if (existing.workshopEventId !== input.eventId) throw new Error("Xərc başqa tədbirə aiddir");
    const category = await resolveWorkshopExpenseCategory(tx, input.categoryId);
    await tx.financeExpense.update({
      where: { id: existing.id },
      data: { voidedAt: new Date(), voidedById: actor.id, voidReason: input.reason },
    });
    const replacement = await tx.financeExpense.create({
      data: {
        workshopEventId: existing.workshopEventId,
        categoryId: category.id,
        transactionType: category.transactionType,
        financialClass: category.financialClass,
        costCenter: FinanceCostCenter.OPERATIONS,
        classificationReviewRequired: false,
        amount: input.amount,
        expenseDate: parseDateInput(input.expenseDate, "Xərc tarixi"),
        method: input.method as PaymentMethod,
        vendor: input.vendor,
        description: input.description,
        salaryMode: FinanceSalaryMode.NONE,
        receiptFileName: receipt?.fileName ?? existing.receiptFileName,
        receiptFilePath: receipt?.filePath ?? existing.receiptFilePath,
        receiptReference: input.receiptReference ?? existing.receiptReference,
        idempotencyKey: input.idempotencyKey ?? null,
        createdById: actor.id,
        replacesExpenseId: existing.id,
      },
    });
    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "workshop.expense.replace",
      entityType: "finance_expense",
      entityId: replacement.id,
      before: expenseAuditJson(existing),
      after: expenseAuditJson(replacement),
      reason: input.reason,
    });
  });

  invalidateWorkshopCaches(input.eventId);
  return { ok: true as const };
}

async function voidWorkshopExpenseActionImpl(formData: FormData) {
  const actor = await requireMutationActor("workshop.finance.manage");
  const input = voidExpenseSchema.parse(Object.fromEntries(formData));
  const prisma = getPrisma();
  let eventId = "";

  await prisma.$transaction(async (tx) => {
    const expense = await tx.financeExpense.findUnique({ where: { id: input.expenseId } });
    if (!expense?.workshopEventId || expense.voidedAt) throw new Error("Aktiv workshop xərci tapılmadı");
    eventId = expense.workshopEventId;
    await tx.financeExpense.update({
      where: { id: expense.id },
      data: {
        voidedAt: new Date(),
        voidedById: actor.id,
        voidReason: input.reason ?? "Xərc ləğv edildi",
      },
    });
    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "workshop.expense.void",
      entityType: "finance_expense",
      entityId: expense.id,
      before: expenseAuditJson(expense),
      reason: input.reason ?? "Workshop xərci ləğv edildi",
    });
  });

  invalidateWorkshopCaches(eventId);
  return { ok: true as const };
}

async function resolveWorkshopExpenseCategory(
  tx: Prisma.TransactionClient,
  categoryId: string
) {
  const category = await tx.financeExpenseCategory.findUnique({
    where: { id: categoryId },
    select: {
      id: true,
      isActive: true,
      transactionType: true,
      financialClass: true,
      requiresProject: true,
    },
  });

  if (!category || !category.isActive) {
    throw new PublicActionError("Seçilmiş tədbir xərci kateqoriyası aktiv deyil.");
  }
  if (
    category.transactionType === FinanceTransactionType.INCOME ||
    !category.financialClass ||
    !category.requiresProject
  ) {
    throw new PublicActionError("Tədbir üçün yalnız layihə xərci kateqoriyası seçilə bilər.");
  }

  return { ...category, financialClass: category.financialClass };
}

async function getPayableParticipant(
  tx: Prisma.TransactionClient,
  eventId: string,
  participantId: string
) {
  const participant = await tx.workshopParticipant.findUnique({
    where: { id: participantId },
    include: { event: { select: { status: true } } },
  });
  if (!participant || participant.eventId !== eventId) throw new Error("İştirakçı tapılmadı");
  if (participant.cancelledAt) throw new Error("Ləğv edilmiş iştirakçıya ödəniş əlavə edilmir");
  if (participant.event.status === WorkshopEventStatus.CANCELLED) {
    throw new Error("Ləğv edilmiş tədbirə ödəniş əlavə edilmir");
  }
  if (participant.isGift) throw new Error("Hədiyyə iştirakçı üçün ödəniş qəbul edilmir");
  return participant;
}

async function assertPaymentFitsBalance(
  tx: Prisma.TransactionClient,
  participant: Awaited<ReturnType<typeof getPayableParticipant>>,
  amount: number
) {
  const paid = await activeParticipantPaidTotal(tx, participant.id);
  const netPrice = roundMoney(toNumber(participant.listPrice) - toNumber(participant.discountAmount));
  assertWorkshopPaymentWithinBalance(amount, roundMoney(netPrice - paid));
}

async function activeParticipantPaidTotal(tx: Prisma.TransactionClient, participantId: string) {
  const result = await tx.workshopPayment.aggregate({
    where: { participantId, voidedAt: null },
    _sum: { amount: true },
  });
  return roundMoney(toNumber(result._sum.amount));
}

async function syncParticipantPaymentSnapshot(tx: Prisma.TransactionClient, participantId: string) {
  const participant = await tx.workshopParticipant.findUnique({ where: { id: participantId } });
  if (!participant) return;
  const [paid, latest] = await Promise.all([
    activeParticipantPaidTotal(tx, participantId),
    tx.workshopPayment.findFirst({
      where: { participantId, voidedAt: null },
      orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
      select: { method: true },
    }),
  ]);
  const netPrice = participant.isGift
    ? 0
    : roundMoney(toNumber(participant.listPrice) - toNumber(participant.discountAmount));
  await tx.workshopParticipant.update({
    where: { id: participantId },
    data: {
      amountPaid: paid,
      isPaid: !participant.isGift && paid >= netPrice,
      paymentMethod: latest?.method ?? participant.paymentMethod,
    },
  });
}

function eventAuditJson(event: {
  title: string;
  eventType: WorkshopEventType;
  category: string | null;
  status: WorkshopEventStatus;
  eventDate: Date;
  startTime: string;
  entryPrice: Prisma.Decimal;
  posterUrl?: string | null;
}) {
  return {
    title: event.title,
    eventType: event.eventType,
    category: event.category,
    status: event.status,
    eventDate: event.eventDate.toISOString(),
    startTime: event.startTime,
    entryPrice: toNumber(event.entryPrice),
    posterUrl: event.posterUrl ?? null,
  } satisfies Prisma.InputJsonValue;
}

function normalizeEventType(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  const builtInKey = normalized.toLocaleUpperCase("az-AZ").replace(/[\s_-]+/g, "");
  if (builtInKey === "WORKSHOP") return "WORKSHOP";
  if (builtInKey === "MASTERCLASS") return "MASTERCLASS";
  return normalized;
}

function resolveEventType(value: string) {
  if (value === "MASTERCLASS") {
    return { kind: WorkshopEventType.MASTERCLASS, category: null };
  }
  if (value === "WORKSHOP") {
    return { kind: WorkshopEventType.WORKSHOP, category: null };
  }
  return { kind: WorkshopEventType.WORKSHOP, category: value };
}

function participantAuditJson(participant: {
  eventId: string;
  studentId: string | null;
  fullName: string;
  listPrice: Prisma.Decimal;
  amountPaid: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  isGift: boolean;
  cancelledAt?: Date | null;
}) {
  return {
    eventId: participant.eventId,
    studentId: participant.studentId,
    fullName: participant.fullName,
    listPrice: toNumber(participant.listPrice),
    amountPaid: toNumber(participant.amountPaid),
    discountAmount: toNumber(participant.discountAmount),
    isGift: participant.isGift,
    cancelledAt: participant.cancelledAt?.toISOString() ?? null,
  } satisfies Prisma.InputJsonValue;
}

function paymentAuditJson(payment: {
  eventId: string;
  participantId: string;
  amount: Prisma.Decimal;
  paidAt: Date;
  method: PaymentMethod;
  payerName: string | null;
  receiptReference: string | null;
  voidedAt?: Date | null;
}) {
  return {
    eventId: payment.eventId,
    participantId: payment.participantId,
    amount: toNumber(payment.amount),
    paidAt: payment.paidAt.toISOString(),
    method: payment.method,
    payerName: payment.payerName,
    receiptReference: payment.receiptReference,
    voidedAt: payment.voidedAt?.toISOString() ?? null,
  } satisfies Prisma.InputJsonValue;
}

function expenseAuditJson(expense: {
  workshopEventId: string | null;
  categoryId: string;
  amount: Prisma.Decimal;
  expenseDate: Date;
  method: PaymentMethod;
  vendor: string | null;
  description: string | null;
  voidedAt?: Date | null;
}) {
  return {
    workshopEventId: expense.workshopEventId,
    categoryId: expense.categoryId,
    amount: toNumber(expense.amount),
    expenseDate: expense.expenseDate.toISOString(),
    method: expense.method,
    vendor: expense.vendor,
    description: expense.description,
    voidedAt: expense.voidedAt?.toISOString() ?? null,
  } satisfies Prisma.InputJsonValue;
}

function resolveWorkshopFollowUpState(input: {
  status: WorkshopFollowUpStatus;
  nextAction: WorkshopFollowUpAction;
  outcome: WorkshopFollowUpOutcome;
  contactChannel: WorkshopContactChannel;
  priority: WorkshopFollowUpPriority;
  nextFollowUpAt?: string;
}) {
  const terminal = input.status === WorkshopFollowUpStatus.CONVERTED
    || input.status === WorkshopFollowUpStatus.NOT_INTERESTED;
  const hasNoNextAction = terminal || input.nextAction === WorkshopFollowUpAction.NONE;
  return {
    status: input.status,
    nextAction: terminal ? WorkshopFollowUpAction.NONE : input.nextAction,
    outcome: input.status === WorkshopFollowUpStatus.CONVERTED
      ? WorkshopFollowUpOutcome.REGISTERED
      : input.status === WorkshopFollowUpStatus.NOT_INTERESTED
        ? WorkshopFollowUpOutcome.DECLINED
        : input.status === WorkshopFollowUpStatus.NO_ANSWER && input.outcome === WorkshopFollowUpOutcome.NONE
          ? WorkshopFollowUpOutcome.NO_RESPONSE
          : input.outcome,
    contactChannel: input.contactChannel,
    priority: input.priority,
    nextFollowUpAt: hasNoNextAction ? null : parseOptionalDateTime(input.nextFollowUpAt, "Növbəti follow-up tarixi"),
    completedAt: terminal ? new Date() : null,
  };
}

async function assertWorkshopFollowUpAssignee(tx: Prisma.TransactionClient, assignedToId?: string) {
  if (!assignedToId) return;
  const assignee = await tx.user.findFirst({
    where: { id: assignedToId, isActive: true },
    select: { id: true },
  });
  if (!assignee) throw new PublicActionError("Seçilmiş məsul əməkdaş aktiv deyil");
}

async function createWorkshopFollowUpActivity(
  tx: Prisma.TransactionClient,
  followUp: {
    id: string;
    status: WorkshopFollowUpStatus;
    nextAction: WorkshopFollowUpAction;
    outcome: WorkshopFollowUpOutcome;
    contactChannel: WorkshopContactChannel;
    nextFollowUpAt: Date | null;
    note: string | null;
  },
  actorUserId: string,
  activityType: "CREATED" | "UPDATED" | "STATUS_CHANGED",
) {
  await tx.workshopFollowUpActivity.create({
    data: {
      followUpId: followUp.id,
      activityType,
      status: followUp.status,
      nextAction: followUp.nextAction,
      outcome: followUp.outcome,
      contactChannel: followUp.contactChannel,
      nextFollowUpAt: followUp.nextFollowUpAt,
      note: followUp.note,
      actorUserId,
    },
  });
}

function workshopFollowUpAuditJson(followUp: {
  participantId: string;
  targetEventId: string;
  status: WorkshopFollowUpStatus;
  nextAction: WorkshopFollowUpAction;
  outcome: WorkshopFollowUpOutcome;
  contactChannel: WorkshopContactChannel;
  priority: WorkshopFollowUpPriority;
  nextFollowUpAt: Date | null;
  lastContactedAt: Date | null;
  completedAt: Date | null;
  assignedToId: string | null;
  note: string | null;
}) {
  return {
    participantId: followUp.participantId,
    targetEventId: followUp.targetEventId,
    status: followUp.status,
    nextAction: followUp.nextAction,
    outcome: followUp.outcome,
    contactChannel: followUp.contactChannel,
    priority: followUp.priority,
    nextFollowUpAt: followUp.nextFollowUpAt?.toISOString() ?? null,
    lastContactedAt: followUp.lastContactedAt?.toISOString() ?? null,
    completedAt: followUp.completedAt?.toISOString() ?? null,
    assignedToId: followUp.assignedToId,
    note: followUp.note,
  } satisfies Prisma.InputJsonValue;
}

async function persistReceiptFile(
  value: FormDataEntryValue | null,
  idempotencyKey?: string,
) {
  if (!isUploadedFile(value)) return null;
  return uploadReceipt(value, idempotencyKey);
}

async function persistWorkshopPoster(value: FormDataEntryValue | null) {
  if (!isUploadedFile(value)) return null;
  return uploadWorkshopPoster(value);
}

function isUploadedFile(value: FormDataEntryValue | null): value is File {
  return typeof File !== "undefined" && value instanceof File && value.size > 0;
}

function parseAmountInput(value: unknown) {
  if (typeof value !== "string") return value;
  const normalized = value.trim().replace(",", ".");
  return normalized.length > 0 ? Number(normalized) : Number.NaN;
}

function parseDateInput(value: string, fieldName: string) {
  const normalized = normalizeDateValue(value);
  const date = normalized ? new Date(`${normalized}T00:00:00.000Z`) : null;
  if (!date || Number.isNaN(date.getTime())) throw new Error(`${fieldName} düzgün deyil`);
  return date;
}

function parseOptionalDateTime(value: string | undefined, fieldName: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${fieldName} düzgün deyil`);
  return date;
}

function normalizeDateValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const azMatch = trimmed.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (azMatch) {
    const [, day, month, year] = azMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  throw new Error("Tarix DD.MM.YYYY və ya YYYY-MM-DD formatında olmalıdır");
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function invalidateWorkshopCaches(eventId?: string) {
  revalidatePath("/workshops");
  if (eventId) revalidatePath(`/workshops/${eventId}`);
  revalidatePath("/finance");
  revalidatePath("/dashboard");
  updateTag(erpCacheTags.workshops);
  updateTag(erpCacheTags.finance);
  updateTag(erpCacheTags.dashboard);
}

export const createWorkshopEventAction = safeServerAction(
  createWorkshopEventActionImpl,
  "Tədbir yaradılmadı.",
);
export const updateWorkshopEventAction = safeServerAction(
  updateWorkshopEventActionImpl,
  "Tədbir yenilənmədi.",
);
export const deleteOrCancelWorkshopEventAction = safeServerAction(
  deleteOrCancelWorkshopEventActionImpl,
  "Tədbir silinmədi.",
);
export const assignWorkshopParticipantAction = safeServerAction(
  assignWorkshopParticipantActionImpl,
  "İştirakçı əlavə edilmədi.",
);
export const updateWorkshopParticipantAction = safeServerAction(
  updateWorkshopParticipantActionImpl,
  "İştirakçı yenilənmədi.",
);
export const cancelWorkshopParticipantAction = safeServerAction(
  cancelWorkshopParticipantActionImpl,
  "İştirakçı ləğv edilmədi.",
);
export const createWorkshopFollowUpAction = safeServerAction(
  createWorkshopFollowUpActionImpl,
  "Workshop follow-up yaradılmadı.",
);
export const updateWorkshopFollowUpAction = safeServerAction(
  updateWorkshopFollowUpActionImpl,
  "Workshop follow-up yenilənmədi.",
);
export const recordWorkshopPaymentAction = safeServerAction(
  recordWorkshopPaymentActionImpl,
  "Ödəniş qeydə alınmadı.",
);
export const replaceWorkshopPaymentAction = safeServerAction(
  replaceWorkshopPaymentActionImpl,
  "Ödəniş yenilənmədi.",
);
export const voidWorkshopPaymentAction = safeServerAction(
  voidWorkshopPaymentActionImpl,
  "Ödəniş ləğv edilmədi.",
);
export const createWorkshopExpenseAction = safeServerAction(
  createWorkshopExpenseActionImpl,
  "Xərc yaradılmadı.",
);
export const replaceWorkshopExpenseAction = safeServerAction(
  replaceWorkshopExpenseActionImpl,
  "Xərc yenilənmədi.",
);
export const voidWorkshopExpenseAction = safeServerAction(
  voidWorkshopExpenseActionImpl,
  "Xərc ləğv edilmədi.",
);
