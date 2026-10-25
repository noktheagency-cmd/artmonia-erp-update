"use server";
import { resolveStudentEducationLevel } from "@/modules/students/education-level-service";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { LeadStage, PaymentMethod, StudentLifecycleStatus } from "@/generated/prisma/client";
import type { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/server/db/prisma";
import { requireMutationActor } from "@/server/auth/actor";
import { writeAuditLog } from "@/modules/audit/audit-service";
import { contractConfirmationSchema } from "@/modules/students/course-sale-policy";
import { recordCourseSalePayment } from "@/modules/students/course-sale-service";
import { parseBillingMonthInput } from "@/modules/students/payment-billing-period";
import { parsePaymentDateInput } from "@/modules/students/payment-date-policy";
import { studentPaymentMethodValues } from "@/modules/students/payment-method";
import {
  AVANS_PAYMENT_KIND,
  storedScheduleTypeForPaymentKind,
  studentPaymentKindOptions,
  studentPaymentScheduleTypeValues,
} from "@/modules/students/payment-schedule-type";
import { PublicActionError } from "@/server/actions/public-action-error";
import {
  assertCanAccessLead,
  assertCanEditLead,
  resolveLeadManagerId,
} from "@/modules/crm/access";
import {
  findDuplicatePhoneMatches,
  normalizePhone,
} from "@/modules/crm/duplicate-phone";
import {
  leadPriorityOptions,
  nextActionTypeOptions,
} from "@/modules/crm/follow-up";
import { leadStageOptions } from "@/modules/crm/stage";
import {
  MAX_TRIAL_LESSON_COUNT,
  resolveTrialLessonCount,
  resolveTrialLessonNextAction,
} from "@/modules/crm/trial-lesson";
import { optionalFormString } from "@/modules/shared/form-values";
import { CRM_UPDATE_NOTE_MAX_LENGTH } from "@/modules/crm/note-limits";
import { deleteLeadWithPlans } from "./lead-deletion-service";
import { erpCacheTags } from "@/modules/shared/cache-tags";
import { assertCreationDatesAllowed } from "@/modules/shared/creation-date-policy";
import { assertLeadPlan } from "./lead-validation";
import { resolveRegistrationMeetingAttendance } from "./registration-attend-policy";
import { closeConvertedLeadFollowUp, syncLeadWorkPlan } from "./work-service";
import {
  enrollmentStatusForStudentLifecycle,
  isBillingPausedStatus,
} from "@/modules/students/lifecycle-service";
import {
  isGiftDiscount,
  resolveStudentMonthlyFee,
} from "@/modules/students/student-create-rules";
import { getBakuDateInput } from "@/modules/students/student-reminders";
import {
  safeServerAction,
  toActionFailure,
} from "@/server/actions/safe-action";

const optionalText = (max: number) =>
  z.preprocess(
    optionalFormString,
    z.string().max(max).optional()
  );

const optionalUuid = z.preprocess(
  optionalFormString,
  z.string().uuid().optional()
);

const optionalNextActionType = z.preprocess(
  optionalFormString,
  z.enum(nextActionTypeOptions).optional()
);

const optionalTrialLessonCount = z.preprocess(
  (value) => {
    const normalized = optionalFormString(value);
    return normalized === undefined ? undefined : Number(normalized);
  },
  z.number().int().min(1).max(MAX_TRIAL_LESSON_COUNT).optional(),
);

const createLeadSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: optionalText(40),
  source: optionalText(60),
  educationLevel: optionalText(80),
  programId: optionalUuid,
  campaignId: optionalUuid,
  stage: z.enum(leadStageOptions).default(LeadStage.NEW),
  priority: z.enum(leadPriorityOptions).default("NORMAL"),
  nextActionType: optionalNextActionType,
  nextFollowUpDate: optionalText(20),
  trialLessonCount: optionalTrialLessonCount,
  note: optionalText(180),
});

const updateLeadStageSchema = z.object({
  leadId: z.string().uuid(),
  stage: z.enum(leadStageOptions),
  reason: optionalText(180),
  returnTo: optionalText(260),
});

