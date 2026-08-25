"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import {
  AppRole,
  EnrollmentStatus,
  InvoiceStatus,
  LeadStage,
  PaymentAllocationMode,
  Prisma,
  StudentLifecycleStatus,
} from "@/generated/prisma/client";
import type { PaymentMethod } from "@/generated/prisma/client";
import { getPrisma } from "@/server/db/prisma";
import { requireMutationActor } from "@/server/auth/actor";
import { scopeFor } from "@/server/rbac/permissions";
import { writeAuditLog } from "@/modules/audit/audit-service";
import { normalizePhone } from "@/modules/crm/duplicate-phone";
import { optionalFormString } from "@/modules/shared/form-values";
import { toNumber } from "@/modules/shared/format";
import { erpCacheTags } from "@/modules/shared/cache-tags";
import { studentPaymentMethodValues } from "@/modules/students/payment-method";
import {
  studentPaymentScheduleTypeValues,
  type StudentPaymentScheduleType,
} from "@/modules/students/payment-schedule-type";
import {
  isGiftDiscount,
  resolveInitialFirstLessonAt,
  resolveStudentMonthlyFee,
  studentFirstLessonModeValues,
} from "@/modules/students/student-create-rules";
import {
  clearStudentPaymentSchedules,
  restartStudentPaymentScheduleForActiveSlot,
} from "@/modules/students/payment-schedule-service";
import { ensureMissingStudentMonthlyInvoices } from "@/modules/students/monthly-invoice-service";
import {
  buildStudentStatusUpdateData as buildSharedStudentStatusUpdateData,
  closeCompletedStudentBilling,
  getStatusChangeReason as getSharedStatusChangeReason,
  isBillingPausedStatus as isSharedBillingPausedStatus,
  syncActivationBilling as syncSharedActivationBilling,
} from "@/modules/students/lifecycle-service";
import { PublicActionError, safeServerAction } from "@/server/actions/safe-action";
import {
  deleteStudentMobileAuthUser,
  inviteStudentMobileAccount,
} from "@/modules/students/mobile-account-service";

const optionalText = (max: number) =>
  z.preprocess(optionalFormString, z.string().max(max).optional());

const optionalUuid = (label: string) =>
  z.preprocess(
    optionalFormString,
    z.string().uuid(`${label} düzgün seçilməyib.`).optional(),
  );

const requiredUuid = (label: string) =>
  z.preprocess(
    optionalFormString,
    z
      .string({ error: `${label} seçilməlidir.` })
      .uuid(`${label} düzgün seçilməyib.`),
  );

const optionalInteger = z.preprocess((value) => {
  const normalized = optionalFormString(value);
  return normalized ? Number(normalized) : undefined;
}, z.number().int().positive().max(120).optional());

const optionalAmount = z.preprocess((value) => {
  const normalized = optionalFormString(value);
  return normalized ? parseAmountInput(normalized) : undefined;
}, z.number().positive().max(100_000).optional());

const studentLifecycleStatusValues = [
  StudentLifecycleStatus.SLOT_WAITING,
  StudentLifecycleStatus.ACTIVE,
  StudentLifecycleStatus.FROZEN,
  StudentLifecycleStatus.STOPPED,
  StudentLifecycleStatus.DECLINED,
  StudentLifecycleStatus.COMPLETED,
] as const;

const createStudentSchema = z.object({
  idempotencyKey: z.string().uuid(),
  mode: z.literal("lead").default("lead"),
  leadId: optionalUuid("Müraciət"),
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(5).max(40),
  email: z.preprocess(
    optionalFormString,
    z.string().email("E-poçt ünvanı düzgün deyil.").max(320).optional(),
  ),
  sendMobileInvite: z.preprocess(
    (value) => value === "on" || value === "true",
    z.boolean(),
  ),
  source: optionalText(60),
  educationLevel: optionalText(80),
  programId: requiredUuid("Proqram"),
  teacherId: optionalUuid("Müəllim"),
  campaignId: optionalUuid("Kampaniya"),
  discountType: optionalText(100),
  lifecycleStatus: z.enum(studentLifecycleStatusValues).default(StudentLifecycleStatus.SLOT_WAITING),
  registeredDate: z.string().trim().min(1).max(20),
  firstLessonMode: z.enum(studentFirstLessonModeValues).default("AUTO"),
  firstLessonDate: optionalText(20),
  monthlyFee: z.preprocess(parseAmountInput, z.number().nonnegative().max(100_000)),
  lessonsPerMonth: optionalInteger,
  notes: optionalText(500),
  acceptPayment: z.preprocess(
    (value) => value === "on" || value === "true",
    z.boolean()
  ),
  paymentAmount: optionalAmount,
  paymentDate: optionalText(20),
  paymentMethod: z.enum(studentPaymentMethodValues).default("CASH"),
  paymentScheduleType: z.enum(studentPaymentScheduleTypeValues).default("MONTHLY"),
  paymentNote: optionalText(240),
  returnTo: optionalText(260),
}).superRefine((value, context) => {
  if (!isGiftDiscount(value.discountType) && value.monthlyFee <= 0) {
    context.addIssue({
      code: "custom",
      path: ["monthlyFee"],
      message: "Aylıq məbləğ sıfırdan böyük olmalıdır.",
    });
  }
  if (value.firstLessonMode === "MANUAL" && !value.firstLessonDate) {
    context.addIssue({
      code: "custom",
      path: ["firstLessonDate"],
      message: "Manual rejimdə ilk dərs tarixi seçilməlidir.",
    });
  }
});

const recordPaymentSchema = z.object({
  idempotencyKey: z.string().uuid(),
  studentId: z.string().uuid(),
  amount: z.preprocess(parseAmountInput, z.number().positive().max(100_000)),
  paidDate: z.string().trim().min(1).max(20),
  method: z.enum(studentPaymentMethodValues).default("CASH"),
  scheduleType: z.enum(studentPaymentScheduleTypeValues).default("MONTHLY"),
  note: optionalText(240),
  returnTo: optionalText(260),
});

const updateStudentStatusSchema = z.object({
  studentId: z.string().uuid(),
  lifecycleStatus: z.enum(studentLifecycleStatusValues),
  firstLessonDate: optionalText(20),
  note: optionalText(240),
  returnTo: optionalText(260),
});

const deleteStudentSchema = z.object({
  studentId: z.string().uuid(),
});

