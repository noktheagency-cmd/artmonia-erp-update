import { createHash } from "node:crypto";
import { LessonStatus, Prisma } from "@/generated/prisma/client";
import type { ErpActor } from "@/server/auth/actor";
import { scopeFor, type PermissionCode } from "@/server/rbac/permissions";
import { PublicActionError } from "@/server/actions/public-action-error";
import { writeAuditLog } from "@/modules/audit/audit-service";
import { normalizePhone } from "@/modules/crm/duplicate-phone";
import { assertCreationDatesAllowed } from "@/modules/shared/creation-date-policy";
import { currentBakuDateValue, parsePaymentDateInput } from "./payment-date-policy";
import { assertSingleLessonAttendance, singleLessonSchema } from "./single-lesson-policy";
import { recalculateTeacherPayoutsForMonthInTransaction } from "@/modules/hr/teacher-payroll-service";
import { assertGuestVisitAvailable } from "./guest-visit-scheduling";

type Actor = Pick<ErpActor, "id" | "permissions">;
function requirePermission(actor: Actor, permission: PermissionCode) {
  if (!actor.permissions.has(permission)) throw new PublicActionError("Bu əməliyyat üçün icazəniz yoxdur.", "FORBIDDEN");
}
function assertStudentScope(actor: Actor, managerId: string | null, permission: PermissionCode) {
  requirePermission(actor, permission);
  if (scopeFor(actor.permissions, permission) === "ASSIGNED" && managerId !== actor.id) {
    throw new PublicActionError("Bu tələbə üzrə icazəniz yoxdur.", "FORBIDDEN");
  }
}
export async function bookSingleLesson(tx: Prisma.TransactionClient, raw: unknown, actor: Actor) {
  const input = singleLessonSchema.parse(raw);
  requirePermission(actor, input.studentId ? "student.update" : "student.create");
  const requestHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  await tx.$executeRaw(Prisma.sql`select pg_advisory_xact_lock(hashtextextended(${`single-lesson:${input.requestId}`},0))`);
  const previous = await tx.singleLesson.findUnique({ where: { id: input.requestId } });
  if (previous) {
    if (previous.createdById !== actor.id || previous.requestHash !== requestHash) {
      throw new PublicActionError("Təkrar əməliyyatın məlumatları fərqlidir.", "CONFLICT");
    }
    const student = await tx.student.findUnique({where:{id:previous.studentId},select:{managerId:true}});
    if (!student) throw new PublicActionError("Tələbə tapılmadı.","NOT_FOUND");
    assertStudentScope(actor,student.managerId,input.studentId ? "student.update" : "student.read");
    return previous;
  }
  assertCreationDatesAllowed([{ label: "Dərs tarixi", value: input.date }]);
  const [teacher, program] = await Promise.all([
    tx.teacher.findUnique({ where: { id: input.teacherId, isActive: true }, select: { id: true } }),
    tx.program.findUnique({ where: { id: input.programId, isActive: true }, select: { id: true } }),
  ]);
  if (!teacher || !program) throw new PublicActionError("Aktiv müəllim və proqram seçin.");
  let student;
  if (input.studentId) {
    await tx.$queryRaw(Prisma.sql`select id from erp.students where id=${input.studentId}::uuid for update`);
    student = await tx.student.findUnique({ where: { id: input.studentId }, select: { id: true, managerId: true } });
    if (!student) throw new PublicActionError("Tələbə tapılmadı.", "NOT_FOUND");
    assertStudentScope(actor, student.managerId, "student.update");
  } else {
    const phone = normalizePhone(input.phone!);
    if (!phone) throw new PublicActionError("Telefon düzgün deyil.");
    await tx.$executeRaw(Prisma.sql`select pg_advisory_xact_lock(hashtextextended(${`single-lesson-contact:${phone}`},0))`);
    const duplicate = await tx.student.findFirst({ where: { contact: { phoneNormalized: phone, fullName: { equals: input.fullName!, mode: "insensitive" } } }, select: { id: true } });
    if (duplicate) throw new PublicActionError("Bu tələbə artıq mövcuddur. Axtarışdan mövcud profili seçin.", "CONFLICT");
    const [code] = await tx.$queryRaw<Array<{ value: bigint }>>(Prisma.sql`select nextval('erp.student_code_seq') value`);
    if (!code) throw new PublicActionError("Tələbə kodu yaradıla bilmədi.");
    const contact = await tx.contact.create({ data: { fullName: input.fullName!, phoneDisplay: input.phone!, phoneNormalized: phone, source: "Manual" } });
    student = await tx.student.create({ data: {
      code: `ART-${String(code.value).padStart(4,"0")}`, contactId: contact.id, managerId: actor.id,
      registeredAt: new Date(currentBakuDateValue()), billingPaused: true, lifecycleStatus: "SLOT_WAITING",
    }, select: { id: true, managerId: true } });
    await tx.studentStatusHistory.create({ data: { studentId: student.id, newStatus: "SLOT_WAITING", effectiveAt: new Date(currentBakuDateValue()), changedById: actor.id, reason: "Birdəfəlik dərs üçün profil yaradıldı; aylıq tədris başlamayıb" } });
    await writeAuditLog(tx, { actorUserId: actor.id, action: "student.create", entityType: "student", entityId: student.id,
      after: { registrationMode: "SINGLE_LESSON", lifecycleStatus: "SLOT_WAITING", billingPaused: true }, reason: "Birdəfəlik dərs üçün profil yaradıldı; aylıq paket açılmadı" });
  }
  await assertGuestVisitAvailable(tx, { studentId: student.id, date: input.date, time: input.time, duration: input.duration });
  const lesson = await tx.singleLesson.create({ data: {
    id: input.requestId, requestHash, studentId: student.id, teacherId: teacher.id, programId: program.id,
    lessonDate: new Date(input.date), startTime: input.time, durationMinutes: input.duration,
    room: input.room, price: new Prisma.Decimal(input.price), createdById: actor.id,
  } });
  await writeAuditLog(tx, { actorUserId: actor.id, action: "student.single_lesson.book", entityType: "single_lesson", entityId: lesson.id,
    after: { studentId: student.id, date: input.date, time: input.time, price: input.price, teacherId: teacher.id, programId: program.id }, reason: "Ayrıca dərs təyin edildi; aylıq dövr yaradılmadı" });
  return lesson;
}

