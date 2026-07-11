"use server";

import { revalidatePath, updateTag } from "next/cache";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  EnrollmentStatus,
  LeadStage,
  StudentLifecycleStatus,
  TaskStatus,
} from "@/generated/prisma/client";
import type { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/server/db/prisma";
import { requireMutationActor } from "@/server/auth/actor";
import { writeAuditLog } from "@/modules/audit/audit-service";
import {
  assertCanAccessLead,
  resolveLeadManagerId,
} from "@/modules/crm/access";
import {
  findDuplicatePhoneMatches,
  normalizePhone,
} from "@/modules/crm/duplicate-phone";
import {
  formatNextActionTypeLabel,
  leadPriorityOptions,
  nextActionTypeOptions,
} from "@/modules/crm/follow-up";
import { leadStageOptions } from "@/modules/crm/stage";
import { optionalFormString } from "@/modules/shared/form-values";
import { erpCacheTags } from "@/modules/shared/cache-tags";
import { isBillingPausedStatus } from "@/modules/students/lifecycle-service";

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

const createLeadSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: optionalText(40),
  source: optionalText(60),
  programId: optionalUuid,
  managerId: optionalUuid,
  campaignId: optionalUuid,
  stage: z.enum(leadStageOptions).default(LeadStage.NEW),
  priority: z.enum(leadPriorityOptions).default("NORMAL"),
  nextActionType: optionalNextActionType,
  nextFollowUpDate: optionalText(20),
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
  programId: optionalUuid,
  managerId: optionalUuid,
  stage: z.enum(leadStageOptions),
  priority: z.enum(leadPriorityOptions).default("NORMAL"),
  nextActionType: optionalNextActionType,
  nextFollowUpDate: optionalText(20),
  note: optionalText(240),
  returnTo: optionalText(260),
});

const convertLeadSchema = z.object({
  leadId: z.string().uuid(),
  returnTo: optionalText(260),
});

const deleteLeadSchema = z.object({
  leadId: z.string().uuid(),
  returnTo: optionalText(260),
});

const duplicatePhoneSchema = z.object({
  phone: z.string().max(40),
});

export async function findDuplicatePhoneAction(phone: string) {
  await requireMutationActor("crm.lead.read");

  const input = duplicatePhoneSchema.parse({ phone });
  return findDuplicatePhoneMatches(input.phone);
}

export type CreateLeadFormState = {
  status: "idle" | "success" | "error";
  message?: string;
  leadId?: string;
};

export async function createLeadAction(formData: FormData) {
  await createLead(formData);

  revalidatePath("/crm");
  revalidatePath("/dashboard");
  revalidatePath("/marketing");
  invalidateCrmCaches();
  redirect("/crm?tab=list&leadCreated=1" as Route);
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
      message: error instanceof Error ? error.message : "Müraciət yaradılmadı.",
    };
  }
}