const updateStudentProfileSchema = z.object({
  studentId: z.string().uuid(),
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(6).max(40),
  email: z.preprocess(
    optionalFormString,
    z.string().email("E-poçt ünvanı düzgün deyil.").max(320).optional(),
  ),
  source: optionalText(60),
  educationLevel: optionalText(80),
  managerId: optionalUuid("Məsul şəxs"),
  campaignId: optionalUuid("Kampaniya"),
  programId: requiredUuid("Proqram"),
  teacherId: optionalUuid("Müəllim"),
  lifecycleStatus: z.enum(studentLifecycleStatusValues),
  registeredDate: z.string().trim().min(1).max(20),
  firstLessonDate: optionalText(20),
  discountType: optionalText(100),
  monthlyFee: z.preprocess(parseAmountInput, z.number().nonnegative().max(100_000)),
  lessonsPerMonth: optionalInteger,
  statusEffectiveDate: optionalText(20),
  statusNote: optionalText(240),
  notes: optionalText(500),
}).superRefine((value, context) => {
  if (!isGiftDiscount(value.discountType) && value.monthlyFee <= 0) {
    context.addIssue({
      code: "custom",
      path: ["monthlyFee"],
      message: "Aylıq məbləğ sıfırdan böyük olmalıdır.",
    });
  }
});

const createStudentEnrollmentSchema = z.object({
  studentId: z.string().uuid(),
  programId: requiredUuid("Proqram"),
  teacherId: optionalUuid("Müəllim"),
  firstLessonDate: z.string().trim().min(1).max(20),
  discountType: optionalText(100),
  monthlyFee: z.preprocess(parseAmountInput, z.number().nonnegative().max(100_000)),
  lessonsPerMonth: optionalInteger,
}).superRefine((value, context) => {
  if (!isGiftDiscount(value.discountType) && value.monthlyFee <= 0) {
    context.addIssue({
      code: "custom",
      path: ["monthlyFee"],
      message: "Aylıq məbləğ sıfırdan böyük olmalıdır.",
    });
  }
});