async function lockedLesson(tx: Prisma.TransactionClient, lessonId: string) {
  // Same parent-first order as regular payments, attendance and student lifecycle writes.
  const target = await tx.singleLesson.findUnique({ where: { id: lessonId }, select: { studentId: true } });
  if (!target) throw new PublicActionError("Dərs tapılmadı.", "NOT_FOUND");
  await tx.$queryRaw(Prisma.sql`select id from erp.students where id=${target.studentId}::uuid for update`);
  await tx.$queryRaw(Prisma.sql`select id from erp.single_lessons where id=${lessonId}::uuid for update`);
  return tx.singleLesson.findUniqueOrThrow({ where: { id: lessonId }, include: {
    student: { select: { managerId: true } }, teacher: { select: { userId: true } }, payment: true,
  } });
}
async function ensureSingleLessonInvoice(tx: Prisma.TransactionClient, lesson: { id: string; studentId: string; lessonDate: Date; price: Prisma.Decimal; invoiceId: string | null }) {
  if (lesson.invoiceId) return lesson.invoiceId;
  const invoice = await tx.invoice.create({ data: {
    studentId: lesson.studentId, enrollmentId: null, periodMonth: new Date(`${lesson.lessonDate.toISOString().slice(0,7)}-01`),
    issueDate: lesson.lessonDate, dueDate: lesson.lessonDate, amount: lesson.price, balanceDue: lesson.price,
    status: "OPEN", idempotencyKey: `single-lesson:${lesson.id}`,
  } });
  await tx.singleLesson.update({ where: { id: lesson.id }, data: { invoiceId: invoice.id } });
  return invoice.id;
}
export async function markSingleLesson(tx: Prisma.TransactionClient, input: { lessonId: string; status: "ATTENDED" | "ABSENT" | "CANCELLED" }, actor: Actor) {
  requirePermission(actor, "attendance.manage");
  const lesson = await lockedLesson(tx, input.lessonId);
  if (scopeFor(actor.permissions, "attendance.manage") === "ASSIGNED" && lesson.teacher.userId !== actor.id) {
    throw new PublicActionError("Yalnız öz dərsinizin iştirakını qeyd edə bilərsiniz.", "FORBIDDEN");
  }
  assertSingleLessonAttendance(lesson.status, input.status, lesson.lessonDate.toISOString().slice(0,10), currentBakuDateValue());
  if (lesson.status === input.status) return;
  if (input.status === "CANCELLED" && lesson.paymentId) throw new PublicActionError("Ödənişli dərsin ləğvi üçün əvvəl maliyyə düzəlişi edilməlidir.");
  if (input.status === "ATTENDED") await ensureSingleLessonInvoice(tx, lesson);
  await tx.singleLesson.update({ where: { id: lesson.id }, data: { status: input.status } });
  if (input.status === "ATTENDED" && lesson.payment) {
    await recalculateTeacherPayoutsForMonthInTransaction(tx, lesson.payment.paymentMonth, actor.id, [lesson.teacherId]);
  }
  await writeAuditLog(tx, { actorUserId: actor.id, action: "student.single_lesson.attendance", entityType: "single_lesson", entityId: lesson.id,
    before: { status: lesson.status }, after: { status: input.status }, reason: "Birdəfəlik dərs davamiyyəti qeyd edildi; aylıq status dəyişmədi" });
}
export async function paySingleLesson(tx: Prisma.TransactionClient, input: { lessonId: string; requestId: string; paidDate: string; method: "CASH" | "CARD" | "BANK_TRANSFER" }, actor: Actor) {
  requirePermission(actor, "billing.payment.create");
  const lesson = await lockedLesson(tx, input.lessonId);
  assertStudentScope(actor, lesson.student.managerId, "student.read");
  if (lesson.payment) {
    if (lesson.payment.idempotencyKey === input.requestId && lesson.payment.method === input.method
      && lesson.payment.paidAt.toISOString().slice(0,10) === input.paidDate) return;
    throw new PublicActionError("Bu dərsin ödənişi artıq qeydə alınıb.", "CONFLICT");
  }
  if (lesson.status === LessonStatus.CANCELLED || lesson.status === LessonStatus.ABSENT) throw new PublicActionError("Ləğv edilmiş və ya iştirak edilməmiş dərs üçün ödəniş qəbul edilmir.");
  const paidAt = parsePaymentDateInput(input.paidDate);
  assertCreationDatesAllowed([{ label: "Ödəniş tarixi", value: input.paidDate }]);
  const invoiceId = await ensureSingleLessonInvoice(tx, lesson);
  const payment = await tx.payment.create({ data: {
    studentId: lesson.studentId, amount: lesson.price, paidAt, paymentMonth: new Date(`${lesson.lessonDate.toISOString().slice(0,7)}-01`),
    scheduleType: "ONE_TIME", receiptPurpose: "ONE_OFF", method: input.method, nextPaymentAt: null,
    idempotencyKey: input.requestId, createdById: actor.id,
  } });
  await tx.paymentAllocation.create({ data: { paymentId: payment.id, invoiceId, amountAllocated: lesson.price, mode: "SELECTED_INVOICE" } });
  await tx.invoice.update({ where: { id: invoiceId }, data: { balanceDue: 0, status: "PAID" } });
  await tx.singleLesson.update({ where: { id: lesson.id }, data: { paymentId: payment.id } });
  if (lesson.status === "ATTENDED") {
    await recalculateTeacherPayoutsForMonthInTransaction(tx, payment.paymentMonth, actor.id, [lesson.teacherId]);
  }
  await writeAuditLog(tx, { actorUserId: actor.id, action: "student.single_lesson.payment", entityType: "single_lesson", entityId: lesson.id,
    after: { paymentId: payment.id, invoiceId, amount: lesson.price.toFixed(2), paidDate: input.paidDate, method: input.method }, reason: "Yalnız bu dərsin ödənişi; aylıq borc və satış yaratmır" });
}
