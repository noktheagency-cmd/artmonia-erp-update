"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import {
  PaymentMethod,
  Prisma,
  WorkshopEventStatus,
  WorkshopEventType,
} from "@/generated/prisma/client";
import { getPrisma } from "@/server/db/prisma";
import { requireMutationActor } from "@/server/auth/actor";
import { writeAuditLog } from "@/modules/audit/audit-service";
import { erpCacheTags } from "@/modules/shared/cache-tags";
import { optionalFormString } from "@/modules/shared/form-values";
import { toNumber } from "@/modules/shared/format";
import { studentPaymentMethodValues } from "@/modules/students/payment-method";

const optionalText = (max: number) =>
  z.preprocess(optionalFormString, z.string().max(max).optional());

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
}, z.number().nonnegative().max(100_000).optional());

const requiredAmount = z.preprocess(
  parseAmountInput,
  z.number().nonnegative().max(100_000)
);

const checkbox = z.preprocess(
  (value) => value === "on" || value === "true" || value === "1",
  z.boolean()
);

const createWorkshopEventSchema = z.object({
  title: z.string().trim().min(2).max(140),
  eventType: z.enum([WorkshopEventType.WORKSHOP, WorkshopEventType.MASTERCLASS]),
  status: z
    .enum([
      WorkshopEventStatus.DRAFT,
      WorkshopEventStatus.SCHEDULED,
      WorkshopEventStatus.COMPLETED,
      WorkshopEventStatus.CANCELLED,
    ])
    .default(WorkshopEventStatus.SCHEDULED),
  eventDate: z.string().trim().min(1).max(20),
  startTime: z.string().trim().regex(/^\d{2}:\d{2}$/),
  durationMinutes: requiredInt(30, 600),
  room: optionalText(90),
  instructor: optionalText(120),
  capacity: optionalInt(1, 1000),
  entryPrice: requiredAmount,
  note: optionalText(700),
});

const assignParticipantSchema = z.object({
  eventId: z.string().uuid(),
  studentId: optionalUuid,
  fullName: optionalText(140),
  phone: optionalText(40),
  listPrice: optionalAmount,
  amountPaid: optionalAmount,
  paymentMethod: z.enum(studentPaymentMethodValues).default(PaymentMethod.CASH),
  isPaid: checkbox.default(false),
  isDiscounted: checkbox.default(false),
  isGift: checkbox.default(false),
  note: optionalText(700),
});

export async function createWorkshopEventAction(formData: FormData) {
  const actor = await requireMutationActor("workshop.manage");
  const input = createWorkshopEventSchema.parse(Object.fromEntries(formData));
  const eventDate = parseDateInput(input.eventDate, "Tədbir tarixi");
  const prisma = getPrisma();

  const event = await prisma.workshopEvent.create({
    data: {
      title: input.title,
      eventType: input.eventType,
      status: input.status,
      eventDate,
      startTime: input.startTime,
      durationMinutes: input.durationMinutes,
      room: input.room ?? null,
      instructor: input.instructor ?? null,
      capacity: input.capacity ?? null,
      entryPrice: input.entryPrice,
      note: input.note ?? null,
      createdById: actor.id,
    },
    select: {
      id: true,
      title: true,
      eventType: true,
      status: true,
      eventDate: true,
      startTime: true,
      entryPrice: true,
    },
  });

  await writeAuditLog(prisma, {
    actorUserId: actor.id,
    action: "workshop.event.create",
    entityType: "workshop_event",
    entityId: event.id,
    after: {
      title: event.title,
      eventType: event.eventType,
      status: event.status,
      eventDate: event.eventDate.toISOString(),
      startTime: event.startTime,
      entryPrice: toNumber(event.entryPrice),
    } satisfies Prisma.InputJsonValue,
    reason: input.note ?? "Workshop/masterclass yaradıldı",
  });

  invalidateWorkshopCaches();
}