async function createStudentActionImpl(formData: FormData) {
  const actor = await requireMutationActor("student.create");
  const input = createStudentSchema.parse(Object.fromEntries(formData));
  const initialLifecycleStatus = StudentLifecycleStatus.SLOT_WAITING;
  input.lifecycleStatus = initialLifecycleStatus;

  if (input.leadId && !actor.permissions.has("crm.lead.convert")) {
    throw new Error("Müraciəti tələbəyə çevirmək icazəsi yoxdur");
  }

  if (input.acceptPayment && !actor.permissions.has("billing.payment.create")) {
    throw new Error("Ödəniş qəbul etmək icazəsi yoxdur");
  }

  if (input.acceptPayment && !input.paymentAmount) {
    throw new Error("Ödənişi qəbul etmək üçün məbləğ yazın");
  }

  if (isGiftDiscount(input.discountType) && input.acceptPayment) {
    throw new PublicActionError("Hədiyyə güzəşti seçilən tələbə üçün ilkin ödəniş qəbul edilə bilməz.");
  }

  const phoneNormalized = normalizePhone(input.phone);

  if (!phoneNormalized) {
    throw new Error("Telefon düzgün deyil");
  }

  const registeredAt = parseDateInput(input.registeredDate, "Qeydiyyat tarixi");
  const requestedFirstLessonAt = input.firstLessonMode === "MANUAL" && input.firstLessonDate
    ? parseDateInput(input.firstLessonDate, "İlk dərs tarixi")
    : null;
  const firstLessonAt = resolveInitialFirstLessonAt({
    lifecycleStatus: input.lifecycleStatus,
    registeredAt,
    mode: input.firstLessonMode,
    requestedFirstLessonAt,
  });
  const enrollmentStartDate = firstLessonAt ?? registeredAt;
  const billingStartAt: Date | null = null;
  const paymentDate = input.acceptPayment
    ? parseDateInput(input.paymentDate ?? "", "Ödəniş tarixi")
    : null;
  const paymentMonth = paymentDate ? startOfMonth(paymentDate) : null;
  const prisma = getPrisma();

  const existingStudent = await prisma.student.findUnique({
    where: { creationIdempotencyKey: input.idempotencyKey },
    select: { id: true },
  });
  let studentId = existingStudent?.id ?? null;

  if (!existingStudent) try {
    studentId = await prisma.$transaction(async (tx) => {
      const [program, discountType] = await Promise.all([
        tx.program.findUnique({
          where: { id: input.programId },
          select: { id: true },
        }),
        input.discountType
          ? tx.dropdownCatalogOption.findUnique({
              where: {
                catalog_value: {
                  catalog: "STUDENT_DISCOUNT_TYPE",
                  value: input.discountType,
                },
              },
              select: { value: true, isActive: true },
            })
          : Promise.resolve(null),
      ]);

      if (!program) {
        throw new Error("Proqram tapılmadı");
      }

      if (input.discountType && (!discountType || !discountType.isActive)) {
        throw new PublicActionError("Seçilmiş güzəşt növü artıq aktiv deyil. Siyahını yeniləyib yenidən seçin.");
      }

      const effectiveMonthlyFee = resolveStudentMonthlyFee(discountType?.value, input.monthlyFee);

    const educationLevel = input.educationLevel
      ? await tx.dropdownCatalogOption.findUnique({
          where: {
            catalog_value: {
              catalog: "STUDENT_EDUCATION_LEVEL",
              value: input.educationLevel,
            },
          },
          select: { value: true, isActive: true },
        })
      : null;

    if (input.educationLevel && (!educationLevel || !educationLevel.isActive)) {
      throw new Error("Təhsil səviyyəsi tapılmadı");
    }

    const lead = await resolveLeadForStudentCreation(tx, input.leadId);
    const contactId = lead
      ? await updateLeadContact(tx, {
          leadId: lead.id,
          contactId: lead.contactId,
          fullName: input.fullName,
          phone: input.phone,
          phoneNormalized,
          email: input.email ?? null,
          source: input.source ?? "Manual",
        })
      : await createStudentContact(tx, {
          fullName: input.fullName,
          phone: input.phone,
          phoneNormalized,
          email: input.email ?? null,
          source: input.source ?? "Manual",
        });
    const studentCode = await generateStudentCode(tx);
    const managerId = actor.id;

    const campaignId = input.campaignId ?? lead?.campaignId ?? null;
    if (campaignId) {
      const campaign = await tx.marketingCampaign.findUnique({ where: { id: campaignId }, select: { id: true } });
      if (!campaign) throw new Error("Kampaniya tapılmadı");
    }
    const student = await tx.student.create({
      data: {
        code: studentCode,
        creationIdempotencyKey: input.idempotencyKey,
        contactId,
        managerId,
        campaignId,
        lifecycleStatus: input.lifecycleStatus,
        educationLevel: educationLevel?.value ?? null,
        registeredAt,
        originalFirstLessonAt: firstLessonAt,
        billingPaused: isSharedBillingPausedStatus(input.lifecycleStatus),
        billingAnchorDate: firstLessonAt,
        notes: input.notes ?? null,
        statusHistory: {
          create: {
            newStatus: input.lifecycleStatus,
            reason: input.leadId
              ? "Müraciətdən tələbə yaradıldı"
              : "Tələbə birbaşa yaradıldı",
            note: input.notes ?? null,
            effectiveAt: firstLessonAt ?? registeredAt,
            changedById: actor.id,
          },
        },
      },
      select: { id: true, code: true },
    });

    const enrollment = await tx.enrollment.create({
      data: {
        studentId: student.id,
        programId: input.programId,
        teacherId: input.teacherId ?? null,
        status: EnrollmentStatus.ACTIVE,
        startDate: enrollmentStartDate,
        firstLessonAt,
        monthlyFee: effectiveMonthlyFee,
        discountType: discountType?.value ?? null,
        lessonsPerMonth: input.lessonsPerMonth ?? null,
      },
      select: { id: true },
    });

    const invoice = billingStartAt
      ? await tx.invoice.create({
          data: {
            studentId: student.id,
            enrollmentId: enrollment.id,
            periodMonth: startOfMonth(billingStartAt),
            issueDate: registeredAt,
            dueDate: billingStartAt,
            amount: effectiveMonthlyFee,
            balanceDue: effectiveMonthlyFee,
            status: resolveInvoiceStatus({
              amount: effectiveMonthlyFee,
              balanceDue: effectiveMonthlyFee,
              dueDate: billingStartAt,
            }),
            idempotencyKey: `student-create-${student.code}-${startOfMonth(billingStartAt).toISOString().slice(0, 10)}`,
          },
          select: { id: true },
        })
      : null;

    let paymentResult: Awaited<ReturnType<typeof createPaymentAndAllocate>> | null = null;

    if (input.acceptPayment && input.paymentAmount && paymentDate && paymentMonth) {
      paymentResult = await createPaymentAndAllocate(tx, {
        studentId: student.id,
        amount: input.paymentAmount,
        paidAt: paymentDate,
        paymentMonth,
        scheduleType: input.paymentScheduleType,
        method: input.paymentMethod,
        note: input.paymentNote ?? input.notes ?? null,
        actorId: actor.id,
        idempotencyKey: input.idempotencyKey,
      });
    }

    if (lead) {
      await tx.lead.update({
        where: { id: lead.id },
        data: {
          stage: LeadStage.REGISTERED,
          contactId,
          convertedStudentId: student.id,
          programInterestId: input.programId,
          managerId,
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
    }

    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "student.create",
      entityType: "student",
      entityId: student.id,
      after: {
        studentCode: student.code,
        mode: input.mode,
        leadId: lead?.id ?? null,
        campaignId,
        discountType: discountType?.value ?? null,
        firstLessonMode: input.firstLessonMode,
        firstLessonAt: firstLessonAt?.toISOString() ?? null,
        enrollmentId: enrollment.id,
        invoiceId: invoice?.id ?? null,
        paymentId: paymentResult?.payment.id ?? null,
      } satisfies Prisma.InputJsonValue,
      reason: input.notes ?? null,
    });

    if (paymentResult) {
      await writeAuditLog(tx, {
        actorUserId: actor.id,
        action: "student.payment.record",
        entityType: "student",
        entityId: student.id,
        after: toPaymentAuditJson(paymentResult),
        reason: input.paymentNote ?? `${student.code} üçün ilkin ödəniş qəbul edildi`,
      });
    }
    return student.id;
    });
  } catch (error) {
    const recoveredStudent = await prisma.student.findUnique({
      where: { creationIdempotencyKey: input.idempotencyKey },
      select: { id: true },
    });
    if (!recoveredStudent) throw error;
    studentId = recoveredStudent.id;
  }

  let mobileInviteSent = false;
  let mobileInviteFailed = false;
  if (input.sendMobileInvite && studentId) {
    try {
      await inviteStudentMobileAccount({ studentId, actorId: actor.id });
      mobileInviteSent = true;
    } catch (error) {
      mobileInviteFailed = true;
      console.error("Student created but mobile invitation failed", {
        studentId,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  revalidatePath("/students");
  revalidatePath("/crm");
  revalidatePath("/dashboard");
  revalidatePath("/finance");
  revalidatePath("/marketing");
  invalidateStudentCaches();
  return {
    redirectTo: safeStudentsRedirect(input.returnTo),
    mobileInviteSent,
    mobileInviteFailed,
  };
}

async function recordStudentPaymentActionImpl(formData: FormData) {
  const actor = await requireMutationActor("billing.payment.create");
  const input = recordPaymentSchema.parse(Object.fromEntries(formData));
  const paidAt = parseDateInput(input.paidDate, "Ödəniş tarixi");
  const paymentMonth = startOfMonth(paidAt);
  const prisma = getPrisma();

  await prisma.$transaction(async (tx) => {
    const paymentResult = await createPaymentAndAllocate(tx, {
      studentId: input.studentId,
      amount: input.amount,
      paidAt,
      paymentMonth,
      scheduleType: input.scheduleType,
      method: input.method,
      note: input.note ?? null,
      actorId: actor.id,
      idempotencyKey: input.idempotencyKey,
    });

    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "student.payment.record",
      entityType: "student",
      entityId: input.studentId,
      after: toPaymentAuditJson(paymentResult),
      reason: input.note ?? `${paymentResult.studentCode} üçün ödəniş qeyd edildi`,
    });
  });

  revalidatePath("/students");
  revalidatePath("/dashboard");
  revalidatePath("/finance");
  revalidatePath("/marketing");
  invalidatePaymentCaches();
  return { redirectTo: safeStudentsRedirect(input.returnTo) };
}

async function updateStudentStatusActionImpl(formData: FormData) {
  const actor = await requireMutationActor("student.status.change");
  const input = updateStudentStatusSchema.parse(Object.fromEntries(formData));
  const effectiveAt = input.firstLessonDate
    ? parseDateInput(input.firstLessonDate, "İlk dərs tarixi")
    : startOfToday();
  const prisma = getPrisma();

  await prisma.$transaction(async (tx) => {
    const current = await tx.student.findUnique({
      where: { id: input.studentId },
      select: {
        id: true,
        code: true,
        lifecycleStatus: true,
        billingPaused: true,
      },
    });

    if (!current) {
      throw new Error("Tələbə tapılmadı");
    }

    const statusReason = getSharedStatusChangeReason(
      input.lifecycleStatus,
      current.lifecycleStatus,
    );
    const updateData = buildSharedStudentStatusUpdateData(input.lifecycleStatus, effectiveAt);

    await tx.student.update({
      where: { id: current.id },
      data: updateData,
    });

    await tx.studentStatusHistory.create({
      data: {
        studentId: current.id,
        oldStatus: current.lifecycleStatus,
        newStatus: input.lifecycleStatus,
        reason: statusReason,
        note: input.note ?? null,
        effectiveAt,
        changedById: actor.id,
      },
    });

    let completionResult: Awaited<ReturnType<typeof closeCompletedStudentBilling>> | null = null;
    let activationResult: Awaited<ReturnType<typeof syncSharedActivationBilling>> | null = null;

    if (input.lifecycleStatus === StudentLifecycleStatus.ACTIVE) {
      activationResult = await syncSharedActivationBilling(tx, {
        studentId: current.id,
        studentCode: current.code,
        effectiveAt,
        isReactivation:
          current.lifecycleStatus === StudentLifecycleStatus.FROZEN
          || current.lifecycleStatus === StudentLifecycleStatus.STOPPED,
      });
      await restartStudentPaymentScheduleForActiveSlot(tx, {
        studentId: current.id,
      });
    } else if (isSharedBillingPausedStatus(input.lifecycleStatus)) {
      await clearStudentPaymentSchedules(tx, [current.id]);
      if (input.lifecycleStatus === StudentLifecycleStatus.COMPLETED) {
        completionResult = await closeCompletedStudentBilling(tx, current.id, effectiveAt);
      }
    }

    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "student.status.change",
      entityType: "student",
      entityId: current.id,
      before: {
        lifecycleStatus: current.lifecycleStatus,
        billingPaused: current.billingPaused,
        ...(activationResult
          ? {
              currentFirstLessonAt:
                activationResult.previousFirstLessonAt?.toISOString() ?? null,
            }
          : {}),
      },
      after: {
        lifecycleStatus: input.lifecycleStatus,
        billingPaused: isSharedBillingPausedStatus(input.lifecycleStatus),
        effectiveAt: effectiveAt.toISOString(),
        ...(activationResult
          ? {
              enrollmentId: activationResult.enrollmentId,
              originalFirstLessonAt: activationResult.originalFirstLessonAt.toISOString(),
              currentFirstLessonAt: activationResult.currentFirstLessonAt.toISOString(),
              reactivated: activationResult.reactivated,
            }
          : {}),
        ...(completionResult ?? {}),
      },
      reason: input.note ?? statusReason,
    });
  });

  revalidatePath("/students");
  revalidatePath(`/students/${input.studentId}`);
  revalidatePath("/dashboard");
  revalidatePath("/finance");
  invalidateStudentCaches();
  return { redirectTo: safeStudentsRedirect(input.returnTo) };
}

async function updateStudentProfileActionImpl(formData: FormData) {
  const actor = await requireMutationActor("student.update");
  const input = updateStudentProfileSchema.parse(Object.fromEntries(formData));
  const phoneNormalized = normalizePhone(input.phone);
  if (!phoneNormalized) {
    throw new Error("Telefon düzgün deyil");
  }

  const registeredAt = parseDateInput(input.registeredDate, "Qeydiyyat tarixi");
  const firstLessonAt = input.firstLessonDate
    ? parseDateInput(input.firstLessonDate, "İlk dərs tarixi")
    : null;
  const statusEffectiveAt = input.statusEffectiveDate
    ? parseDateInput(input.statusEffectiveDate, "Status tarixi")
    : startOfToday();

  const prisma = getPrisma();
  await prisma.$transaction(async (tx) => {
    const current = await tx.student.findUnique({
      where: { id: input.studentId },
      include: {
        contact: {
          select: {
            id: true,
            fullName: true,
            phoneDisplay: true,
            phoneNormalized: true,
            email: true,
            source: true,
          },
        },
        enrollments: {
          where: {
            status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.PAUSED] },
          },
          orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
          take: 1,
          select: {
            id: true,
            programId: true,
            teacherId: true,
            firstLessonAt: true,
            monthlyFee: true,
            discountType: true,
            lessonsPerMonth: true,
          },
        },
      },
    });
    if (!current) {
      throw new Error("Tələbə tapılmadı");
    }

    const statusReason = getSharedStatusChangeReason(
      input.lifecycleStatus,
      current.lifecycleStatus,
    );

    const canManageAllStudents = scopeFor(actor.permissions, "student.update") === "ALL";
    if (!canManageAllStudents && current.managerId !== actor.id) {
      throw new PublicActionError("Bu tələbəni redaktə etmək icazəniz yoxdur.");
    }

    const currentEnrollment = current.enrollments[0];
    if (!currentEnrollment) {
      throw new PublicActionError("Tələbənin aktiv tədris qeydiyyatı tapılmadı.");
    }
    const firstLessonChanged =
      currentEnrollment.firstLessonAt?.getTime() !== firstLessonAt?.getTime();

    const statusChanged = current.lifecycleStatus !== input.lifecycleStatus;
    if (statusChanged && !actor.permissions.has("student.status.change")) {
      throw new PublicActionError("Tələbə statusunu dəyişmək icazəniz yoxdur.");
    }
    if (
      statusChanged
      && scopeFor(actor.permissions, "student.status.change") !== "ALL"
      && current.managerId !== actor.id
    ) {
      throw new PublicActionError("Bu tələbənin statusunu dəyişmək icazəniz yoxdur.");
    }

    const managerId = canManageAllStudents
      ? input.managerId ?? null
      : current.managerId;

    const [program, teacher, manager, campaign, educationLevel, discountType] = await Promise.all([
      tx.program.findUnique({
        where: { id: input.programId },
        select: { id: true },
      }),
      input.teacherId
        ? tx.teacher.findUnique({ where: { id: input.teacherId }, select: { id: true } })
        : Promise.resolve(null),
      managerId
        ? tx.user.findFirst({
            where: managerId === current.managerId
              ? { id: managerId }
              : {
                  id: managerId,
                  isActive: true,
                  roles: {
                    some: {
                      role: { code: { in: [AppRole.OWNER, AppRole.ADMIN, AppRole.SALES] } },
                    },
                  },
                },
            select: { id: true },
          })
        : Promise.resolve(null),
      input.campaignId
        ? tx.marketingCampaign.findUnique({ where: { id: input.campaignId }, select: { id: true } })
        : Promise.resolve(null),
      input.educationLevel
        ? tx.dropdownCatalogOption.findUnique({
            where: {
              catalog_value: {
                catalog: "STUDENT_EDUCATION_LEVEL",
                value: input.educationLevel,
              },
            },
            select: { value: true, isActive: true },
          })
        : Promise.resolve(null),
      input.discountType
        ? tx.dropdownCatalogOption.findUnique({
            where: {
              catalog_value: {
                catalog: "STUDENT_DISCOUNT_TYPE",
                value: input.discountType,
              },
            },
            select: { value: true, isActive: true },
          })
        : Promise.resolve(null),
    ]);

    if (!program) throw new PublicActionError("Proqram tapılmadı.");
    if (input.teacherId && !teacher) throw new PublicActionError("Müəllim tapılmadı.");
    if (managerId && !manager) throw new PublicActionError("Məsul şəxs tapılmadı.");
    if (input.campaignId && !campaign) throw new PublicActionError("Kampaniya tapılmadı.");
    if (
      input.educationLevel
      && (!educationLevel || (!educationLevel.isActive && input.educationLevel !== current.educationLevel))
    ) {
      throw new PublicActionError("Təhsil səviyyəsi tapılmadı və ya artıq aktiv deyil.");
    }
    if (
      input.discountType
      && (!discountType || (!discountType.isActive && input.discountType !== currentEnrollment.discountType))
    ) {
      throw new PublicActionError("Güzəşt növü tapılmadı və ya artıq aktiv deyil.");
    }

    const effectiveMonthlyFee = resolveStudentMonthlyFee(discountType?.value, input.monthlyFee);

    await tx.contact.update({
      where: { id: current.contact.id },
      data: {
        fullName: input.fullName,
        phoneDisplay: input.phone,
        phoneNormalized,
        email: input.email ?? null,
        source: input.source ?? null,
      },
    });
    await tx.student.update({
      where: { id: current.id },
      data: {
        managerId,
        campaignId: input.campaignId ?? null,
        educationLevel: educationLevel?.value ?? null,
        registeredAt,
        originalFirstLessonAt:
          current.originalFirstLessonAt
          ?? currentEnrollment.firstLessonAt
          ?? firstLessonAt,
        notes: input.notes ?? null,
      },
    });

    await tx.enrollment.update({
      where: { id: currentEnrollment.id },
      data: {
        programId: input.programId,
        teacherId: input.teacherId ?? null,
        firstLessonAt,
        monthlyFee: effectiveMonthlyFee,
        discountType: discountType?.value ?? null,
        lessonsPerMonth: input.lessonsPerMonth ?? null,
      },
    });

    if (currentEnrollment.teacherId !== (input.teacherId ?? null)) {
      await tx.teacherAssignmentHistory.create({
        data: {
          enrollmentId: currentEnrollment.id,
          oldTeacherId: currentEnrollment.teacherId,
          newTeacherId: input.teacherId ?? null,
          reason: "Tələbə profilindən müəllim təyinatı yeniləndi",
          changedById: actor.id,
        },
      });
    }

    if (statusChanged) {
      await tx.student.update({
        where: { id: current.id },
        data: buildSharedStudentStatusUpdateData(input.lifecycleStatus, statusEffectiveAt),
      });

      await tx.studentStatusHistory.create({
        data: {
          studentId: current.id,
          oldStatus: current.lifecycleStatus,
          newStatus: input.lifecycleStatus,
          reason: statusReason,
          note: input.statusNote ?? null,
          effectiveAt: statusEffectiveAt,
          changedById: actor.id,
        },
      });

      let completionResult: Awaited<ReturnType<typeof closeCompletedStudentBilling>> | null = null;
      let activationResult: Awaited<ReturnType<typeof syncSharedActivationBilling>> | null = null;

      if (input.lifecycleStatus === StudentLifecycleStatus.ACTIVE) {
        activationResult = await syncSharedActivationBilling(tx, {
          studentId: current.id,
          studentCode: current.code,
          effectiveAt: statusEffectiveAt,
          isReactivation:
            current.lifecycleStatus === StudentLifecycleStatus.FROZEN
            || current.lifecycleStatus === StudentLifecycleStatus.STOPPED,
        });
        await restartStudentPaymentScheduleForActiveSlot(tx, {
          studentId: current.id,
        });
      } else if (isSharedBillingPausedStatus(input.lifecycleStatus)) {
        await clearStudentPaymentSchedules(tx, [current.id]);
        if (input.lifecycleStatus === StudentLifecycleStatus.COMPLETED) {
          completionResult = await closeCompletedStudentBilling(tx, current.id, statusEffectiveAt);
        }
      }

      await writeAuditLog(tx, {
        actorUserId: actor.id,
        action: "student.status.change",
        entityType: "student",
        entityId: current.id,
        before: {
          lifecycleStatus: current.lifecycleStatus,
          billingPaused: current.billingPaused,
          originalFirstLessonAt: (
            current.originalFirstLessonAt
            ?? currentEnrollment.firstLessonAt
            ?? firstLessonAt
          )?.toISOString() ?? null,
          currentFirstLessonAt: currentEnrollment.firstLessonAt?.toISOString() ?? null,
        },
        after: {
          lifecycleStatus: input.lifecycleStatus,
          billingPaused: isSharedBillingPausedStatus(input.lifecycleStatus),
          effectiveAt: statusEffectiveAt.toISOString(),
          ...(activationResult
            ? {
                enrollmentId: activationResult.enrollmentId,
                originalFirstLessonAt: activationResult.originalFirstLessonAt.toISOString(),
                currentFirstLessonAt: activationResult.currentFirstLessonAt.toISOString(),
                reactivated: activationResult.reactivated,
              }
            : {}),
          ...(completionResult ?? {}),
        },
        reason: input.statusNote ?? statusReason,
      });
    }

    if (
      !statusChanged
      && firstLessonChanged
      && !isSharedBillingPausedStatus(input.lifecycleStatus)
    ) {
      await restartStudentPaymentScheduleForActiveSlot(tx, {
        studentId: current.id,
      });
    }

    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "student.profile.update",
      entityType: "student",
      entityId: current.id,
      before: {
        fullName: current.contact.fullName,
        phone: current.contact.phoneDisplay,
        email: current.contact.email,
        source: current.contact.source,
        educationLevel: current.educationLevel,
        managerId: current.managerId,
        campaignId: current.campaignId,
        registeredAt: current.registeredAt.toISOString(),
        enrollmentId: currentEnrollment.id,
        programId: currentEnrollment.programId,
        teacherId: currentEnrollment.teacherId,
        firstLessonAt: currentEnrollment.firstLessonAt?.toISOString() ?? null,
        originalFirstLessonAt: current.originalFirstLessonAt?.toISOString() ?? null,
        monthlyFee: toNumber(currentEnrollment.monthlyFee),
        discountType: currentEnrollment.discountType,
        lessonsPerMonth: currentEnrollment.lessonsPerMonth,
        notes: current.notes,
      } satisfies Prisma.InputJsonValue,
      after: {
        fullName: input.fullName,
        phone: input.phone,
        email: input.email ?? null,
        source: input.source ?? null,
        educationLevel: educationLevel?.value ?? null,
        managerId,
        campaignId: input.campaignId ?? null,
        registeredAt: registeredAt.toISOString(),
        enrollmentId: currentEnrollment.id,
        programId: input.programId,
        teacherId: input.teacherId ?? null,
        firstLessonAt: firstLessonAt?.toISOString() ?? null,
        originalFirstLessonAt: (
          current.originalFirstLessonAt
          ?? currentEnrollment.firstLessonAt
          ?? firstLessonAt
        )?.toISOString() ?? null,
        monthlyFee: effectiveMonthlyFee,
        discountType: discountType?.value ?? null,
        lessonsPerMonth: input.lessonsPerMonth ?? null,
        notes: input.notes ?? null,
      } satisfies Prisma.InputJsonValue,
      reason: "Tələbənin profil və tədris məlumatları yeniləndi",
    });
  });

  revalidatePath(`/students/${input.studentId}`);
  revalidatePath("/students");
  revalidatePath("/dashboard");
  revalidatePath("/finance");
  revalidatePath("/marketing");
  invalidateStudentCaches();
}