const updateLeadSchema = z.object({
  leadId: z.string().uuid(),
  fullName: z.string().trim().min(2).max(120),
  phone: optionalText(40),
  source: optionalText(60),
  educationLevel: optionalText(80),
  programId: optionalUuid,
  managerId: optionalUuid,
  stage: z.enum(leadStageOptions),
  priority: z.enum(leadPriorityOptions).default("NORMAL"),
  nextActionType: optionalNextActionType,
  nextFollowUpDate: optionalText(20),
  trialLessonCount: optionalTrialLessonCount,
  note: z.string({ error: "Yeniləmə qeydi daxil edilməlidir." }).trim().min(1, "Yeniləmə qeydi daxil edilməlidir.").max(CRM_UPDATE_NOTE_MAX_LENGTH),
  returnTo: optionalText(260),
});

const optionalAmount = z.preprocess((value) => {
  const normalized = optionalFormString(value);
  if (!normalized) return undefined;
  const amount = Number(normalized.replace(",", "."));
  return Number.isFinite(amount) ? amount : Number.NaN;
}, z.number().nonnegative().max(100_000).optional());

const optionalLessonCount = z.preprocess((value) => {
  const normalized = optionalFormString(value);
  return normalized ? Number(normalized) : undefined;
}, z.number().int().positive().max(120).optional());

const convertLeadSchema = z.object({
  leadId: z.string().uuid(),
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(7).max(40),
  source: optionalText(60),
  educationLevel: optionalText(80),
  programId: z.string().uuid(),
  teacherId: optionalUuid,
  firstLessonDate: optionalText(20),
  discountType: optionalText(80),
  monthlyFee: optionalAmount,
  lessonsPerMonth: optionalLessonCount,
  contractConfirmed: contractConfirmationSchema,
  paymentAmount: optionalAmount,
  paymentDate: optionalText(20),
  paymentMonth: optionalText(7),
  paymentMethod: z.enum(studentPaymentMethodValues).default("CASH"),
  paymentKind: z.enum([...studentPaymentScheduleTypeValues, AVANS_PAYMENT_KIND] as const).default("MONTHLY"),
  paymentNote: optionalText(240),
  confirmMeetingAttended: z.preprocess(
    (value) => value === "on" || value === "true" || value === true,
    z.boolean(),
  ).default(false),
  returnTo: optionalText(260),
}).superRefine((value, context) => {
  if (isGiftDiscount(value.discountType)) return;
  if (!value.paymentAmount || value.paymentAmount <= 0) {
    context.addIssue({
      code: "custom",
      path: ["paymentAmount"],
      message: "Qeydiyyat üçün ilkin ödəniş məbləği məcburidir.",
    });
  }
  if (!value.paymentDate) {
    context.addIssue({
      code: "custom",
      path: ["paymentDate"],
      message: "Ödəniş tarixi seçilməlidir.",
    });
  }
  if (!value.paymentMonth) {
    context.addIssue({
      code: "custom",
      path: ["paymentMonth"],
      message: "Ödənişin aid olduğu ay seçilməlidir.",
    });
  }
});

const deleteLeadSchema = z.object({
  leadId: z.string().uuid(),
  reason: z.string({ error: "Silinmə açıqlaması daxil edilməlidir." }).trim().min(1, "Silinmə açıqlaması daxil edilməlidir.").max(500),
  returnTo: optionalText(260),
});

const duplicatePhoneSchema = z.object({
  phone: z.string().max(40),
});

async function findDuplicatePhoneActionImpl(phone: string) {
  await requireMutationActor("crm.lead.read");

  const input = duplicatePhoneSchema.parse({ phone });
  return findDuplicatePhoneMatches(input.phone);
}

export type CreateLeadFormState = {
  status: "idle" | "success" | "error";
  message?: string;
  leadId?: string;
};

async function createLeadActionImpl(formData: FormData) {
  await createLead(formData);

  revalidatePath("/crm");
  revalidatePath("/dashboard");
  revalidatePath("/marketing");
  invalidateCrmCaches();
  return { redirectTo: "/crm?tab=list&leadCreated=1" };
}

export async function createLeadFormAction(
  _previousState: CreateLeadFormState,
  formData: FormData
): Promise<CreateLeadFormState> {
  return createLeadClientAction(formData);
}

export async function createLeadClientAction(
  formData: FormData
): Promise<CreateLeadFormState> {
  try {
    const leadId = await createLead(formData);

    revalidatePath("/crm");
    revalidatePath("/dashboard");
    revalidatePath("/marketing");
    invalidateCrmCaches();

    return {
      status: "success",
      message: "Yeni müraciət siyahıya əlavə olundu.",
      leadId,
    };
  } catch (error) {
    return {
      status: "error",
      message: toActionFailure(error, "Müraciət yaradılmadı.").message,
    };
  }
}