export async function assignWorkshopParticipantAction(formData: FormData) {
  const actor = await requireMutationActor("workshop.manage");
  const input = assignParticipantSchema.parse(Object.fromEntries(formData));
  const prisma = getPrisma();

  await prisma.$transaction(async (tx) => {
    const event = await tx.workshopEvent.findUnique({
      where: { id: input.eventId },
      select: {
        id: true,
        title: true,
        entryPrice: true,
        capacity: true,
        status: true,
        _count: {
          select: {
            participants: true,
          },
        },
      },
    });

    if (!event) {
      throw new Error("Tədbir tapılmadı");
    }

    if (event.status === WorkshopEventStatus.CANCELLED) {
      throw new Error("Ləğv edilmiş tədbirə iştirakçı əlavə etmək olmaz");
    }

    if (event.capacity && event._count.participants >= event.capacity) {
      throw new Error("Tədbirin iştirakçı limiti doludur");
    }

    const student = input.studentId
      ? await tx.student.findUnique({
          where: { id: input.studentId },
          select: {
            id: true,
            code: true,
            contact: {
              select: {
                fullName: true,
                phoneDisplay: true,
              },
            },
          },
        })
      : null;

    if (input.studentId && !student) {
      throw new Error("Tələbə tapılmadı");
    }

    if (student) {
      const existing = await tx.workshopParticipant.findUnique({
        where: {
          eventId_studentId: {
            eventId: event.id,
            studentId: student.id,
          },
        },
        select: { id: true },
      });

      if (existing) {
        throw new Error("Bu tələbə artıq həmin tədbirə assign edilib");
      }
    }

    const fullName = input.fullName ?? student?.contact.fullName;

    if (!fullName) {
      throw new Error("İştirakçı adı daxil edilməlidir");
    }

    const listPrice = roundMoney(input.listPrice ?? toNumber(event.entryPrice));
    const paymentSnapshot = resolveParticipantPayment({
      listPrice,
      amountPaid: input.amountPaid,
      isPaid: input.isPaid,
      isDiscounted: input.isDiscounted,
      isGift: input.isGift,
    });

    const participant = await tx.workshopParticipant.create({
      data: {
        eventId: event.id,
        studentId: student?.id ?? null,
        fullName,
        phone: input.phone ?? student?.contact.phoneDisplay ?? null,
        paymentMethod: input.paymentMethod as PaymentMethod,
        listPrice,
        amountPaid: paymentSnapshot.amountPaid,
        discountAmount: paymentSnapshot.discountAmount,
        isPaid: paymentSnapshot.isPaid,
        isDiscounted: paymentSnapshot.isDiscounted,
        isGift: paymentSnapshot.isGift,
        note: input.note ?? null,
        assignedById: actor.id,
      },
      select: {
        id: true,
        eventId: true,
        studentId: true,
        fullName: true,
        listPrice: true,
        amountPaid: true,
        discountAmount: true,
        isPaid: true,
        isDiscounted: true,
        isGift: true,
      },
    });

    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "workshop.participant.assign",
      entityType: "workshop_participant",
      entityId: participant.id,
      after: {
        eventId: participant.eventId,
        eventTitle: event.title,
        studentId: participant.studentId,
        fullName: participant.fullName,
        listPrice: toNumber(participant.listPrice),
        amountPaid: toNumber(participant.amountPaid),
        discountAmount: toNumber(participant.discountAmount),
        isPaid: participant.isPaid,
        isDiscounted: participant.isDiscounted,
        isGift: participant.isGift,
      } satisfies Prisma.InputJsonValue,
      reason: input.note ?? "İştirakçı tədbirə assign edildi",
    });
  });

  invalidateWorkshopCaches();
}

function resolveParticipantPayment(input: {
  listPrice: number;
  amountPaid: number | undefined;
  isPaid: boolean;
  isDiscounted: boolean;
  isGift: boolean;
}) {
  if (input.isGift) {
    return {
      amountPaid: 0,
      discountAmount: input.listPrice,
      isPaid: false,
      isDiscounted: false,
      isGift: true,
    };
  }

  if (!input.isPaid) {
    return {
      amountPaid: 0,
      discountAmount: 0,
      isPaid: false,
      isDiscounted: false,
      isGift: false,
    };
  }

  const amountPaid = roundMoney(input.amountPaid ?? input.listPrice);
  const discountAmount = input.isDiscounted
    ? roundMoney(Math.max(input.listPrice - amountPaid, 0))
    : 0;

  return {
    amountPaid,
    discountAmount,
    isPaid: true,
    isDiscounted: input.isDiscounted && discountAmount > 0,
    isGift: false,
  };
}

function parseAmountInput(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim().replace(",", ".");
  return normalized.length > 0 ? Number(normalized) : Number.NaN;
}

function parseDateInput(value: string, fieldName: string) {
  const normalized = normalizeDateValue(value);
  const date = normalized ? new Date(`${normalized}T00:00:00.000Z`) : null;

  if (!date || Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} düzgün deyil`);
  }

  return date;
}

function normalizeDateValue(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return trimmed;
  }

  const azMatch = trimmed.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (azMatch) {
    const [, day, month, year] = azMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  throw new Error("Tarix DD.MM.YYYY və ya YYYY-MM-DD formatında olmalıdır");
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function invalidateWorkshopCaches() {
  revalidatePath("/workshops");
  revalidatePath("/dashboard");
  updateTag(erpCacheTags.workshops);
  updateTag(erpCacheTags.dashboard);
}