async function createLead(formData: FormData) {
  const actor = await requireMutationActor("crm.lead.create");
  const input = createLeadSchema.parse(Object.fromEntries(formData));
  const prisma = getPrisma();
  const managerId = resolveLeadManagerId(actor, input.managerId);
  const phoneNormalized = normalizePhone(input.phone);
  const followUpAt = parseFollowUpAt(input.nextFollowUpDate);
  let createdLeadId = "";

  await prisma.$transaction(async (tx) => {
    const existingContact = phoneNormalized
      ? await tx.contact.findUnique({ where: { phoneNormalized } })
      : null;
    const contact =
      existingContact ??
      (await tx.contact.create({
        data: {
          fullName: input.fullName,
          phoneDisplay: input.phone ?? null,
          phoneNormalized,
          source: input.source ?? "Manual",
        },
      }));

    const lead = await tx.lead.create({
      data: {
        contactId: contact.id,
        stage: input.stage,
        source: input.source ?? "Manual",
        managerId,
        campaignId: input.campaignId ?? null,
        programInterestId: input.programId ?? null,
        nextFollowUpAt: followUpAt,
        nextActionType: input.nextActionType ?? null,
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
      },
    });
    createdLeadId = lead.id;

    if (followUpAt) {
      await tx.task.create({
        data: {
          title: buildFollowUpTaskTitle(input.fullName, input.nextActionType),
          type: "lead_follow_up",
          entityType: "lead",
          entityId: lead.id,
          ownerUserId: managerId,
          status: TaskStatus.OPEN,
          dueAt: followUpAt,
          createdById: actor.id,
        },
      });
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

export async function updateLeadAction(formData: FormData) {
  const actor = await requireMutationActor("crm.lead.update");
  const input = updateLeadSchema.parse(Object.fromEntries(formData));
  const prisma = getPrisma();
  const managerId = resolveLeadManagerId(actor, input.managerId);
  const phoneNormalized = normalizePhone(input.phone);
  const followUpAt = parseFollowUpAt(input.nextFollowUpDate);

  await prisma.$transaction(async (tx) => {
    const current = await tx.lead.findUnique({
      where: { id: input.leadId },
      select: {
        id: true,
        managerId: true,
        stage: true,
        source: true,
        priority: true,
        nextActionType: true,
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

    assertCanAccessLead(actor, current, "crm.lead.update");

    if (
      phoneNormalized &&
      phoneNormalized !== current.contact.phoneNormalized
    ) {
      const conflict = await tx.contact.findUnique({
        where: { phoneNormalized },
        select: { id: true, fullName: true },
      });

      if (conflict && conflict.id !== current.contactId) {
        throw new Error(`Telefon artıq ${conflict.fullName} adına bağlıdır`);
      }
    }

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
        managerId,
        programInterestId: input.programId ?? null,
        nextFollowUpAt: followUpAt,
        nextActionType: input.nextActionType ?? null,
        priority: input.priority,
      },
      select: {
        id: true,
        stage: true,
        source: true,
        managerId: true,
        programInterestId: true,
        nextFollowUpAt: true,
        nextActionType: true,
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

    if (followUpAt) {
      const existingTask = await tx.task.findFirst({
        where: {
          entityType: "lead",
          entityId: input.leadId,
          type: "lead_follow_up",
          status: TaskStatus.OPEN,
        },
        select: { id: true },
      });

      if (existingTask) {
        await tx.task.update({
          where: { id: existingTask.id },
          data: {
            title: buildFollowUpTaskTitle(input.fullName, input.nextActionType),
            ownerUserId: managerId,
            dueAt: followUpAt,
          },
        });
      } else {
        await tx.task.create({
          data: {
            title: buildFollowUpTaskTitle(input.fullName, input.nextActionType),
            type: "lead_follow_up",
            entityType: "lead",
            entityId: input.leadId,
            ownerUserId: managerId,
            status: TaskStatus.OPEN,
            dueAt: followUpAt,
            createdById: actor.id,
          },
        });
      }
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
        priority: current.priority,
        nextActionType: current.nextActionType,
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
  redirectToCrm(input.returnTo);
}

export async function deleteLeadAction(formData: FormData) {
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
      reason: "Müraciət profili və bağlı izləmə tapşırıqları silindi",
    });
  });

  revalidatePath("/crm");
  revalidatePath("/dashboard");
  revalidatePath("/marketing");
  invalidateCrmCaches();
  redirectToCrm(input.returnTo);
}

export async function convertLeadToStudentAction(formData: FormData) {
  const actor = await requireMutationActor("crm.lead.convert");
  const input = convertLeadSchema.parse(Object.fromEntries(formData));
  const prisma = getPrisma();
  const today = new Date();

  await prisma.$transaction(async (tx) => {
    const lead = await tx.lead.findUnique({
      where: { id: input.leadId },
      select: {
        id: true,
        stage: true,
        contactId: true,
        managerId: true,
        programInterestId: true,
        convertedStudentId: true,
        campaignId: true,
        contact: {
          select: {
            fullName: true,
            students: {
              select: {
                id: true,
                code: true,
              },
              take: 1,
            },
          },
        },
        programInterest: {
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

    if (!lead.programInterest) {
      throw new Error("Qeydiyyata almadan əvvəl proqram seçin");
    }

    const monthlyFee =
      lead.programInterest.pricingVersions[0]?.monthlyFee ??
      lead.programInterest.defaultMonthlyFee;
    const lessonsPerMonth =
      lead.programInterest.pricingVersions[0]?.lessonsPerMonth ??
      lead.programInterest.defaultLessonsPerMonth;
    const studentCode = await generateStudentCode(tx);

    const student = await tx.student.create({
      data: {
        code: studentCode,
        contactId: lead.contactId,
        managerId: lead.managerId ?? actor.id,
        campaignId: lead.campaignId,
        lifecycleStatus: StudentLifecycleStatus.GROUP_WAITING,
        billingPaused: isBillingPausedStatus(StudentLifecycleStatus.GROUP_WAITING),
        registeredAt: today,
        notes: `CRM müraciətindən tələbəyə çevrildi: ${lead.id}`,
        statusHistory: {
          create: {
            newStatus: StudentLifecycleStatus.GROUP_WAITING,
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
        programId: lead.programInterest.id,
        status: EnrollmentStatus.ACTIVE,
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
        stage: LeadStage.REGISTERED,
        convertedStudentId: student.id,
      },
      select: {
        id: true,
        stage: true,
        convertedStudentId: true,
      },
    });

    await tx.leadStageHistory.create({
      data: {
        leadId: lead.id,
        oldStage: lead.stage,
        newStage: LeadStage.REGISTERED,
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
      },
      after: {
        ...updatedLead,
        studentCode: student.code,
        enrollmentId: enrollment.id,
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
  redirectToCrm(input.returnTo);
}

export async function updateLeadStageAction(formData: FormData) {
  const actor = await requireMutationActor("crm.lead.update");
  const input = updateLeadStageSchema.parse(Object.fromEntries(formData));
  const prisma = getPrisma();

  await prisma.$transaction(async (tx) => {
    const current = await tx.lead.findUnique({
      where: { id: input.leadId },
      select: {
        id: true,
        managerId: true,
        stage: true,
        convertedStudentId: true,
      },
    });

    assertCanAccessLead(actor, current, "crm.lead.update");

    if (current.stage === input.stage) {
      return;
    }

    const updated = await tx.lead.update({
      where: { id: input.leadId },
      data: { stage: input.stage },
      select: {
        id: true,
        stage: true,
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
  redirectToCrm(input.returnTo);
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

function redirectToCrm(value: string | undefined): never {
  redirect(safeCrmRedirect(value) as Route);
}

function invalidateCrmCaches() {
  updateTag(erpCacheTags.crm);
  updateTag(erpCacheTags.dashboard);
}

function buildFollowUpTaskTitle(
  fullName: string,
  nextActionType: (typeof nextActionTypeOptions)[number] | undefined
) {
  return `${formatNextActionTypeLabel(nextActionType)}: ${fullName}`;
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