async function createStudentEnrollmentActionImpl(formData: FormData) {
  const actor = await requireMutationActor("student.update");
  const input = createStudentEnrollmentSchema.parse(Object.fromEntries(formData));
  const firstLessonAt = parseDateInput(input.firstLessonDate, "İlk dərs tarixi");
  const prisma = getPrisma();

  await prisma.$transaction(async (tx) => {
    const student = await tx.student.findUnique({
      where: { id: input.studentId },
      select: {
        id: true,
        code: true,
        managerId: true,
        lifecycleStatus: true,
        billingPaused: true,
        billingAnchorDate: true,
        originalFirstLessonAt: true,
      },
    });
    if (!student) throw new PublicActionError("Tələbə tapılmadı.");
    if (
      scopeFor(actor.permissions, "student.update") !== "ALL"
      && student.managerId !== actor.id
    ) {
      throw new PublicActionError("Bu tələbəyə paket əlavə etmək icazəniz yoxdur.");
    }
    if (
      student.lifecycleStatus === StudentLifecycleStatus.COMPLETED
      || student.lifecycleStatus === StudentLifecycleStatus.DECLINED
    ) {
      throw new PublicActionError("Tamamlanmış və ya imtina etmiş tələbəyə aktiv paket əlavə edilə bilməz.");
    }

    const [program, teacher, discountType, existingEnrollment] = await Promise.all([
      tx.program.findUnique({ where: { id: input.programId }, select: { id: true, name: true } }),
      input.teacherId
        ? tx.teacher.findUnique({ where: { id: input.teacherId }, select: { id: true } })
        : Promise.resolve(null),
      input.discountType
        ? tx.dropdownCatalogOption.findUnique({
            where: {
              catalog_value: {
                catalog: "STUDENT_DISCOUNT_TYPE",
                value: input.discountType,
              },
            },
            select: { value: true, isActive: true },
          })
        : Promise.resolve(null),
      tx.enrollment.findFirst({
        where: {
          studentId: student.id,
          programId: input.programId,
          status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.PAUSED] },
        },
        select: { id: true },
      }),
    ]);

    if (!program) throw new PublicActionError("Proqram tapılmadı.");
    if (input.teacherId && !teacher) throw new PublicActionError("Müəllim tapılmadı.");
    if (input.discountType && (!discountType || !discountType.isActive)) {
      throw new PublicActionError("Güzəşt növü tapılmadı və ya aktiv deyil.");
    }
    if (existingEnrollment) {
      throw new PublicActionError("Bu proqram tələbənin aktiv paketləri arasında artıq mövcuddur.");
    }

    const monthlyFee = resolveStudentMonthlyFee(discountType?.value, input.monthlyFee);
    const enrollment = await tx.enrollment.create({
      data: {
        studentId: student.id,
        programId: program.id,
        teacherId: input.teacherId ?? null,
        status: student.billingPaused ? EnrollmentStatus.PAUSED : EnrollmentStatus.ACTIVE,
        startDate: firstLessonAt,
        firstLessonAt,
        monthlyFee,
        discountType: discountType?.value ?? null,
        lessonsPerMonth: input.lessonsPerMonth ?? null,
      },
    });

    if (!student.billingAnchorDate || !student.originalFirstLessonAt) {
      await tx.student.update({
        where: { id: student.id },
        data: {
          ...(!student.billingAnchorDate ? { billingAnchorDate: firstLessonAt } : {}),
          ...(!student.originalFirstLessonAt ? { originalFirstLessonAt: firstLessonAt } : {}),
        },
      });
    }

    if (student.lifecycleStatus === StudentLifecycleStatus.ACTIVE && !student.billingPaused) {
      await ensureMissingStudentMonthlyInvoices(tx, {
        studentId: student.id,
        throughDate: startOfToday(),
      });
    }

    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "student.enrollment.create",
      entityType: "student",
      entityId: student.id,
      after: {
        enrollmentId: enrollment.id,
        programId: program.id,
        programName: program.name,
        teacherId: input.teacherId ?? null,
        firstLessonAt: firstLessonAt.toISOString(),
        originalFirstLessonAt: (student.originalFirstLessonAt ?? firstLessonAt).toISOString(),
        billingAnchorDate: (student.billingAnchorDate ?? firstLessonAt).toISOString(),
        monthlyFee,
        discountType: discountType?.value ?? null,
        lessonsPerMonth: input.lessonsPerMonth ?? null,
      } satisfies Prisma.InputJsonValue,
      reason: `${student.code} üçün əlavə tədris paketi yaradıldı`,
    });
  });

  revalidatePath(`/students/${input.studentId}`);
  revalidatePath("/students");
  revalidatePath("/dashboard");
  revalidatePath("/finance");
  invalidateStudentCaches();
  return { redirectTo: `/students/${input.studentId}` };
}