async function createLead(formData: FormData) {
  const actor = await requireMutationActor("crm.lead.create");
  const input = createLeadSchema.parse(Object.fromEntries(formData));
  assertCreationDatesAllowed([{ label: "Növbəti addım tarixi", value: input.nextFollowUpDate }]);
  const prisma = getPrisma();
  const managerId = actor.id;
  const phoneNormalized = normalizePhone(input.phone);
  const followUpAt = parseFollowUpAt(input.nextFollowUpDate);
  if (input.stage === LeadStage.REGISTERED) throw new Error("Ödənişli qəbul olmadan Qeydiyyata alınıb seçilə bilməz.");
  assertLeadPlan({ stage: input.stage, phone: phoneNormalized, programId: input.programId,
    nextActionType: input.nextActionType, nextDate: followUpAt, reason: input.note });
  const nextActionType =
    input.nextActionType ??
    (input.stage === LeadStage.TRIAL_LESSON
      ? "TRIAL_LESSON_REMINDER"
      : undefined);
  // A consultation reminder with a date means the consultation has been scheduled,
  // not attended. Represent it as a real SCHEDULED appointment so the history is accurate.
  const consultationScheduled = nextActionType === "CONSULTATION_REMINDER" && Boolean(followUpAt);
  const effectiveStage = consultationScheduled ? LeadStage.QUALIFIED : input.stage;
  let createdLeadId = "";

  await prisma.$transaction(async (tx) => {
    if (input.programId && !await tx.program.findUnique({ where: { id: input.programId, isActive: true }, select: { id: true } })) {
      throw new Error("Proqram tapılmadı və ya arxivdədir.");
    }
    const educationLevel = await resolveEducationLevelName(tx, input.educationLevel);
    const contact = await tx.contact.create({
      data: {
        fullName: input.fullName,
        phoneDisplay: input.phone ?? null,
        phoneNormalized,
        source: input.source ?? "Manual",
      },
    });

    const lead = await tx.lead.create({
      data: {
        contactId: contact.id,
        stage: effectiveStage,
        source: input.source ?? "Manual",
        educationLevel,
        managerId,
        campaignId: null,
        programInterestId: input.programId ?? null,
        nextFollowUpAt: followUpAt,
        nextActionType: nextActionType ?? null,
        trialLessonCount: resolveTrialLessonCount({
          stage: effectiveStage,
          requestedCount: input.trialLessonCount,
        }),
        priority: input.priority,
        stageHistory: {
          create: {
            newStage: effectiveStage,
            reason: consultationScheduled
              ? (input.note ?? "Əlaqə quruldu, konsultasiya təyin edildi")
              : (input.note ?? "Müraciət yaradıldı"),
            changedById: actor.id,
          },
        },
      },
      select: {
        id: true,
        stage: true,
        contactId: true,
        source: true,
        nextActionType: true,
        trialLessonCount: true,
      },
    });
    createdLeadId = lead.id;
    if (consultationScheduled && followUpAt) {
      // Use noon in Baku for a date-only consultation selection, matching the UI default.
      const localDate = normalizeDateValue(input.nextFollowUpDate);
      const plannedAt = new Date(`${localDate}T12:00:00+04:00`);
      const reminderWork = await tx.leadWorkItem.create({
        data: { leadId: lead.id, ownerId: managerId, kind: "APPOINTMENT", source: "APPOINTMENT", plannedAt },
      });
      await tx.crmAppointment.create({
        data: {
          leadId: lead.id,
          ownerId: managerId,
          kind: "MEETING",
          outcome: "SCHEDULED",
          plannedAt,
          reminderWorkId: reminderWork.id,
          idempotencyKey: randomUUID(),
        },
      });
      // The appointment is the follow-up record; avoid a duplicate PRIMARY reminder task.
      await syncLeadWorkPlan(tx, { leadId: lead.id, ownerId: managerId, kind: null, plannedAt: null });
    } else {
      await syncLeadWorkPlan(tx, { leadId: lead.id, ownerId: managerId, kind: nextActionType ?? null, plannedAt: followUpAt,
        closed: input.stage === LeadStage.LOST });
    }

    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "lead.create",
      entityType: "lead",
      entityId: lead.id,
      after: lead as Prisma.InputJsonValue,
      reason: input.note ?? null,
    });
  });

  return createdLeadId;
}

