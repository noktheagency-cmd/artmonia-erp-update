"use server";

import { revalidatePath, updateTag } from "next/cache";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  EnrollmentStatus,
  InvoiceStatus,
  LeadStage,
  PaymentAllocationMode,
  StudentLifecycleStatus,
} from "@/generated/prisma/client";
import type { PaymentMethod, Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/server/db/prisma";
import { requireMutationActor } from "@/server/auth/actor";
import { writeAuditLog } from "@/modules/audit/audit-service";
import { normalizePhone } from "@/modules/crm/duplicate-phone";
import { optionalFormString } from "@/modules/shared/form-values";
import { toNumber } from "@/modules/shared/format";
import { erpCacheTags } from "@/modules/shared/cache-tags";
import { studentPaymentMethodValues } from "@/modules/students/payment-method";

const optionalText = (max: number) =>
  z.preprocess(optionalFormString, z.string().max(max).optional());

const optionalUuid = z.preprocess(
  optionalFormString,
  z.string().uuid().optional()
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
  StudentLifecycleStatus.GROUP_WAITING,
  StudentLifecycleStatus.ACTIVE,
  StudentLifecycleStatus.DEBT,
  StudentLifecycleStatus.FROZEN,
  StudentLifecycleStatus.STOPPED,
  StudentLifecycleStatus.DECLINED,
  StudentLifecycleStatus.COMPLETED,
] as const;

const createStatusValues = [
  StudentLifecycleStatus.GROUP_WAITING,
  StudentLifecycleStatus.ACTIVE,
] as const;

const createStudentSchema = z.object({
  mode: z.enum(["lead", "manual"]).default("manual"),
  leadId: optionalUuid,
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(5).max(40),
  source: optionalText(60),
  educationLevel: optionalText(80),
  programId: z.string().uuid(),
  teacherId: optionalUuid,
  managerId: optionalUuid,
  lifecycleStatus: z.enum(createStatusValues).default(StudentLifecycleStatus.GROUP_WAITING),
  registeredDate: z.string().trim().min(1).max(20),
  firstLessonDate: optionalText(20),
  monthlyFee: z.preprocess(parseAmountInput, z.number().positive().max(100_000)),
  lessonsPerMonth: optionalInteger,
  notes: optionalText(500),
  acceptPayment: z.preprocess(
    (value) => value === "on" || value === "true",
    z.boolean()
  ),
  paymentAmount: optionalAmount,
  paymentDate: optionalText(20),
  paymentMonth: optionalText(20),
  paymentMethod: z.enum(studentPaymentMethodValues).default("CASH"),
  paymentNote: optionalText(240),
  returnTo: optionalText(260),
});

const recordPaymentSchema = z.object({
  studentId: z.string().uuid(),
  amount: z.preprocess(parseAmountInput, z.number().positive().max(100_000)),
  paidDate: z.string().trim().min(1).max(20),
  paymentMonth: z.string().trim().min(1).max(20),
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

export async function createStudentAction(formData: FormData) {
  const actor = await requireMutationActor("student.create");
  const input = createStudentSchema.parse(Object.fromEntries(formData));

  if (input.mode === "lead" && !actor.permissions.has("crm.lead.convert")) {
    throw new Error("Müraciəti tələbəyə çevirmək icazəsi yoxdur");
  }

  if (input.acceptPayment && !actor.permissions.has("billing.payment.create")) {
    throw new Error("Ödəniş qəbul etmək icazəsi yoxdur");
  }

  if (input.lifecycleStatus === StudentLifecycleStatus.ACTIVE && !input.teacherId) {
    throw new Error("Aktiv tələbə üçün müəllim seçilməlidir");
  }

  if (input.acceptPayment && !input.paymentAmount) {
    throw new Error("Ödənişi qəbul etmək üçün məbləğ yazın");
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
  const billingStartAt = firstLessonAt ?? (input.acceptPayment ? registeredAt : null);
  const paymentDate = input.acceptPayment
    ? parseDateInput(input.paymentDate ?? "", "Ödəniş tarixi")
    : null;
  const paymentMonth = input.acceptPayment
    ? parseMonthInput(input.paymentMonth ?? "")
    : null;
  const prisma = getPrisma();

  await prisma.$transaction(async (tx) => {
    const program = await tx.program.findUnique({
      where: { id: input.programId },
      select: { id: true },
    });

    if (!program) {
      throw new Error("Proqram tapılmadı");
    }

    const lead = await resolveLeadForStudentCreation(tx, input.mode, input.leadId);
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
    const managerId = input.managerId ?? lead?.managerId ?? actor.id;

    const student = await tx.student.create({
      data: {
        code: studentCode,
        contactId,
        managerId,
        lifecycleStatus: input.lifecycleStatus,
        educationLevel: input.educationLevel ?? null,
        registeredAt,
        billingPaused: isBillingPausedStatus(input.lifecycleStatus),
        notes: input.notes ?? null,
        statusHistory: {
          create: {
            newStatus: input.lifecycleStatus,
            reason:
              input.mode === "lead"
                ? "Müraciətdən tələbə yaradıldı"
                : "Tələbə sıfırdan yaradıldı",
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
        monthlyFee: input.monthlyFee,
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
            amount: input.monthlyFee,
            balanceDue: input.monthlyFee,
            status: resolveInvoiceStatus({
              amount: input.monthlyFee,
              balanceDue: input.monthlyFee,
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

  revalidatePath("/students");
  revalidatePath("/crm");
  revalidatePath("/dashboard");
  revalidatePath("/finance");
  invalidateStudentCaches();
  redirectToStudents(input.returnTo);
}

export async function recordStudentPaymentAction(formData: FormData) {
  const actor = await requireMutationActor("billing.payment.create");
  const input = recordPaymentSchema.parse(Object.fromEntries(formData));
  const paidAt = parseDateInput(input.paidDate, "Ödəniş tarixi");
  const paymentMonth = parseMonthInput(input.paymentMonth);
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
  invalidatePaymentCaches();
  redirectToStudents(input.returnTo);
}

export async function updateStudentStatusAction(formData: FormData) {
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

    const updateData = buildStudentStatusUpdateData(input.lifecycleStatus, effectiveAt);

    await tx.student.update({
      where: { id: current.id },
      data: updateData,
    });

    await tx.studentStatusHistory.create({
      data: {
        studentId: current.id,
        oldStatus: current.lifecycleStatus,
        newStatus: input.lifecycleStatus,
        reason: getStatusChangeReason(input.lifecycleStatus),
        note: input.note ?? null,
        effectiveAt,
        changedById: actor.id,
      },
    });

    if (input.lifecycleStatus === StudentLifecycleStatus.ACTIVE) {
      await syncActivationBilling(tx, {
        studentId: current.id,
        studentCode: current.code,
        effectiveAt,
      });
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
        billingPaused: isBillingPausedStatus(input.lifecycleStatus),
        effectiveAt: effectiveAt.toISOString(),
      },
      reason: input.note ?? getStatusChangeReason(input.lifecycleStatus),
    });
  });

  revalidatePath("/students");
  revalidatePath(`/students/${input.studentId}`);
  revalidatePath("/dashboard");
  revalidatePath("/finance");
  invalidateStudentCaches();
  redirectToStudents(input.returnTo);
}

async function resolveLeadForStudentCreation(
  tx: Prisma.TransactionClient,
  mode: "lead" | "manual",
  leadId: string | undefined
) {
  if (mode !== "lead") {
    return null;
  }

  if (!leadId) {
    throw new Error("Müraciət seçilməlidir");
  }

  const lead = await tx.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      stage: true,
      contactId: true,
      managerId: true,
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
  if (requestedFirstLessonAt) {
    return requestedFirstLessonAt;
  }

  return lifecycleStatus === StudentLifecycleStatus.ACTIVE ? registeredAt : null;
}

function isBillingPausedStatus(status: StudentLifecycleStatus) {
  switch (status) {
    case StudentLifecycleStatus.GROUP_WAITING:
    case StudentLifecycleStatus.FROZEN:
    case StudentLifecycleStatus.STOPPED:
    case StudentLifecycleStatus.DECLINED:
    case StudentLifecycleStatus.COMPLETED:
      return true;
    default:
      return false;
  }
}

function buildStudentStatusUpdateData(
  status: StudentLifecycleStatus,
  effectiveAt: Date
): Prisma.StudentUpdateInput {
  const data: Prisma.StudentUpdateInput = {
    lifecycleStatus: status,
    billingPaused: isBillingPausedStatus(status),
  };

  if (status === StudentLifecycleStatus.ACTIVE) {
    data.stoppedAt = null;
    data.completedAt = null;
    data.freezeReturnAt = null;
  }

  if (status === StudentLifecycleStatus.STOPPED || status === StudentLifecycleStatus.DECLINED) {
    data.stoppedAt = effectiveAt;
  }

  if (status === StudentLifecycleStatus.COMPLETED) {
    data.completedAt = effectiveAt;
  }

  return data;
}

function getStatusChangeReason(status: StudentLifecycleStatus) {
  if (status === StudentLifecycleStatus.ACTIVE) {
    return "Tələbə aktiv edildi";
  }

  if (status === StudentLifecycleStatus.GROUP_WAITING) {
    return "Tələbə qrup gözləyir statusuna keçirildi";
  }

  if (status === StudentLifecycleStatus.DECLINED) {
    return "Tələbə imtina etdi";
  }

  if (status === StudentLifecycleStatus.STOPPED) {
    return "Tələbə dayandırıldı";
  }

  return "Tələbə statusu yeniləndi";
}

async function syncActivationBilling(
  tx: Prisma.TransactionClient,
  input: {
    studentId: string;
    studentCode: string;
    effectiveAt: Date;
  }
) {
  const enrollment = await tx.enrollment.findFirst({
    where: {
      studentId: input.studentId,
      status: {
        in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.PAUSED],
      },
    },
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      monthlyFee: true,
    },
  });

  if (!enrollment) {
    throw new Error("Aktiv etmək üçün tələbənin enrollment məlumatı tapılmadı");
  }

  await tx.enrollment.update({
    where: { id: enrollment.id },
    data: {
      status: EnrollmentStatus.ACTIVE,
      startDate: input.effectiveAt,
      firstLessonAt: input.effectiveAt,
    },
  });

  const existingInvoice = await tx.invoice.findFirst({
    where: {
      studentId: input.studentId,
      status: { not: InvoiceStatus.VOID },
      balanceDue: { gt: 0 },
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      amount: true,
      balanceDue: true,
    },
  });

  if (existingInvoice) {
    await tx.invoice.update({
      where: { id: existingInvoice.id },
      data: {
        periodMonth: startOfMonth(input.effectiveAt),
        dueDate: input.effectiveAt,
        status: resolveInvoiceStatus({
          amount: toNumber(existingInvoice.amount),
          balanceDue: toNumber(existingInvoice.balanceDue),
          dueDate: input.effectiveAt,
        }),
      },
    });
    return;
  }

  const amount = toNumber(enrollment.monthlyFee);

  await tx.invoice.create({
    data: {
      studentId: input.studentId,
      enrollmentId: enrollment.id,
      periodMonth: startOfMonth(input.effectiveAt),
      issueDate: input.effectiveAt,
      dueDate: input.effectiveAt,
      amount,
      balanceDue: amount,
      status: resolveInvoiceStatus({
        amount,
        balanceDue: amount,
        dueDate: input.effectiveAt,
      }),
      idempotencyKey: `student-activation-${input.studentCode}-${startOfMonth(input.effectiveAt).toISOString().slice(0, 10)}`,
    },
  });
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
    },
  });

  if (!student) {
    throw new Error("Tələbə tapılmadı");
  }

  const payment = await tx.payment.create({
    data: {
      studentId: student.id,
      amount: input.amount,
      paidAt: input.paidAt,
      paymentMonth: input.paymentMonth,
      method: input.method as PaymentMethod,
      note: input.note,
      createdById: input.actorId,
    },
    select: {
      id: true,
      amount: true,
      paidAt: true,
      paymentMonth: true,
      method: true,
    },
  });

  let remainingAmount = input.amount;
  const allocations: Array<{ invoiceId: string; amount: number }> = [];

  for (const invoice of student.invoices) {
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

function parseMonthInput(value: string) {
  const trimmed = value.trim();
  const monthMatch = trimmed.match(/^(\d{4})-(\d{2})$/);

  if (monthMatch) {
    return new Date(`${monthMatch[1]}-${monthMatch[2]}-01T00:00:00.000Z`);
  }

  return parseDateInput(trimmed, "Ödəniş ayı");
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

function redirectToStudents(value: string | undefined): never {
  redirect(safeStudentsRedirect(value) as Route);
}

function invalidateStudentCaches() {
  updateTag(erpCacheTags.students);
  updateTag(erpCacheTags.crm);
  updateTag(erpCacheTags.dashboard);
  updateTag(erpCacheTags.finance);
}

function invalidatePaymentCaches() {
  updateTag(erpCacheTags.students);
  updateTag(erpCacheTags.dashboard);
  updateTag(erpCacheTags.finance);
}
