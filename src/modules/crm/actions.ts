"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { LeadStage, StudentLifecycleStatus } from "@/generated/prisma/client";
import type { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/server/db/prisma";
import { requireMutationActor } from "@/server/auth/actor";
import { writeAuditLog } from "@/modules/audit/audit-service";
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
import { erpCacheTags } from "@/modules/shared/cache-tags";
import { assertLeadPlan } from "./lead-validation";
import { syncLeadWorkPlan } from "./work-service";
import {
  enrollmentStatusForStudentLifecycle,
  isBillingPausedStatus,
} from "@/modules/students/lifecycle-service";
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

const convertLeadSchema = z.object({
  leadId: z.string().uuid(),
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(7).max(40),
  source: optionalText(60),
  educationLevel: optionalText(80),
  programId: z.string().uuid(),
  returnTo: optionalText(260),
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
        stage: input.stage,
        source: input.source ?? "Manual",
        educationLevel,
        managerId,
        campaignId: input.campaignId ?? null,
        programInterestId: input.programId ?? null,
        nextFollowUpAt: followUpAt,
        nextActionType: nextActionType ?? null,
        trialLessonCount: resolveTrialLessonCount({
          stage: input.stage,
          requestedCount: input.trialLessonCount,
        }),
        priority: input.priority,
        stageHistory: {
          create: {
            newStage: input.stage,
            reason: input.note ?? "Müraciət yaradıldı",
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
    await syncLeadWorkPlan(tx, { leadId: lead.id, ownerId: managerId, kind: nextActionType ?? null, plannedAt: followUpAt,
      closed: input.stage === LeadStage.LOST });

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
  assertLeadPlan({ stage: input.stage, phone: phoneNormalized, programId: input.programId,
    nextActionType: input.nextActionType, nextDate: followUpAt, reason: input.note });
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
    await syncLeadWorkPlan(tx, { leadId: current.id, ownerId: managerId, kind: nextActionType ?? null, plannedAt: followUpAt,
      closed: input.stage === LeadStage.REGISTERED || input.stage === LeadStage.LOST });

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
        nextFollowUpAt: followUpAt,
        nextActionType: nextActionType ?? null,
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
  const actor = await requireMutationActor("crm.lead.update");
  const input = deleteLeadSchema.parse(Object.fromEntries(formData));
  const prisma = getPrisma();

  await prisma.$transaction(async (tx) => {
    const lead = await tx.lead.findUnique({
      where: { id: input.leadId },
      select: {
        id: true,
        managerId: true,
        stage: true,
        source: true,
        contactId: true,
        contact: { select: { fullName: true, phoneDisplay: true } },
      },
    });

    assertCanAccessLead(actor, lead, "crm.lead.update");

    const facts = await tx.lead.findUniqueOrThrow({ where: { id: lead.id }, select: { _count: { select: { contactEvents: true, workItems: true, appointments: true, courseSales: true } } } });
    if (Object.values(facts._count).some((count) => count > 0)) throw new Error("Əməliyyat tarixçəsi olan müraciət silinə bilməz. Səbəbi yazaraq İtirilib seçin.");

    await tx.task.deleteMany({
      where: { entityType: "lead", entityId: lead.id },
    });
    await tx.lead.delete({ where: { id: lead.id } });

    const contactStillUsed = await tx.contact.findUnique({
      where: { id: lead.contactId },
      select: {
        _count: {
          select: {
            leads: true,
            students: true,
            teacherProfiles: true,
            studentRelationships: true,
          },
        },
      },
    });

    if (
      contactStillUsed &&
      Object.values(contactStillUsed._count).every((count) => count === 0)
    ) {
      await tx.contact.delete({ where: { id: lead.contactId } });
    }

    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "lead.delete",
      entityType: "lead",
      entityId: lead.id,
      before: {
        stage: lead.stage,
        source: lead.source,
        contact: lead.contact,
      },
      reason: input.reason,
    });
  });

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
  const phoneNormalized = normalizePhone(input.phone);

  if (!phoneNormalized) {
    throw new Error("Telefon düzgün deyil");
  }

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

    const monthlyFee =
      program.pricingVersions[0]?.monthlyFee ??
      program.defaultMonthlyFee;
    const lessonsPerMonth =
      program.pricingVersions[0]?.lessonsPerMonth ??
      program.defaultLessonsPerMonth;
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
        registeredAt: today,
        notes: `CRM müraciətindən tələbəyə çevrildi: ${lead.id}`,
        statusHistory: {
          create: {
            newStatus: StudentLifecycleStatus.SLOT_WAITING,
            reason: "CRM müraciəti tələbəyə çevrildi",
            changedById: actor.id,
            effectiveAt: today,
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
        status: enrollmentStatusForStudentLifecycle(StudentLifecycleStatus.SLOT_WAITING),
        startDate: today,
        monthlyFee,
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
  if (!requestedName) return null;

  const educationLevel = await tx.dropdownCatalogOption.findUnique({
    where: {
      catalog_value: {
        catalog: "STUDENT_EDUCATION_LEVEL",
        value: requestedName,
      },
    },
    select: { value: true, isActive: true },
  });

  if (!educationLevel || !educationLevel.isActive) {
    throw new Error("Təhsil səviyyəsi tapılmadı");
  }

  return educationLevel.value;
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
export const convertLeadToStudentAction = safeServerAction(
  convertLeadToStudentActionImpl,
  "Müraciət tələbəyə çevrilmədi.",
);
export const updateLeadStageAction = safeServerAction(
  updateLeadStageActionImpl,
  "Mərhələ yenilənmədi.",
);