async function updateLeadActionImpl(formData: FormData) {
  const actor = await requireMutationActor("crm.lead.update");
  const input = updateLeadSchema.parse(Object.fromEntries(formData));
  const prisma = getPrisma();
  const phoneNormalized = normalizePhone(input.phone);
  const followUpAt = parseFollowUpAt(input.nextFollowUpDate);
  const existingLead = await prisma.lead.findUnique({
    where: { id: input.leadId },
    select: { convertedStudentId: true },
  });
  const alreadyConverted = Boolean(existingLead?.convertedStudentId);
  if (!alreadyConverted) {
    assertLeadPlan({ stage: input.stage, phone: phoneNormalized, programId: input.programId,
      nextActionType: input.nextActionType, nextDate: followUpAt, reason: input.note });
  }
  const nextActionType =
    input.nextActionType ??
    (input.stage === LeadStage.TRIAL_LESSON
      ? "TRIAL_LESSON_REMINDER"
      : undefined);

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`select id from erp.leads where id = ${input.leadId}::uuid for update`;
    const current = await tx.lead.findUnique({
      where: { id: input.leadId },
      select: {
        id: true,
        managerId: true,
        stage: true,
        source: true,
        priority: true,
        educationLevel: true,
        nextActionType: true,
        trialLessonCount: true,
        programInterestId: true,
        convertedStudentId: true,
        nextFollowUpAt: true,
        contactId: true,
        contact: {
          select: {
            fullName: true,
            phoneDisplay: true,
            phoneNormalized: true,
          },
        },
      },
    });

    if (!current) {
      throw new Error("Müraciət tapılmadı");
    }

    assertCanEditLead(actor, current);
    if (input.stage === LeadStage.REGISTERED && current.stage !== LeadStage.REGISTERED) {
      throw new Error("Qeydiyyata alınıb mərhələsi yalnız uyğun ödənişli qəbuldan yaranır.");
    }
    const managerId = resolveLeadManagerId(actor, input.managerId, current.managerId);
    if (!managerId) throw new Error("Müraciətin məsulu seçilməlidir.");
    const followUpClosed = Boolean(current.convertedStudentId)
      || input.stage === LeadStage.REGISTERED
      || input.stage === LeadStage.LOST;
    // A scheduled CRM appointment is the source of truth for the next follow-up.
    // The profile form can contain stale nextFollowUpDate values when an appointment
    // was scheduled in the Meetings tab, so do not let saving profile fields restore
    // an older date over the appointment plan.
    const scheduledAppointment = followUpClosed ? null : await tx.crmAppointment.findFirst({
      where: { leadId: current.id, outcome: "SCHEDULED" },
      orderBy: [{ plannedAt: "desc" }, { createdAt: "desc" }],
      select: { plannedAt: true },
    });
    const plannedAt = followUpClosed ? null : scheduledAppointment?.plannedAt ?? followUpAt;
    const plannedAction = followUpClosed ? null : scheduledAppointment ? "CONSULTATION_REMINDER" : nextActionType ?? null;
    await syncLeadWorkPlan(tx, { leadId: current.id, ownerId: managerId, kind: plannedAction, plannedAt,
      closed: followUpClosed });

    if (input.programId && input.programId !== current.programInterestId && !await tx.program.findUnique({ where: { id: input.programId, isActive: true }, select: { id: true } })) {
      throw new Error("Proqram tapılmadı və ya arxivdədir.");
    }
    const educationLevel =
      input.educationLevel === current.educationLevel
        ? current.educationLevel
        : await resolveEducationLevelName(tx, input.educationLevel);
    const trialLessonCount = resolveTrialLessonCount({
      stage: input.stage,
      requestedCount: input.trialLessonCount,
      existingCount: current.trialLessonCount,
    });

    await tx.contact.update({
      where: { id: current.contactId },
      data: {
        fullName: input.fullName,
        phoneDisplay: input.phone ?? null,
        phoneNormalized,
        source: input.source ?? current.source ?? "Manual",
      },
    });

    const updated = await tx.lead.update({
      where: { id: input.leadId },
      data: {
        stage: input.stage,
        source: input.source ?? "Manual",
        educationLevel,
        managerId,
        programInterestId: input.programId ?? null,
        nextFollowUpAt: plannedAt,
        nextActionType: plannedAction,
        trialLessonCount,
        priority: input.priority,
      },
      select: {
        id: true,
        stage: true,
        source: true,
        educationLevel: true,
        managerId: true,
        programInterestId: true,
        nextFollowUpAt: true,
        nextActionType: true,
        trialLessonCount: true,
        priority: true,
      },
    });

    if (current.stage !== input.stage || input.note) {
      await tx.leadStageHistory.create({
        data: {
          leadId: input.leadId,
          oldStage: current.stage,
          newStage: input.stage,
          reason: input.note ?? "Müraciət yeniləndi",
          changedById: actor.id,
        },
      });
    }

    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "lead.update",
      entityType: "lead",
      entityId: input.leadId,
      before: {
        id: current.id,
        stage: current.stage,
        source: current.source,
        educationLevel: current.educationLevel,
        priority: current.priority,
        nextActionType: current.nextActionType,
        trialLessonCount: current.trialLessonCount,
        managerId: current.managerId,
        programInterestId: current.programInterestId,
        nextFollowUpAt: current.nextFollowUpAt?.toISOString() ?? null,
        contact: current.contact,
      },
      after: {
        ...updated,
        nextFollowUpAt: updated.nextFollowUpAt?.toISOString() ?? null,
        contact: {
          fullName: input.fullName,
          phoneDisplay: input.phone ?? null,
          phoneNormalized,
        },
      },
      reason: input.note ?? null,
    });
  });

  revalidatePath("/crm");
  revalidatePath("/dashboard");
  revalidatePath("/marketing");
  invalidateCrmCaches();
  return { redirectTo: safeCrmRedirect(input.returnTo) };
}

