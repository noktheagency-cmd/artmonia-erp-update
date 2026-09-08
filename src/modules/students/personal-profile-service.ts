import { z } from "zod";
import { AppRole, Prisma } from "@/generated/prisma/client";
import { optionalFormString } from "@/modules/shared/form-values";
import { normalizePhone } from "@/modules/crm/duplicate-phone";
import { writeAuditLog } from "@/modules/audit/audit-service";
import { PublicActionError } from "@/server/actions/public-action-error";

const optionalText = (max: number) => z.preprocess(optionalFormString, z.string().trim().max(max).optional());
const optionalId = z.preprocess(optionalFormString, z.string().uuid().optional());
export const personalStudentProfileSchema = z.object({
  studentId: z.string().uuid(),
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(6).max(40),
  email: z.preprocess(optionalFormString, z.string().email("E-poçt düzgün deyil.").max(320).optional()),
  source: optionalText(60), educationLevel: optionalText(80),
  managerId: optionalId, campaignId: optionalId, notes: optionalText(500),
  registeredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** Deliberately has no enrollment, slot, status or financial writes. */
export async function updatePersonalStudentProfile(
  tx: Prisma.TransactionClient,
  raw: unknown,
  actor: { id: string; canManageAllStudents: boolean },
) {
  const input = personalStudentProfileSchema.parse(raw);
  const phoneNormalized = normalizePhone(input.phone);
  if (!phoneNormalized) throw new PublicActionError("Telefon düzgün deyil.");
  const registeredAt = new Date(`${input.registeredDate}T00:00:00.000Z`);
  if (Number.isNaN(registeredAt.getTime()) || registeredAt.toISOString().slice(0, 10) !== input.registeredDate) {
    throw new PublicActionError("Qeydiyyat tarixi düzgün deyil.");
  }
  await tx.$queryRaw(Prisma.sql`select id from erp.students where id=${input.studentId}::uuid for update`);
  const current = await tx.student.findUnique({ where: { id: input.studentId }, include: { contact: true } });
  if (!current) throw new PublicActionError("Tələbə tapılmadı.");
  if (!actor.canManageAllStudents && current.managerId !== actor.id) {
    throw new PublicActionError("Bu tələbəni redaktə etmək icazəniz yoxdur.", "FORBIDDEN");
  }
  const managerId = actor.canManageAllStudents ? input.managerId ?? null : current.managerId;
  const [manager, campaign, educationLevel] = await Promise.all([
    managerId ? tx.user.findFirst({ where: managerId === current.managerId ? { id: managerId } : {
      id: managerId, isActive: true,
      roles: { some: { role: { code: { in: [AppRole.OWNER, AppRole.ADMIN, AppRole.SALES] } } } },
    }, select: { id: true } }) : null,
    input.campaignId ? tx.marketingCampaign.findUnique({ where: { id: input.campaignId }, select: { id: true } }) : null,
    input.educationLevel ? tx.dropdownCatalogOption.findUnique({
      where: { catalog_value: { catalog: "STUDENT_EDUCATION_LEVEL", value: input.educationLevel } },
      select: { value: true, isActive: true },
    }) : null,
  ]);
  if (managerId && !manager) throw new PublicActionError("Məsul şəxs tapılmadı.");
  if (input.campaignId && !campaign) throw new PublicActionError("Kampaniya tapılmadı.");
  if (input.educationLevel && (!educationLevel || (!educationLevel.isActive && input.educationLevel !== current.educationLevel))) {
    throw new PublicActionError("Təhsil səviyyəsi tapılmadı və ya artıq aktiv deyil.");
  }
  const contactData = {
    fullName: input.fullName, phoneDisplay: input.phone, phoneNormalized,
    email: input.email ?? null, source: input.source ?? null,
  };
  const studentData = {
    managerId, campaignId: input.campaignId ?? null, educationLevel: input.educationLevel ?? null,
    registeredAt, notes: input.notes ?? null,
  };
  await tx.contact.update({ where: { id: current.contactId }, data: contactData });
  await tx.student.update({ where: { id: current.id }, data: studentData });
  await writeAuditLog(tx, {
    actorUserId: actor.id, action: "student.profile.update", entityType: "student", entityId: current.id,
    before: {
      fullName: current.contact.fullName, phoneDisplay: current.contact.phoneDisplay,
      phoneNormalized: current.contact.phoneNormalized, email: current.contact.email, source: current.contact.source,
      managerId: current.managerId, campaignId: current.campaignId, educationLevel: current.educationLevel,
      registeredAt: current.registeredAt.toISOString(), notes: current.notes,
    },
    after: { ...contactData, ...studentData, registeredAt: registeredAt.toISOString(), editScope: "PROFILE_ONLY" },
    reason: "Şəxsi profil yeniləndi; paket, status, slot və maliyyə tarixçəsi dəyişdirilmədi",
  });
}
