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
  isGiftDiscount,
  resolveStudentMonthlyFee,
} from "@/modules/students/student-create-rules";
import {
  clearStudentPaymentSchedules,
  resolveStudentNextPaymentAt,
  restartStudentPaymentScheduleForActiveSlot,
} from "@/modules/students/payment-schedule-service";
import {
  buildStudentStatusUpdateData as buildSharedStudentStatusUpdateData,
  getStatusChangeReason as getSharedStatusChangeReason,
  isBillingPausedStatus as isSharedBillingPausedStatus,
  syncActivationBilling as syncSharedActivationBilling,
} from "@/modules/students/lifecycle-service";
import { PublicActionError, safeServerAction } from "@/server/actions/safe-action";

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
  StudentLifecycleStatus.DEBT,
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
  source: optionalText(60),
  educationLevel: optionalText(80),
  programId: requiredUuid("Proqram"),
  teacherId: optionalUuid("Müəllim"),
  campaignId: optionalUuid("Kampaniya"),
  discountType: optionalText(100),
  lifecycleStatus: z.enum(studentLifecycleStatusValues).default(StudentLifecycleStatus.SLOT_WAITING),
  registeredDate: z.string().trim().min(1).max(20),
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
});

const recordPaymentSchema = z.object({
  idempotencyKey: z.string().uuid(),
  studentId: z.string().uuid(),
  amount: z.preprocess(parseAmountInput, z.number().positive().max(100_000)),
  paidDate: z.string().trim().min(1).max(20),
  method: z.enum(studentPaymentMethodValues).default("CASH"),
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
  const requestedFirstLessonAt = input.firstLessonDate
    ? parseDateInput(input.firstLessonDate, "İlk dərs tarixi")
    : null;
  const firstLessonAt = resolveInitialFirstLessonAt({
    lifecycleStatus: input.lifecycleStatus,
    registeredAt,
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
  if (existingStudent) {
    return { redirectTo: safeStudentsRedirect(input.returnTo) };
  }

  try {
    await prisma.$transaction(async (tx) => {
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
          contactId: lead.contactId,
          fullName: input.fullName,
          phone: input.phone,
          phoneNormalized,
          source: input.source ?? "Manual",
        })
      : await createOrUpdateStudentContact(tx, {
          fullName: input.fullName,
          phone: input.phone,
          phoneNormalized,
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
        billingPaused: isSharedBillingPausedStatus(input.lifecycleStatus),
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
    });
  } catch (error) {
    const recoveredStudent = await prisma.student.findUnique({
      where: { creationIdempotencyKey: input.idempotencyKey },
      select: { id: true },
    });
    if (!recoveredStudent) throw error;
  }

  revalidatePath("/students");
  revalidatePath("/crm");
  revalidatePath("/dashboard");
  revalidatePath("/finance");
  revalidatePath("/marketing");
  invalidateStudentCaches();
  return { redirectTo: safeStudentsRedirect(input.returnTo) };
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
        reason: getSharedStatusChangeReason(input.lifecycleStatus),
        note: input.note ?? null,
        effectiveAt,
        changedById: actor.id,
      },
    });

    if (input.lifecycleStatus === StudentLifecycleStatus.ACTIVE) {
      await syncSharedActivationBilling(tx, {
        studentId: current.id,
        studentCode: current.code,
        effectiveAt,
      });
      await restartStudentPaymentScheduleForActiveSlot(tx, {
        studentId: current.id,
        activatedAt: effectiveAt,
      });
    } else if (isSharedBillingPausedStatus(input.lifecycleStatus)) {
      await clearStudentPaymentSchedules(tx, [current.id]);
    }

    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "student.status.change",
      entityType: "student",
      entityId: current.id,
      before: {
        lifecycleStatus: current.lifecycleStatus,
        billingPaused: current.billingPaused,
      },
      after: {
        lifecycleStatus: input.lifecycleStatus,
        billingPaused: isSharedBillingPausedStatus(input.lifecycleStatus),
        effectiveAt: effectiveAt.toISOString(),
      },
      reason: input.note ?? getSharedStatusChangeReason(input.lifecycleStatus),
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

    const canManageAllStudents = scopeFor(actor.permissions, "student.update") === "ALL";
    if (!canManageAllStudents && current.managerId !== actor.id) {
      throw new PublicActionError("Bu tələbəni redaktə etmək icazəniz yoxdur.");
    }

    const currentEnrollment = current.enrollments[0];
    if (!currentEnrollment) {
      throw new PublicActionError("Tələbənin aktiv tədris qeydiyyatı tapılmadı.");
    }

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

    const phoneOwner = await tx.contact.findFirst({
      where: {
        phoneNormalized,
        id: { not: current.contact.id },
      },
      select: { fullName: true },
    });
    if (phoneOwner) {
      throw new Error(`Telefon artıq ${phoneOwner.fullName} adına bağlıdır`);
    }

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
            where: {
              id: managerId,
              OR: [
                { id: current.managerId ?? "__current_manager_missing__" },
                {
                  isActive: true,
                  roles: {
                    some: {
                      role: { code: { in: [AppRole.OWNER, AppRole.ADMIN, AppRole.SALES] } },
                    },
                  },
                },
              ],
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
          reason: getSharedStatusChangeReason(input.lifecycleStatus),
          note: input.statusNote ?? null,
          effectiveAt: statusEffectiveAt,
          changedById: actor.id,
        },
      });

      if (input.lifecycleStatus === StudentLifecycleStatus.ACTIVE) {
        await syncSharedActivationBilling(tx, {
          studentId: current.id,
          studentCode: current.code,
          effectiveAt: statusEffectiveAt,
        });
        await restartStudentPaymentScheduleForActiveSlot(tx, {
          studentId: current.id,
          activatedAt: statusEffectiveAt,
        });
      } else if (isSharedBillingPausedStatus(input.lifecycleStatus)) {
        await clearStudentPaymentSchedules(tx, [current.id]);
      }

      await writeAuditLog(tx, {
        actorUserId: actor.id,
        action: "student.status.change",
        entityType: "student",
        entityId: current.id,
        before: {
          lifecycleStatus: current.lifecycleStatus,
          billingPaused: current.billingPaused,
        },
        after: {
          lifecycleStatus: input.lifecycleStatus,
          billingPaused: isSharedBillingPausedStatus(input.lifecycleStatus),
          effectiveAt: statusEffectiveAt.toISOString(),
        },
        reason: input.statusNote ?? getSharedStatusChangeReason(input.lifecycleStatus),
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

async function deleteStudentActionImpl(formData: FormData) {
  const actor = await requireMutationActor("student.delete");
  const input = deleteStudentSchema.parse(Object.fromEntries(formData));
  const prisma = getPrisma();

  await prisma.$transaction(async (tx) => {
    const student = await tx.student.findUnique({
      where: { id: input.studentId },
      select: { id: true, code: true, contactId: true },
    });

    if (!student) {
      throw new Error("Tələbə tapılmadı");
    }

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
      contact: {
        select: {
          students: { select: { code: true }, take: 1 },
        },
      },
    },
  });

  if (!lead) {
    throw new Error("Müraciət tapılmadı");
  }

  if (lead.convertedStudentId || lead.stage === LeadStage.REGISTERED) {
    throw new Error("Müraciət artıq tələbəyə çevrilib");
  }

  if (lead.contact.students.length > 0) {
    throw new Error(`Bu əlaqə artıq ${lead.contact.students[0].code} kodlu tələbəyə bağlıdır`);
  }

  return lead;
}

function resolveInitialFirstLessonAt({
  lifecycleStatus,
  registeredAt,
  requestedFirstLessonAt,
}: {
  lifecycleStatus: StudentLifecycleStatus;
  registeredAt: Date;
  requestedFirstLessonAt: Date | null;
}) {
  if (lifecycleStatus !== StudentLifecycleStatus.ACTIVE) {
    return null;
  }

  if (requestedFirstLessonAt) {
    return requestedFirstLessonAt;
  }

  return registeredAt;
}

async function updateLeadContact(
  tx: Prisma.TransactionClient,
  input: {
    contactId: string;
    fullName: string;
    phone: string;
    phoneNormalized: string;
    source: string;
  }
) {
  const conflict = await tx.contact.findUnique({
    where: { phoneNormalized: input.phoneNormalized },
    select: { id: true, fullName: true },
  });

  if (conflict && conflict.id !== input.contactId) {
    throw new Error(`Telefon artıq ${conflict.fullName} adına bağlıdır`);
  }

  await tx.contact.update({
    where: { id: input.contactId },
    data: {
      fullName: input.fullName,
      phoneDisplay: input.phone,
      phoneNormalized: input.phoneNormalized,
      source: input.source,
    },
  });

  return input.contactId;
}

async function createOrUpdateStudentContact(
  tx: Prisma.TransactionClient,
  input: {
    fullName: string;
    phone: string;
    phoneNormalized: string;
    source: string;
  }
) {
  const existing = await tx.contact.findUnique({
    where: { phoneNormalized: input.phoneNormalized },
    select: {
      id: true,
      students: { select: { code: true }, take: 1 },
    },
  });

  if (existing?.students.length) {
    throw new Error(`Bu telefon artıq ${existing.students[0].code} kodlu tələbəyə bağlıdır`);
  }

  if (existing) {
    await tx.contact.update({
      where: { id: existing.id },
      data: {
        fullName: input.fullName,
        phoneDisplay: input.phone,
        source: input.source,
      },
    });

    return existing.id;
  }

  const contact = await tx.contact.create({
    data: {
      fullName: input.fullName,
      phoneDisplay: input.phone,
      phoneNormalized: input.phoneNormalized,
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
    method: (typeof studentPaymentMethodValues)[number];
    note: string | null;
    actorId: string;
    idempotencyKey: string;
  }
) {
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
        select: { monthlyFee: true },
      },
    },
  });

  if (!student) {
    throw new Error("Tələbə tapılmadı");
  }

  const monthlyFee = toNumber(student.enrollments[0]?.monthlyFee);
  const nextPaymentAt = await resolveStudentNextPaymentAt(tx, {
    studentId: student.id,
    paymentMonth: input.paymentMonth,
  });
  let invoices = student.invoices;
  const periodMonth = startOfMonth(input.paidAt);

  if (monthlyFee > 0 && invoices.length === 0) {
    const invoice = await tx.invoice.upsert({
      where: {
        idempotencyKey: `student-month-${student.code}-${periodMonth.toISOString().slice(0, 10)}`,
      },
      update: {},
      create: {
        studentId: student.id,
        enrollmentId: null,
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

  const payment = await tx.payment.create({
    data: {
      studentId: student.id,
      amount: input.amount,
      paidAt: input.paidAt,
      paymentMonth: input.paymentMonth,
      nextPaymentAt,
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

  const stillHasOpenBalance = await tx.invoice.findFirst({
    where: {
      studentId: student.id,
      status: { not: InvoiceStatus.VOID },
      balanceDue: { gt: 0 },
    },
    select: { id: true },
  });

  if (!stillHasOpenBalance && student.lifecycleStatus === StudentLifecycleStatus.DEBT) {
    await tx.student.update({
      where: { id: student.id },
      data: { lifecycleStatus: StudentLifecycleStatus.ACTIVE },
    });

    await tx.studentStatusHistory.create({
      data: {
        studentId: student.id,
        oldStatus: student.lifecycleStatus,
        newStatus: StudentLifecycleStatus.ACTIVE,
        reason: "Borc bağlandığı üçün status aktiv edildi",
        note: input.note,
        effectiveAt: input.paidAt,
        changedById: input.actorId,
      },
    });
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
export const deleteStudentAction = safeServerAction(
  deleteStudentActionImpl,
  "Tələbə silinmədi.",
);