async function deleteLeadActionImpl(formData: FormData) {
  const actor = await requireMutationActor("crm.lead.delete");
  const input = deleteLeadSchema.parse(Object.fromEntries(formData));
  const prisma = getPrisma();

  await prisma.$transaction((tx) => deleteLeadWithPlans(tx, input, actor));

  revalidatePath("/crm");
  revalidatePath("/dashboard");
  revalidatePath("/marketing");
  invalidateCrmCaches();
  return { redirectTo: safeCrmRedirect(input.returnTo) };
}

async function convertLeadToStudentActionImpl(formData: FormData) {
  const actor = await requireMutationActor("crm.lead.convert");
  const input = convertLeadSchema.parse(Object.fromEntries(formData));
  const prisma = getPrisma();
  const today = new Date();
  const registeredAt = new Date(`${getBakuDateInput(today)}T00:00:00.000Z`);
  const phoneNormalized = normalizePhone(input.phone);
  const giftAdmission = isGiftDiscount(input.discountType);

  if (!phoneNormalized) {
    throw new Error("Telefon düzgün deyil");
  }

  if (!giftAdmission && !actor.permissions.has("billing.payment.create")) {
    throw new PublicActionError("Ödəniş qəbul etmək icazəsi yoxdur.", "FORBIDDEN");
  }

  const paymentDate = !giftAdmission && input.paymentDate
    ? parsePaymentDateInput(input.paymentDate)
    : null;
  const paymentMonth = paymentDate
    ? parseBillingMonthInput(input.paymentMonth, paymentDate)
    : null;

  assertCreationDatesAllowed([
    { label: "İlk dərs tarixi", value: input.firstLessonDate },
    { label: "Ödəniş tarixi", value: paymentDate },
    { label: "Ödənişin aid olduğu ay", value: paymentMonth },
  ], today);

  await prisma.$transaction(async (tx) => {
    const lead = await tx.lead.findUnique({
      where: { id: input.leadId },
      select: {
        id: true,
        stage: true,
        source: true,
        contactId: true,
        managerId: true,
        programInterestId: true,
        convertedStudentId: true,
        campaignId: true,
        educationLevel: true,
        contact: {
          select: {
            fullName: true,
            phoneDisplay: true,
            students: {
              select: {
                id: true,
                code: true,
              },
              take: 1,
            },
          },
        },
      },
    });

    const program = await tx.program.findFirst({
      where: { id: input.programId, isActive: true },
      select: {
        id: true,
        defaultMonthlyFee: true,
        defaultLessonsPerMonth: true,
        pricingVersions: {
          where: {
            validFrom: { lte: today },
            OR: [{ validTo: null }, { validTo: { gte: today } }],
          },
          orderBy: { validFrom: "desc" },
          take: 1,
          select: {
            monthlyFee: true,
            lessonsPerMonth: true,
          },
        },
      },
    });

    if (!lead) {
      throw new Error("Müraciət tapılmadı");
    }

    assertCanAccessLead(actor, lead, "crm.lead.convert");

    if (lead.convertedStudentId || lead.stage === LeadStage.REGISTERED) {
      throw new Error("Müraciət artıq tələbəyə çevrilib");
    }

    if (lead.contact.students.length > 0) {
      throw new Error(`Bu əlaqə artıq ${lead.contact.students[0].code} kodlu tələbəyə bağlıdır`);
    }

    if (!program) {
      throw new Error("Seçilən proqram aktiv deyil və ya tapılmadı");
    }

    // BK-18: confirm meeting attendance in the same registration window when required.
    await resolveRegistrationMeetingAttendance(tx, {
      leadId: lead.id,
      confirmMeetingAttended: input.confirmMeetingAttended,
      actorId: actor.id,
    });

    const educationLevel = await resolveEducationLevelName(tx, input.educationLevel);
    await tx.contact.update({
      where: { id: lead.contactId },
      data: {
        fullName: input.fullName,
        phoneDisplay: input.phone,
        phoneNormalized,
        source: input.source ?? lead.source ?? "Manual",
      },
    });

    const programMonthlyFee = Number(
      program.pricingVersions[0]?.monthlyFee ?? program.defaultMonthlyFee,
    );
    const programLessons =
      program.pricingVersions[0]?.lessonsPerMonth ??
      program.defaultLessonsPerMonth;
    const monthlyFee = resolveStudentMonthlyFee(
      input.discountType,
      input.monthlyFee ?? programMonthlyFee,
    );
    const lessonsPerMonth = input.lessonsPerMonth ?? programLessons;
    const firstLessonAt = input.firstLessonDate
      ? new Date(`${input.firstLessonDate}T00:00:00.000Z`)
      : null;
    if (firstLessonAt && Number.isNaN(firstLessonAt.getTime())) {
      throw new Error("İlk dərs tarixi düzgün deyil");
    }
    if (input.teacherId) {
      const teacher = await tx.teacher.findFirst({
        where: { id: input.teacherId, isActive: true },
        select: { id: true },
      });
      if (!teacher) throw new Error("Seçilən müəllim tapılmadı");
    }
    const studentCode = await generateStudentCode(tx);

    const student = await tx.student.create({
      data: {
        code: studentCode,
        contactId: lead.contactId,
        managerId: lead.managerId ?? actor.id,
        campaignId: lead.campaignId,
        admissionTracking: true,
        lifecycleStatus: StudentLifecycleStatus.SLOT_WAITING,
        educationLevel,
        billingPaused: isBillingPausedStatus(StudentLifecycleStatus.SLOT_WAITING),
        registeredAt,
        originalFirstLessonAt: firstLessonAt,
        notes: `CRM müraciətindən tələbəyə çevrildi: ${lead.id}`,
        statusHistory: {
          create: {
            newStatus: StudentLifecycleStatus.SLOT_WAITING,
            reason: "CRM müraciəti tələbəyə çevrildi",
            changedById: actor.id,
            effectiveAt: registeredAt,
          },
        },
      },
      select: {
        id: true,
        code: true,
      },
    });

    const enrollment = await tx.enrollment.create({
      data: {
        studentId: student.id,
        programId: program.id,
        teacherId: input.teacherId ?? null,
        status: enrollmentStatusForStudentLifecycle(StudentLifecycleStatus.SLOT_WAITING),
        startDate: registeredAt,
        firstLessonAt,
        monthlyFee,
        discountType: input.discountType ?? null,
        lessonsPerMonth,
      },
      select: {
        id: true,
        monthlyFee: true,
      },
    });

    const updatedLead = await tx.lead.update({
      where: { id: lead.id },
      data: {
        stage: LeadStage.TRIAL_CONSULTATION,
        convertedStudentId: student.id,
        source: input.source ?? "Manual",
        educationLevel,
        programInterestId: program.id,
      },
      select: {
        id: true,
        stage: true,
        convertedStudentId: true,
        trialLessonCount: true,
      },
    });

    await tx.leadStageHistory.create({
      data: {
        leadId: lead.id,
        oldStage: lead.stage,
        newStage: LeadStage.TRIAL_CONSULTATION,
        reason: `Tələbəyə çevrildi: ${student.code}`,
        changedById: actor.id,
      },
    });

    await closeConvertedLeadFollowUp(tx, lead.id);

    if (!giftAdmission && input.paymentAmount && paymentDate && paymentMonth) {
      if (!input.firstLessonDate) {
        throw new PublicActionError(
          "İlkin ödəniş üçün cari paket üzrə ilk dərs tarixini seçin.",
        );
      }
      const scheduleType = storedScheduleTypeForPaymentKind(input.paymentKind);
      const contractConfirmed = input.paymentKind === AVANS_PAYMENT_KIND ? true : input.contractConfirmed;

      const payment = await tx.payment.create({
        data: {
          studentId: student.id,
          amount: input.paymentAmount,
          paidAt: paymentDate,
          paymentMonth,
          nextPaymentAt: null,
          scheduleType,
          method: input.paymentMethod as PaymentMethod,
          note: input.paymentNote ?? `CRM qeydiyyat ödənişi: ${lead.id}`,
          idempotencyKey: randomUUID(),
          createdById: actor.id,
        },
        select: { id: true },
      });
      await recordCourseSalePayment(tx, {
        studentId: student.id,
        paymentId: payment.id,
        purpose: "ADMISSION",
        contractConfirmed,
        actorId: actor.id,
        admissionLeadId: lead.id,
      });
    }

    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "lead.convert_to_student",
      entityType: "lead",
      entityId: lead.id,
      before: {
        id: lead.id,
        stage: lead.stage,
        convertedStudentId: lead.convertedStudentId,
        programInterestId: lead.programInterestId,
        educationLevel: lead.educationLevel,
        contact: {
          fullName: lead.contact.fullName,
          phoneDisplay: lead.contact.phoneDisplay,
        },
      },
      after: {
        ...updatedLead,
        studentCode: student.code,
        enrollmentId: enrollment.id,
        programId: program.id,
        educationLevel,
        contact: {
          fullName: input.fullName,
          phoneDisplay: input.phone,
        },
        admissionPayment: giftAdmission ? null : input.paymentAmount ?? null,
      },
      reason: "CRM çevirmə əməliyyatı",
    });
  });

  revalidatePath("/crm");
  revalidatePath("/students");
  revalidatePath("/dashboard");
  revalidatePath("/marketing");
  invalidateCrmCaches();
  updateTag(erpCacheTags.students);
  return { redirectTo: safeCrmRedirect(input.returnTo) };
}

