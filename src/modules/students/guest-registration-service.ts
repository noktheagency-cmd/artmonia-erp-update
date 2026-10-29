import { createHash } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import type { ErpActor } from "@/server/auth/actor";
import { assertPermission, scopeFor } from "@/server/rbac/permissions";
import { PublicActionError } from "@/server/actions/public-action-error";
import { normalizePhone } from "@/modules/crm/duplicate-phone";
import { assertCanAccessLead } from "@/modules/crm/access";
import { resolveRegistrationMeetingAttendance } from "@/modules/crm/registration-attend-policy";
import { closeConvertedLeadFollowUp } from "@/modules/crm/work-service";
import { writeAuditLog } from "@/modules/audit/audit-service";
import { currentBakuDateValue } from "@/lib/baku-date";
import { assertCreationDatesAllowed } from "@/modules/shared/creation-date-policy";
import { optionalFormString } from "@/modules/shared/form-values";
import { singleLessonSchema } from "./single-lesson-policy";
import { resolveStudentEducationLevel } from "./education-level-service";
import { assertGuestVisitAvailable } from "./guest-visit-scheduling";

const optionalText = (max: number) => z.preprocess(optionalFormString, z.string().trim().max(max).optional());
export const guestRegistrationSchema = z.object({
  idempotencyKey: z.string().uuid(),
  leadId: z.preprocess(optionalFormString, z.string().uuid().optional()),
  fullName: z.string().trim().min(2).max(120), phone: z.string().trim().min(5).max(40),
  source: optionalText(60), educationLevel: optionalText(80), notes: optionalText(500),
  email: z.preprocess(optionalFormString, z.string().email().max(320).optional()),
  programId: z.string().uuid(), teacherId: z.string().uuid(),
  guestDate: z.string(), guestTime: z.string(), guestDuration: z.coerce.number(),
  guestPrice: z.string(), guestRoom: z.string().trim().max(80).default(""),
  confirmMeetingAttended: z.preprocess(v => v === "on" || v === "true", z.boolean()),
});