async function deleteStudentActionImpl(formData: FormData) {
  const actor = await requireMutationActor("student.delete");
  const input = deleteStudentSchema.parse(Object.fromEntries(formData));
  const prisma = getPrisma();
  let mobileAuthUserId: string | null = null;

  await prisma.$transaction(async (tx) => {
    const student = await tx.student.findUnique({
      where: { id: input.studentId },
      select: {
        id: true,
        code: true,
        contactId: true,
        mobileAccount: { select: { authUserId: true } },
      },
    });

    if (!student) {
      throw new Error("Tələbə tapılmadı");
    }
    mobileAuthUserId = student.mobileAccount?.authUserId ?? null;

    const enrollmentIds = (
      await tx.enrollment.findMany({
        where: { studentId: student.id },
        select: { id: true },
      })
    ).map((item) => item.id);
    const paymentIds = (
      await tx.payment.findMany({
        where: { studentId: student.id },
        select: { id: true },
      })
    ).map((item) => item.id);
    const participantIds = (
      await tx.workshopParticipant.findMany({
        where: { studentId: student.id },
        select: { id: true },
      })
    ).map((item) => item.id);

    if (participantIds.length > 0) {
      await tx.workshopPayment.deleteMany({
        where: { participantId: { in: participantIds } },
      });
      await tx.workshopParticipant.deleteMany({
        where: { id: { in: participantIds } },
      });
    }

    if (enrollmentIds.length > 0 || paymentIds.length > 0) {
      await tx.teacherPayoutLine.deleteMany({
        where: {
          OR: [
            ...(enrollmentIds.length > 0
              ? [{ enrollmentId: { in: enrollmentIds } }]
              : []),
            ...(paymentIds.length > 0
              ? [{ paymentId: { in: paymentIds } }]
              : []),
          ],
        },
      });
    }

    await tx.refundAdjustment.deleteMany({ where: { studentId: student.id } });
    await tx.invoice.deleteMany({ where: { studentId: student.id } });
    await tx.payment.deleteMany({ where: { studentId: student.id } });
    await tx.lead.updateMany({
      where: { convertedStudentId: student.id },
      data: { convertedStudentId: null },
    });
    await tx.task.deleteMany({
      where: { entityType: "student", entityId: student.id },
    });
    await tx.student.delete({ where: { id: student.id } });

    const contactStillUsed = await tx.contact.findUnique({
      where: { id: student.contactId },
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
      await tx.contact.delete({ where: { id: student.contactId } });
    }

    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "student.delete",
      entityType: "student",
      entityId: student.id,
      before: { studentCode: student.code },
      reason: `${student.code} kodlu tələbə bütün bağlı məlumatları ilə silindi`,
    });
  });

  if (mobileAuthUserId) {
    try {
      await deleteStudentMobileAuthUser(mobileAuthUserId);
    } catch (error) {
      console.error("Student deleted but Supabase Auth cleanup failed", {
        authUserId: mobileAuthUserId,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  revalidatePath("/students");
  revalidatePath("/crm");
  revalidatePath("/dashboard");
  revalidatePath("/finance");
  revalidatePath("/marketing");
  revalidatePath("/groups");
  revalidatePath("/workshops");
  invalidateStudentCaches();
  invalidatePaymentCaches();
  return { redirectTo: "/students" };
}

async function resolveLeadForStudentCreation(
  tx: Prisma.TransactionClient,
  leadId: string | undefined
) {
  if (!leadId) {
    return null;
  }

  const lead = await tx.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      stage: true,
      contactId: true,
      managerId: true,
      campaignId: true,
      convertedStudentId: true,
    },
  });

  if (!lead) {
    throw new Error("Müraciət tapılmadı");
  }

  if (lead.convertedStudentId || lead.stage === LeadStage.REGISTERED) {
    throw new Error("Müraciət artıq tələbəyə çevrilib");
  }

  return lead;
}

