"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { HrCorporateCustomerStatus, Prisma } from "@/generated/prisma/client";
import { writeAuditLog } from "@/modules/audit/audit-service";
import { safeServerAction, PublicActionError } from "@/server/actions/safe-action";
import { requireMutationActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";

const optionalMoneySchema = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? null : value),
  z.coerce.number().nonnegative().max(1_000_000_000).nullable(),
);

const optionalDateSchema = z.string().trim().refine(
  (value) => value === "" || isValidDateKey(value),
  "Ödəniş tarixi düzgün deyil",
);

const contactsSchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}, z.array(z.object({
  id: z.string().uuid().optional(),
  fullName: z.string().trim().min(2).max(120),
  position: z.string().trim().max(100),
  phone: z.string().trim().max(40),
  email: z.union([z.string().trim().email(), z.literal("")]),
  isPrimary: z.boolean(),
}).superRefine((contact, context) => {
  if (!contact.phone && !contact.email) {
    context.addIssue({
      code: "custom",
      path: ["phone"],
      message: "Əlaqəli şəxs üçün telefon və ya e-poçt daxil edilməlidir",
    });
  }
})).min(1, "Ən az bir əlaqəli şəxs əlavə edilməlidir").max(20));

const customerSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(160),
  taxId: z.union([
    z.string().trim().regex(/^\d{10}$/, "VÖEN 10 rəqəmdən ibarət olmalıdır"),
    z.literal(""),
  ]),
  status: z.nativeEnum(HrCorporateCustomerStatus),
  monthlyBudget: z.coerce.number().positive("Aylıq büdcə sıfırdan böyük olmalıdır").max(1_000_000_000),
  contractValue: optionalMoneySchema,
  paymentDate: optionalDateSchema,
  note: z.string().trim().max(2000),
  contacts: contactsSchema,
}).superRefine((value, context) => {
  const primaryCount = value.contacts.filter((contact) => contact.isPrimary).length;
  if (primaryCount !== 1) {
    context.addIssue({
      code: "custom",
      path: ["contacts"],
      message: "Dəqiq bir əsas əlaqəli şəxs seçilməlidir",
    });
  }
});

const idSchema = z.object({ id: z.string().uuid() });

async function createCorporateCustomerActionImpl(formData: FormData) {
  const actor = await requireMutationActor("hr.corporate.manage");
  const parsed = customerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    throw new PublicActionError(parsed.error.issues[0]?.message ?? "Şirkət məlumatları düzgün deyil");
  }

  const input = parsed.data;
  const prisma = getPrisma();
  await ensureTaxIdAvailable(input.taxId);

  const customer = await prisma.$transaction(async (tx) => {
    const created = await tx.hrCorporateCustomer.create({
      data: {
        name: input.name,
        taxId: input.taxId || null,
        status: input.status,
        monthlyBudget: input.monthlyBudget,
        contractValue: input.contractValue,
        paymentDate: parseOptionalDate(input.paymentDate),
        note: input.note || null,
        createdById: actor.id,
      },
      select: {
        id: true,
        name: true,
        taxId: true,
        status: true,
        monthlyBudget: true,
        contractValue: true,
        paymentDate: true,
      },
    });

    await tx.hrCorporateContact.createMany({
      data: input.contacts.map((contact) => ({
        customerId: created.id,
        fullName: contact.fullName,
        position: contact.position || null,
        phone: contact.phone || null,
        email: contact.email || null,
        isPrimary: contact.isPrimary,
      })),
    });

    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "hr.corporate.create",
      entityType: "hr_corporate_customer",
      entityId: created.id,
      after: {
        name: created.name,
        taxId: created.taxId,
        status: created.status,
        monthlyBudget: String(created.monthlyBudget),
        contractValue: created.contractValue === null ? null : String(created.contractValue),
        paymentDate: dateKey(created.paymentDate),
        contactCount: input.contacts.length,
      } as Prisma.InputJsonValue,
      reason: "Korporativ müştəri yaradıldı",
    });

    return created;
  });

  revalidatePath("/hr");
  return { id: customer.id };
}