/** Guest registration creates a contact/profile and one dated visit, never a course sale or enrollment. */
export async function registerGuestStudent(tx: Prisma.TransactionClient, raw: unknown, actor: ErpActor) {
  const input = guestRegistrationSchema.parse(raw);
  assertPermission(actor.permissions, input.leadId ? "crm.lead.convert" : "student.create");
  const booking = singleLessonSchema.parse({ requestId: input.idempotencyKey, fullName: input.fullName, phone: input.phone,
    programId: input.programId, teacherId: input.teacherId, date: input.guestDate, time: input.guestTime,
    duration: input.guestDuration, price: input.guestPrice, room: input.guestRoom });
  const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  await tx.$executeRaw(Prisma.sql`select pg_advisory_xact_lock(hashtextextended(${`guest-registration:${input.idempotencyKey}`}, 0))`);
  const previous = await tx.singleLesson.findUnique({ where: { id: input.idempotencyKey }, include: { student: { select: { managerId: true } } } });
  if (previous) {
    if (previous.createdById !== actor.id || previous.requestHash !== hash) throw new PublicActionError("Təkrar qeydiyyatın məlumatları fərqlidir.", "CONFLICT");
    if (input.leadId) assertCanAccessLead(actor, await tx.lead.findUnique({ where: { id: input.leadId } }), "crm.lead.convert");
    else if (scopeFor(actor.permissions, "student.create") === "ASSIGNED" && previous.student.managerId !== actor.id) throw new PublicActionError("Tələbəyə giriş icazəsi yoxdur.", "FORBIDDEN");
    return { studentId: previous.studentId, lessonId: previous.id };
  }
  assertCreationDatesAllowed([{ label: "Qonaq dərs tarixi", value: booking.date }]);
  const phone = normalizePhone(input.phone);
  if (!phone) throw new PublicActionError("Telefon düzgün deyil.");
  await tx.$executeRaw(Prisma.sql`select pg_advisory_xact_lock(hashtextextended(${`single-lesson-contact:${phone}`}, 0))`);
  const [teacher, program] = await Promise.all([
    tx.teacher.findUnique({ where: { id: booking.teacherId, isActive: true }, select: { id: true } }),
    tx.program.findUnique({ where: { id: booking.programId, isActive: true }, select: { id: true } }),
  ]);
  if (!teacher || !program) throw new PublicActionError("Aktiv müəllim və proqram seçin.");
  const educationLevel = await resolveStudentEducationLevel(tx, input.educationLevel);
  if (input.leadId) await tx.$queryRaw(Prisma.sql`select id from erp.leads where id = ${input.leadId}::uuid for update`);
  const lead = input.leadId ? await tx.lead.findUnique({ where: { id: input.leadId } }) : null;
  if (input.leadId) {
    assertCanAccessLead(actor, lead, "crm.lead.convert");
    if (lead.convertedStudentId || lead.stage === "REGISTERED") throw new PublicActionError("Müraciət artıq qeydiyyata alınıb.", "CONFLICT");
    await resolveRegistrationMeetingAttendance(tx, { leadId: lead.id, actorId: actor.id, confirmMeetingAttended: input.confirmMeetingAttended });
  }
  const duplicate = await tx.student.findFirst({ where: { OR: [
    ...(lead ? [{ contactId: lead.contactId }] : []),
    { contact: { phoneNormalized: phone, fullName: { equals: input.fullName, mode: "insensitive" } } },
  ] }, select: { id: true } });
  if (duplicate) throw new PublicActionError("Bu tələbə artıq mövcuddur. Profilindən qonaq dərs təyin edin.", "CONFLICT");
  const contactData = { fullName: input.fullName, phoneDisplay: input.phone, phoneNormalized: phone, source: input.source ?? lead?.source ?? "Manual", ...(input.email ? { email: input.email } : {}) };
  const contact = lead ? await tx.contact.update({ where: { id: lead.contactId }, data: contactData }) : await tx.contact.create({ data: contactData });
  const [sequence] = await tx.$queryRaw<Array<{ value: bigint }>>(Prisma.sql`select nextval('erp.student_code_seq') value`);
  const today = new Date(currentBakuDateValue());
  const student = await tx.student.create({ data: {
    code: `ART-${String(sequence.value).padStart(4, "0")}`, contactId: contact.id,
    creationIdempotencyKey: input.idempotencyKey, managerId: lead?.managerId ?? actor.id,
    campaignId: lead?.campaignId, educationLevel: educationLevel?.value, notes: input.notes,
    registeredAt: today, lifecycleStatus: "SLOT_WAITING", billingPaused: true, admissionTracking: false,
    statusHistory: { create: { newStatus: "SLOT_WAITING", effectiveAt: today, changedById: actor.id, reason: "Qonaq dərs qeydiyyatı; aktiv aylıq tələbə deyil" } },
  } });
  await assertGuestVisitAvailable(tx, { studentId: student.id, date: booking.date, time: booking.time, duration: booking.duration });
  const lesson = await tx.singleLesson.create({ data: {
    id: input.idempotencyKey, studentId: student.id, teacherId: teacher.id, programId: program.id,
    lessonDate: new Date(booking.date), startTime: booking.time, durationMinutes: booking.duration,
    room: booking.room, price: new Prisma.Decimal(booking.price), requestHash: hash, createdById: actor.id,
  } });
  if (lead) {
    await tx.lead.update({ where: { id: lead.id }, data: { convertedStudentId: student.id, programInterestId: program.id, source: contactData.source, educationLevel: input.educationLevel } });
    await closeConvertedLeadFollowUp(tx, lead.id);
    await writeAuditLog(tx, { actorUserId: actor.id, action: "lead.convert.guest", entityType: "lead", entityId: lead.id,
      before: { convertedStudentId: null, stage: lead.stage }, after: { convertedStudentId: student.id, stage: lead.stage }, reason: "Qonaq dərs qeydiyyatı; satış deyil" });
  }
  await writeAuditLog(tx, { actorUserId: actor.id, action: "student.create.guest", entityType: "student", entityId: student.id,
    after: { lessonId: lesson.id, leadId: lead?.id ?? null, registrationMode: "GUEST", billingPaused: true, active: false }, reason: "Qonaq dərs; aylıq paket və satış yaradılmadı" });
  return { studentId: student.id, lessonId: lesson.id };
}