async function updateLeadContact(
  tx: Prisma.TransactionClient,
  input: {
    leadId: string;
    contactId: string;
    fullName: string;
    phone: string;
    phoneNormalized: string;
    email: string | null;
    source: string;
  }
) {
  const currentContact = await tx.contact.findUnique({
    where: { id: input.contactId },
    select: {
      students: { select: { id: true }, take: 1 },
      leads: { select: { id: true }, take: 2 },
    },
  });

  if (!currentContact) {
    throw new Error("Əlaqə məlumatı tapılmadı");
  }

  const isSharedContact =
    currentContact.students.length > 0 ||
    currentContact.leads.some((lead) => lead.id !== input.leadId);

  if (isSharedContact) {
    const contact = await tx.contact.create({
      data: {
        fullName: input.fullName,
        phoneDisplay: input.phone,
        phoneNormalized: input.phoneNormalized,
        email: input.email,
        source: input.source,
      },
      select: { id: true },
    });

    return contact.id;
  }

  await tx.contact.update({
    where: { id: input.contactId },
    data: {
      fullName: input.fullName,
      phoneDisplay: input.phone,
      phoneNormalized: input.phoneNormalized,
      email: input.email,
      source: input.source,
    },
  });

  return input.contactId;
}

async function createStudentContact(
  tx: Prisma.TransactionClient,
  input: {
    fullName: string;
    phone: string;
    phoneNormalized: string;
    email: string | null;
    source: string;
  }
) {
  const contact = await tx.contact.create({
    data: {
      fullName: input.fullName,
      phoneDisplay: input.phone,
      phoneNormalized: input.phoneNormalized,
      email: input.email,
      source: input.source,
    },
    select: { id: true },
  });

  return contact.id;
}