async function updateLeadStageActionImpl(formData: FormData) {
  const actor = await requireMutationActor("crm.lead.update");
  const input = updateLeadStageSchema.parse(Object.fromEntries(formData));
  if (input.stage === LeadStage.REGISTERED) throw new Error("Qeydiyyat uyğun qəbul ödənişi ilə tamamlanır.");
  if (input.stage === LeadStage.LOST && !input.reason?.trim()) throw new Error("İtki səbəbi yazılmalıdır.");
  const prisma = getPrisma();

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`select id from erp.leads where id = ${input.leadId}::uuid for update`;
    const current = await tx.lead.findUnique({
      where: { id: input.leadId },
      select: {
        id: true,
        managerId: true,
        stage: true,
        convertedStudentId: true,
        nextActionType: true,
        trialLessonCount: true,
        nextFollowUpAt: true,
        programInterestId: true,
        contact: { select: { phoneNormalized: true } },
      },
    });

    assertCanEditLead(actor, current);

    assertLeadPlan({ stage: input.stage, phone: current.contact.phoneNormalized, programId: current.programInterestId, nextActionType: current.nextActionType, nextDate: current.nextFollowUpAt, reason: input.reason });
    if (!current.managerId) throw new Error("Müraciətin sahibi seçilməlidir.");
    await syncLeadWorkPlan(tx, { leadId: current.id, ownerId: current.managerId, kind: resolveTrialLessonNextAction({ stage: input.stage, currentNextAction: current.nextActionType }), plannedAt: current.nextFollowUpAt, closed: input.stage === LeadStage.LOST });

    if (current.stage === input.stage) {
      return;
    }

    const updated = await tx.lead.update({
      where: { id: input.leadId },
      data: {
        stage: input.stage,
        trialLessonCount: resolveTrialLessonCount({
          stage: input.stage,
          existingCount: current.trialLessonCount,
        }),
        nextActionType: resolveTrialLessonNextAction({
          stage: input.stage,
          currentNextAction: current.nextActionType,
        }),
      },
      select: {
        id: true,
        stage: true,
        nextActionType: true,
        trialLessonCount: true,
      },
    });

    await tx.leadStageHistory.create({
      data: {
        leadId: input.leadId,
        oldStage: current.stage,
        newStage: input.stage,
        reason: input.reason ?? "Mərhələ yeniləndi",
        changedById: actor.id,
      },
    });

    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "lead.stage.update",
      entityType: "lead",
      entityId: input.leadId,
      before: current as Prisma.InputJsonValue,
      after: updated as Prisma.InputJsonValue,
      reason: input.reason ?? null,
    });
  });

  revalidatePath("/crm");
  revalidatePath("/dashboard");
  invalidateCrmCaches();
  return { redirectTo: safeCrmRedirect(input.returnTo) };
}