async function updateCorporateCustomerActionImpl(formData: FormData) {
  const actor = await requireMutationActor("hr.corporate.manage");
  const parsed = customerSchema.required({ id: true }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    throw new PublicActionError(parsed.error.issues[0]?.message ?? "Şirkət məlumatları düzgün deyil");
  }

  const input = parsed.data;
  const prisma = getPrisma();
  const before = await prisma.hrCorporateCustomer.findUnique({
    where: { id: input.id },
    select: {
      id: true,
      name: true,
      taxId: true,
      status: true,
      monthlyBudget: true,
      contractValue: true,
      paymentDate: true,
      note: true,
      contacts: {
        select: { id: true, userId: true, fullName: true, position: true, phone: true, email: true, isPrimary: true },
        take: 20,
      },
    },
  });
  if (!before) throw new PublicActionError("Şirkət tapılmadı", "NOT_FOUND");
  await ensureTaxIdAvailable(input.taxId, input.id);
  const existingContactIds = new Set(before.contacts.map((contact) => contact.id));
  const submittedContactIds = input.contacts.flatMap((contact) => contact.id ? [contact.id] : []);
  if (new Set(submittedContactIds).size !== submittedContactIds.length || submittedContactIds.some((id) => !existingContactIds.has(id))) {
    throw new PublicActionError("Əlaqəli şəxs siyahısı dəyişib. Səhifəni yeniləyib təkrar yoxlayın", "CONFLICT");
  }
  const removedAccountContact = before.contacts.find((contact) => contact.userId && !submittedContactIds.includes(contact.id));
  if (removedAccountContact) {
    throw new PublicActionError("ERP hesabı olan əlaqəli şəxs silinə bilməz. Hesabı Audit və təhlükəsizlik bölməsində idarə edin", "CONFLICT");
  }

  await prisma.$transaction(async (tx) => {
    const updated = await tx.hrCorporateCustomer.update({
      where: { id: input.id },
      data: {
        name: input.name,
        taxId: input.taxId || null,
        status: input.status,
        monthlyBudget: input.monthlyBudget,
        contractValue: input.contractValue,
        paymentDate: parseOptionalDate(input.paymentDate),
        note: input.note || null,
      },
      select: {
        id: true,
        name: true,
        taxId: true,
        status: true,
        monthlyBudget: true,
        contractValue: true,
        paymentDate: true,
      },
    });

    await tx.hrCorporateContact.deleteMany({
      where: {
        customerId: input.id,
        ...(submittedContactIds.length ? { id: { notIn: submittedContactIds } } : {}),
      },
    });
    for (const contact of input.contacts) {
      const data = {
        fullName: contact.fullName,
        position: contact.position || null,
        phone: contact.phone || null,
        email: contact.email || null,
        isPrimary: contact.isPrimary,
      };
      if (contact.id) {
        const updatedContact = await tx.hrCorporateContact.update({
          where: { id: contact.id },
          data,
          select: { userId: true },
        });
        if (updatedContact.userId) {
          await tx.user.update({
            where: { id: updatedContact.userId },
            data: { fullName: contact.fullName, phone: contact.phone || null },
          });
        }
      } else {
        await tx.hrCorporateContact.create({ data: { customerId: input.id, ...data } });
      }
    }

    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "hr.corporate.update",
      entityType: "hr_corporate_customer",
      entityId: input.id,
      before: {
        name: before.name,
        taxId: before.taxId,
        status: before.status,
        monthlyBudget: String(before.monthlyBudget),
        contractValue: before.contractValue === null ? null : String(before.contractValue),
        paymentDate: dateKey(before.paymentDate),
        contactCount: before.contacts.length,
      } as Prisma.InputJsonValue,
      after: {
        name: updated.name,
        taxId: updated.taxId,
        status: updated.status,
        monthlyBudget: String(updated.monthlyBudget),
        contractValue: updated.contractValue === null ? null : String(updated.contractValue),
        paymentDate: dateKey(updated.paymentDate),
        contactCount: input.contacts.length,
      } as Prisma.InputJsonValue,
      reason: "Korporativ müştəri yeniləndi",
    });
  });

  revalidatePath("/hr");
}

async function deleteCorporateCustomerActionImpl(formData: FormData) {
  const actor = await requireMutationActor("hr.corporate.manage");
  const parsed = idSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new PublicActionError("Şirkət seçimi düzgün deyil");

  const prisma = getPrisma();
  const before = await prisma.hrCorporateCustomer.findUnique({
    where: { id: parsed.data.id },
    select: {
      id: true,
      name: true,
      taxId: true,
      contacts: { where: { userId: { not: null } }, select: { id: true }, take: 1 },
      _count: { select: { contacts: true } },
    },
  });
  if (!before) throw new PublicActionError("Şirkət tapılmadı", "NOT_FOUND");
  if (before.contacts.length) {
    throw new PublicActionError("ERP hesabı olan əlaqəli şəxsi olan şirkət silinə bilməz. Hesabı Audit və təhlükəsizlik bölməsində idarə edin", "CONFLICT");
  }

  await prisma.$transaction(async (tx) => {
    await tx.hrCorporateCustomer.delete({ where: { id: before.id } });
    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "hr.corporate.delete",
      entityType: "hr_corporate_customer",
      entityId: before.id,
      before: {
        name: before.name,
        taxId: before.taxId,
        contactCount: before._count.contacts,
      } as Prisma.InputJsonValue,
      reason: "Korporativ müştəri silindi",
    });
  });

  revalidatePath("/hr");
}

async function ensureTaxIdAvailable(taxId: string, excludedId?: string) {
  if (!taxId) return;
  const existing = await getPrisma().hrCorporateCustomer.findFirst({
    where: {
      taxId,
      ...(excludedId ? { id: { not: excludedId } } : {}),
    },
    select: { id: true },
  });
  if (existing) throw new PublicActionError("Bu VÖEN ilə şirkət artıq mövcuddur", "DUPLICATE");
}

function isValidDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function parseOptionalDate(value: string) {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function dateKey(value: Date | null) {
  return value?.toISOString().slice(0, 10) ?? null;
}

export const createCorporateCustomerAction = safeServerAction(
  createCorporateCustomerActionImpl,
  "Şirkət yaradıla bilmədi.",
);

export const updateCorporateCustomerAction = safeServerAction(
  updateCorporateCustomerActionImpl,
  "Şirkət yenilənə bilmədi.",
);

export const deleteCorporateCustomerAction = safeServerAction(
  deleteCorporateCustomerActionImpl,
  "Şirkət silinə bilmədi.",
);