async function createPaymentAndAllocate(
  tx: Prisma.TransactionClient,
  input: {
    studentId: string;
    amount: number;
    paidAt: Date;
    paymentMonth: Date;
    scheduleType: StudentPaymentScheduleType;
    method: (typeof studentPaymentMethodValues)[number];
    note: string | null;
    actorId: string;
    idempotencyKey: string;
  }
) {
  const paymentStudent = await tx.student.findUnique({
    where: { id: input.studentId },
    select: { lifecycleStatus: true },
  });

  if (!paymentStudent) {
    throw new Error("Tələbə tapılmadı");
  }

  if (paymentStudent.lifecycleStatus === StudentLifecycleStatus.COMPLETED) {
    throw new PublicActionError(
      "Tədrisi tamamlamış tələbənin maliyyə öhdəliyi bağlıdır və ödəniş qəbul edilmir.",
    );
  }

  await ensureMissingStudentMonthlyInvoices(tx, {
    studentId: input.studentId,
    throughDate: input.paidAt,
  });

  const student = await tx.student.findUnique({
    where: { id: input.studentId },
    select: {
      id: true,
      code: true,
      lifecycleStatus: true,
      invoices: {
        where: {
          status: { not: InvoiceStatus.VOID },
          balanceDue: { gt: 0 },
        },
        orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          amount: true,
          balanceDue: true,
          dueDate: true,
        },
      },
      enrollments: {
        where: { status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.PAUSED] } },
        orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
        take: 1,
        select: { id: true, monthlyFee: true },
      },
    },
  });

  if (!student) {
    throw new Error("Tələbə tapılmadı");
  }

  const monthlyFee = toNumber(student.enrollments[0]?.monthlyFee);
  let invoices = student.invoices;
  const periodMonth = startOfMonth(input.paidAt);
  const openBalance = roundMoney(
    invoices.reduce((total, invoice) => total + toNumber(invoice.balanceDue), 0),
  );

  if (input.scheduleType === "ONE_TIME" && input.amount < openBalance) {
    throw new PublicActionError(
      "Birdəfəlik tam ödəniş açıq balansdan az ola bilməz.",
    );
  }

  if (input.scheduleType === "ONE_TIME" && input.amount > openBalance) {
    const oneTimeAmount = roundMoney(input.amount - openBalance);
    const invoice = await tx.invoice.upsert({
      where: { idempotencyKey: `student-one-time-${input.idempotencyKey}` },
      update: {},
      create: {
        studentId: student.id,
        enrollmentId: student.enrollments[0]?.id ?? null,
        periodMonth,
        issueDate: input.paidAt,
        dueDate: input.paidAt,
        amount: oneTimeAmount,
        balanceDue: oneTimeAmount,
        status: InvoiceStatus.OPEN,
        idempotencyKey: `student-one-time-${input.idempotencyKey}`,
      },
      select: { id: true, amount: true, balanceDue: true, dueDate: true },
    });
    invoices = [...invoices, invoice];
  } else if (input.scheduleType === "MONTHLY" && monthlyFee > 0 && invoices.length === 0) {
    const invoice = await tx.invoice.upsert({
      where: {
        idempotencyKey: `student-month-${student.code}-${periodMonth.toISOString().slice(0, 10)}`,
      },
      update: {},
      create: {
        studentId: student.id,
        enrollmentId: student.enrollments[0]?.id ?? null,
        periodMonth,
        issueDate: input.paidAt,
        dueDate: input.paidAt,
        amount: monthlyFee,
        balanceDue: monthlyFee,
        status: InvoiceStatus.OPEN,
        idempotencyKey: `student-month-${student.code}-${periodMonth.toISOString().slice(0, 10)}`,
      },
      select: { id: true, amount: true, balanceDue: true, dueDate: true },
    });
    invoices = [invoice];
  }

  await clearStudentPaymentSchedules(tx, [student.id]);

  const payment = await tx.payment.create({
    data: {
      studentId: student.id,
      amount: input.amount,
      paidAt: input.paidAt,
      paymentMonth: input.paymentMonth,
      nextPaymentAt: null,
      scheduleType: input.scheduleType,
      method: input.method as PaymentMethod,
      note: input.note,
      idempotencyKey: input.idempotencyKey,
      createdById: input.actorId,
    },
    select: {
      id: true,
      amount: true,
      paidAt: true,
      paymentMonth: true,
      nextPaymentAt: true,
      scheduleType: true,
      method: true,
    },
  });

  let remainingAmount = input.amount;
  const allocations: Array<{ invoiceId: string; amount: number }> = [];

  for (const invoice of invoices) {
    if (remainingAmount <= 0) {
      break;
    }

    const currentBalance = toNumber(invoice.balanceDue);
    const amountAllocated = Math.min(currentBalance, remainingAmount);
    const nextBalance = roundMoney(currentBalance - amountAllocated);

    await tx.paymentAllocation.create({
      data: {
        paymentId: payment.id,
        invoiceId: invoice.id,
        amountAllocated,
        mode: PaymentAllocationMode.OLDEST_FIRST,
      },
    });

    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        balanceDue: nextBalance,
        status: resolveInvoiceStatus({
          amount: toNumber(invoice.amount),
          balanceDue: nextBalance,
          dueDate: invoice.dueDate,
        }),
      },
    });

    allocations.push({ invoiceId: invoice.id, amount: amountAllocated });
    remainingAmount = roundMoney(remainingAmount - amountAllocated);
  }

  return {
    studentCode: student.code,
    payment,
    allocations,
    remainingAmount,
  };
}