async function generateStudentCode(tx: Prisma.TransactionClient) {
  const total = await tx.student.count();
  let candidateNumber = total + 1001;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = `ART-${candidateNumber.toString().padStart(4, "0")}`;
    const existing = await tx.student.findUnique({
      where: { code: candidate },
      select: { id: true },
    });

    if (!existing) {
      return candidate;
    }

    candidateNumber += 1;
  }

  return `ART-${Date.now().toString().slice(-8)}`;
}

function safeCrmRedirect(value: string | undefined) {
  return value?.startsWith("/crm") ? value : "/crm";
}

function invalidateCrmCaches() {
  updateTag(erpCacheTags.crm);
  updateTag(erpCacheTags.dashboard);
}

function parseFollowUpAt(value: string | undefined) {
  const normalized = normalizeDateValue(value);

  if (!normalized) {
    return null;
  }

  const date = new Date(`${normalized}T09:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    throw new Error("İzləmə tarixi düzgün deyil");
  }

  return date;
}

async function resolveEducationLevelName(
  tx: Prisma.TransactionClient,
  requestedName: string | undefined,
) {
  return (await resolveStudentEducationLevel(tx,requestedName))?.value ?? null;
}

function normalizeDateValue(value: string | undefined) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return trimmed;
  }

  const azMatch = trimmed.match(/^(\d{2})[./](\d{2})[./](\d{4})$/);
  if (azMatch) {
    const [, day, month, year] = azMatch;
    return `${year}-${month}-${day}`;
  }

  throw new Error("İzləmə tarixi GG.AA.İİİİ formatında olmalıdır");
}

export const findDuplicatePhoneAction = safeServerAction(
  findDuplicatePhoneActionImpl,
  "Telefon yoxlanılmadı.",
);
export const createLeadAction = safeServerAction(
  createLeadActionImpl,
  "Müraciət yaradılmadı.",
);
export const updateLeadAction = safeServerAction(
  updateLeadActionImpl,
  "Müraciət yenilənmədi.",
);
export const deleteLeadAction = safeServerAction(
  deleteLeadActionImpl,
  "Müraciət silinmədi.",
);
export const listRegistrationPackageOptions = safeServerAction(async () => {
  await requireMutationActor("crm.lead.convert");
  const today = new Date();
  const [teachers, discountTypes, programs, educationLevels] = await Promise.all([
    getPrisma().teacher.findMany({
      where: { isActive: true },
      select: { id: true, fullName: true },
      orderBy: { fullName: "asc" },
    }),
    getPrisma().dropdownCatalogOption.findMany({
      where: { catalog: "STUDENT_DISCOUNT_TYPE", isActive: true },
      select: { value: true, label: true },
      orderBy: [{ label: "asc" }, { createdAt: "asc" }],
    }),
    getPrisma().program.findMany({
      where: { isActive: true },
      select: {
        id: true,
        defaultMonthlyFee: true,
        defaultLessonsPerMonth: true,
        pricingVersions: {
          where: {
            validFrom: { lte: today },
            OR: [{ validTo: null }, { validTo: { gte: today } }],
          },
          orderBy: { validFrom: "desc" },
          take: 1,
          select: { monthlyFee: true, lessonsPerMonth: true },
        },
      },
      orderBy: { name: "asc" },
    }),
    getPrisma().dropdownCatalogOption.findMany({
      where: { catalog: "STUDENT_EDUCATION_LEVEL", isActive: true },
      select: { value: true, label: true },
      orderBy: [{ label: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  return {
    teachers,
    discountTypes,
    educationLevels,
    programs: programs.map((program) => ({
      id: program.id,
      monthlyFee: String(program.pricingVersions[0]?.monthlyFee ?? program.defaultMonthlyFee),
      lessonsPerMonth: program.pricingVersions[0]?.lessonsPerMonth?.toString()
        ?? program.defaultLessonsPerMonth?.toString()
        ?? "",
    })),
  };
}, "Paket seçimləri yüklənmədi.");

export const convertLeadToStudentAction = safeServerAction(
  convertLeadToStudentActionImpl,
  "Müraciət tələbəyə çevrilmədi.",
);
export const updateLeadStageAction = safeServerAction(
  updateLeadStageActionImpl,
  "Mərhələ yenilənmədi.",
);
