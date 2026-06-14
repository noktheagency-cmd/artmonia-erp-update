"use server";

import { revalidatePath, updateTag } from "next/cache";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  EnrollmentStatus,
  InvoiceStatus,
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
import { leadStageOptions } from "@/modules/crm/stage";
import { addMonths, startOfMonth, toNumber } from "@/modules/shared/format";
import { optionalFormString } from "@/modules/shared/form-values";
import { erpCacheTags } from "@/modules/shared/cache-tags";

const optionalText = (max: number) =>
  z.preprocess(
    optionalFormString,
    z.string().max(max).optional()
  );

const optionalUuid = z.preprocess(
  optionalFormString,
  z.string().uuid().optional()
);

const createLeadSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: optionalText(40),
  source: optionalText(60),
  programId: optionalUuid,
  managerId: optionalUuid,
  stage: z.enum(leadStageOptions).default(LeadStage.NEW),
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
  nextFollowUpDate: optionalText(20),
  note: optionalText(240),
  returnTo: optionalText(260),
});

const convertLeadSchema = z.object({
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

export async function createLeadAction(formData: FormData) {
  const actor = await requireMutationActor("crm.lead.create");
  const input = createLeadSchema.parse(Object.fromEntries(formData));
  const prisma = getPrisma();
  const managerId = resolveLeadManagerId(actor, input.managerId);
  const phoneNormalized = normalizePhone(input.phone);
  const followUpAt = parseFollowUpAt(input.nextFollowUpDate);

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
        programInterestId: input.programId ?? null,
        nextFollowUpAt: followUpAt,
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

    if (followUpAt) {
      await tx.task.create({
        data: {
          title: `İzləmə: ${input.fullName}`,
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

  revalidatePath("/crm");
  revalidatePath("/dashboard");
  invalidateCrmCaches();
  redirect("/crm");
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
      },
      select: {
        id: true,
        stage: true,
        source: true,
        managerId: true,
        programInterestId: true,
        nextFollowUpAt: true,
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
            title: `İzləmə: ${input.fullName}`,
            ownerUserId: managerId,
            dueAt: followUpAt,
          },
        });
      } else {
        await tx.task.create({
          data: {
            title: `İzləmə: ${input.fullName}`,
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
  invalidateCrmCaches();
  redirectToCrm(input.returnTo);
}

export async function convertLeadToStudentAction(formData: FormData) {
  const actor = await requireMutationActor("crm.lead.convert");
  const input = convertLeadSchema.parse(Object.fromEntries(formData));
  const prisma = getPrisma();
  const today = new Date();
  const periodMonth = startOfMonth(today);
  const dueDate = addMonths(today, 0);
  dueDate.setUTCDate(today.getUTCDate() + 7);

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
        lifecycleStatus: StudentLifecycleStatus.GROUP_WAITING,
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

    const amount = toNumber(enrollment.monthlyFee);
    await tx.invoice.create({
      data: {
        studentId: student.id,
        enrollmentId: enrollment.id,
        periodMonth,
        issueDate: today,
        dueDate,
        amount,
        balanceDue: amount,
        status: amount > 0 ? InvoiceStatus.OPEN : InvoiceStatus.PAID,
        idempotencyKey: `lead-conversion-${lead.id}-${periodMonth.toISOString().slice(0, 10)}`,
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