async function generateStudentCode(tx: Prisma.TransactionClient) {
  const [row] = await tx.$queryRaw<Array<{ value: bigint }>>(Prisma.sql`
    select nextval('"erp"."student_code_seq"') as value
  `);

  if (!row) {
    throw new PublicActionError("Tələbə kodu yaradıla bilmədi. Yenidən cəhd edin.", "CONFLICT");
  }

  return `ART-${row.value.toString().padStart(4, "0")}`;
}

function toPaymentAuditJson(
  result: Awaited<ReturnType<typeof createPaymentAndAllocate>>
) {
  return {
    payment: {
      ...result.payment,
      amount: toNumber(result.payment.amount),
      paidAt: result.payment.paidAt.toISOString(),
      paymentMonth: result.payment.paymentMonth.toISOString(),
    },
    allocations: result.allocations,
    unallocatedAmount: result.remainingAmount,
  } satisfies Prisma.InputJsonValue;
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

  const azMatch = trimmed.match(/^(\d{2})[./](\d{2})[./](\d{4})$/);
  if (azMatch) {
    const [, day, month, year] = azMatch;
    return `${year}-${month}-${day}`;
  }

  throw new Error("Tarix GG.AA.İİİİ formatında olmalıdır");
}

function resolveInvoiceStatus({
  amount,
  balanceDue,
  dueDate,
}: {
  amount: number;
  balanceDue: number;
  dueDate: Date;
}) {
  if (balanceDue <= 0) {
    return InvoiceStatus.PAID;
  }

  if (dueDate < startOfToday()) {
    return InvoiceStatus.OVERDUE;
  }

  return balanceDue < amount ? InvoiceStatus.PARTIAL : InvoiceStatus.OPEN;
}

function startOfMonth(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function safeStudentsRedirect(value: string | undefined) {
  return value?.startsWith("/students") ? value : "/students";
}

function invalidateStudentCaches() {
  updateTag(erpCacheTags.students);
  updateTag(erpCacheTags.crm);
  updateTag(erpCacheTags.dashboard);
  updateTag(erpCacheTags.finance);
  updateTag(erpCacheTags.marketing);
}

function invalidatePaymentCaches() {
  updateTag(erpCacheTags.students);
  updateTag(erpCacheTags.dashboard);
  updateTag(erpCacheTags.finance);
  updateTag(erpCacheTags.marketing);
}

export const createStudentAction = safeServerAction(
  createStudentActionImpl,
  "Tələbə yaradılmadı.",
);
export const recordStudentPaymentAction = safeServerAction(
  recordStudentPaymentActionImpl,
  "Ödəniş qeydə alınmadı.",
);
export const updateStudentStatusAction = safeServerAction(
  updateStudentStatusActionImpl,
  "Tələbə statusu yenilənmədi.",
);
export const updateStudentProfileAction = safeServerAction(
  updateStudentProfileActionImpl,
  "Tələbə profili yenilənmədi.",
);
export const createStudentEnrollmentAction = safeServerAction(
  createStudentEnrollmentActionImpl,
  "Tələbəyə paket əlavə edilmədi.",
);
export const deleteStudentAction = safeServerAction(
  deleteStudentActionImpl,
  "Tələbə silinmədi.",
);
