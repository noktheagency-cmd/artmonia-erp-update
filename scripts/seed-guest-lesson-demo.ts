/** Owner-authorized guest fixtures. Default: execute in a transaction and roll back.
 * Apply: node --import tsx scripts/seed-guest-lesson-demo.ts --apply
 * Only the explicitly selected Vercel database is accepted. No real receipts/payroll.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../src/generated/prisma/client";
import { GUEST_DEMO_MARKER, visibleGuestStudentWhere } from "../src/modules/students/guest-demo-policy";
import { bookSingleLesson, paySingleLesson, markSingleLesson } from "../src/modules/students/single-lesson-service";
import { queryGuestLessonPayrollLines } from "../src/modules/hr/guest-lesson-payroll";
import type { ErpActor } from "../src/server/auth/actor";
import type { PermissionCode } from "../src/server/rbac/permissions";

const config = parse(readFileSync(".env.local"));
const connectionString = config.DIRECT_URL || config.DATABASE_URL;
if (!connectionString) throw new Error("Missing identified Vercel connection");
const target = "xgxlwbqaojbptrgosxtj", url = new URL(connectionString);
if (!(url.hostname === `db.${target}.supabase.co` ||
  (decodeURIComponent(url.username) === `postgres.${target}` && url.hostname.endsWith(".pooler.supabase.com")))) {
  throw new Error("Guest demos are only authorized in the identified Vercel database");
}
const operation = "guest-lesson-demo-2026-10-26";
const stableId = (key: string) => {
  const hex = createHash("sha256").update(`${operation}:${key}`).digest("hex");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`;
};
const fixtures = [
  { name: "Mina Həsənli", code: "GUEST-DEMO-01" },
  { name: "Rauf Quliyev", code: "GUEST-DEMO-02" },
  { name: "Leyla İsmayılova", code: "GUEST-DEMO-03" },
];
const visits = [
  { student: 0, date: "2026-10-26", time: "12:00", price: "25.00", attended: true },
  { student: 1, date: "2026-10-27", time: "15:00", price: "30.00", attended: false },
  { student: 2, date: "2026-10-28", time: "17:00", price: "20.00", attended: false },
  { student: 0, date: "2026-12-01", time: "16:00", price: "25.00", attended: false },
];
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 1 }) });
const rollback = new Error("dry-run rollback");
const apply = process.argv.includes("--apply");
let result: unknown;
try {
  await prisma.$transaction(async tx => {
    await tx.$executeRaw(Prisma.sql`select pg_advisory_xact_lock(hashtextextended(${operation},0))`);
    const operatorId = stableId("operator");
    const email = "guest-demo-operator@example.invalid";
    const operator = await tx.user.findUnique({ where: { id: operatorId } });
    if (operator) assert.ok(operator.email === email && !operator.isActive && !operator.authUserId);
    else await tx.user.create({ data: { id: operatorId, fullName: "Qonaq dərs test operatoru", email, isActive: false } });
    // No auth account or roles: this technical identity only attributes the test records.
    assert.equal(await tx.userRole.count({ where: { userId: operatorId } }), 0);
    const permissions: PermissionCode[] = ["student.update", "student.read", "billing.payment.create", "attendance.manage"];
    const actor = { id: operatorId, permissions: new Map(permissions.map(p => [p, "ALL" as const])) } as ErpActor;
    const teachers = (await tx.teacher.findMany({
      where: { isActive: true, enrollments: { some: { program: { isActive: true } } } },
      orderBy: { fullName: "asc" }, take: 3,
      select: { id: true, enrollments: { where: { program: { isActive: true } }, orderBy: { startDate: "desc" }, take: 1, select: { programId: true } } },
    }));
    assert.ok(teachers.length > 0, "An existing active teacher/program pair is required");
    const payrollBefore = await tx.teacherPayout.findMany({ where: { teacherId: { in: teachers.map(t => t.id) } }, orderBy: { id: "asc" } });
    const realBefore = await tx.$queryRaw(Prisma.sql`select
      (select count(*) from erp.students where not is_test_data and lifecycle_status='ACTIVE') as active,
      (select count(*) from erp.course_sales) as sales,
      (select coalesce(sum(p.amount),0) from erp.payments p join erp.students s on s.id=p.student_id where not s.is_test_data) as receipts`);
    for (const fixture of fixtures) {
      const id = stableId(fixture.code);
      const existing = await tx.student.findUnique({ where: { code: fixture.code }, include: { contact: true } });
      if (existing) {
        assert.ok(existing.id === id && existing.isTestData && existing.notes?.startsWith(GUEST_DEMO_MARKER));
        assert.equal(existing.contact.fullName, fixture.name);
        continue;
      }
      const contact = await tx.contact.create({ data: { id: stableId(`${fixture.code}:contact`), fullName: fixture.name,
        source: "Guest lesson demo", notes: "Uydurma şəxs; istifadəçinin istəyi ilə test üçün yaradılıb. Əlaqə nömrəsi yoxdur." } });
      await tx.student.create({ data: { id, code: fixture.code, contactId: contact.id, registeredAt: new Date("2026-10-26"),
        lifecycleStatus: "SLOT_WAITING", billingPaused: true, admissionTracking: false, isTestData: true,
        notes: `${GUEST_DEMO_MARKER} ${operation}; uydurma şəxs, test ödənişi; real gəlir və maaşa daxil deyil.` } });
      await tx.studentStatusHistory.create({ data: { studentId: id, newStatus: "SLOT_WAITING", effectiveAt: new Date("2026-10-26"), changedById: operatorId, reason: "Qonaq dərs demo profili; aktiv tələbə və satış deyil" } });
      await tx.auditLog.create({ data: { actorUserId: operatorId, action: `${operation}.student`, entityType: "student", entityId: id,
        afterJson: { code: fixture.code, isTestData: true, operator: "Codex / explicit user request", fictional: true }, reason: "İstifadəçinin istəyi ilə qonaq dərs axını üçün görünən test qeydi" } });
    }
    for (const [index, visit] of visits.entries()) {
      const teacher = teachers[visit.student % teachers.length];
      const lessonId = stableId(`visit:${index}`);
      const prior = await tx.singleLesson.findUnique({ where: { id: lessonId } });
      if (prior) {
        assert.equal(prior.studentId, stableId(fixtures[visit.student].code));
        assert.equal(prior.createdById, operatorId);
        continue; // Never overwrite a demo that the user has already interacted with.
      }
      await bookSingleLesson(tx, { requestId: lessonId, studentId: stableId(fixtures[visit.student].code),
        teacherId: teacher.id, programId: teacher.enrollments[0].programId,
        date: visit.date, time: visit.time, duration: 60, room: "Test zona", price: visit.price }, actor);
      await paySingleLesson(tx, { lessonId, requestId: stableId(`payment:${index}`), paidDate: "2026-10-26", method: "CASH" }, actor);
      if (visit.attended) await markSingleLesson(tx, { lessonId, status: "ATTENDED" }, actor);
      const lesson = await tx.singleLesson.findUniqueOrThrow({ where: { id: lessonId } });
      await tx.payment.update({ where: { id: lesson.paymentId! }, data: { note: `${GUEST_DEMO_MARKER} Simulyasiya ödənişi; real pul qəbul edilməyib.`, receiptReference: `DEMO-${index + 1}` } });
    }
    const ids = fixtures.map(f => stableId(f.code));
    assert.equal(await tx.student.count({ where: { AND: [{ id: { in: ids } }, visibleGuestStudentWhere()] } }), 3);
    assert.equal(await tx.enrollment.count({ where: { studentId: { in: ids } } }), 0);
    assert.equal(await tx.courseSale.count({ where: { studentId: { in: ids } } }), 0);
    assert.equal(await tx.studentBillingCycle.count({ where: { studentId: { in: ids } } }), 0);
    assert.equal(await tx.invoice.count({ where: { studentId: { in: ids }, balanceDue: { gt: 0 } } }), 0);
    const records = await tx.singleLesson.findMany({ where: { studentId: { in: ids } }, include: { payment: true }, orderBy: [{ lessonDate: "asc" }, { id: "asc" }] });
    assert.ok(records.length >= 4 && records.every(r => r.payment?.receiptPurpose === "ONE_OFF"));
    const eligible = await queryGuestLessonPayrollLines(tx, new Date("2026-10-01"), teachers.map(t => t.id));
    assert.ok(!eligible.some(line => records.some(r => r.paymentId === line.paymentId)));
    assert.deepEqual(await tx.teacherPayout.findMany({ where: { teacherId: { in: teachers.map(t => t.id) } }, orderBy: { id: "asc" } }), payrollBefore);
    assert.deepEqual(await tx.$queryRaw(Prisma.sql`select
      (select count(*) from erp.students where not is_test_data and lifecycle_status='ACTIVE') as active,
      (select count(*) from erp.course_sales) as sales,
      (select coalesce(sum(p.amount),0) from erp.payments p join erp.students s on s.id=p.student_id where not s.is_test_data) as receipts`), realBefore);
    result = { project: target, applied: apply, students: fixtures, lessons: records.length,
      paidDemoAmount: records.reduce((sum,r) => sum.add(r.price), new Prisma.Decimal(0)).toFixed(2),
      realReceiptsUnchanged: true, payrollUnchanged: true, activeStudentsUnchanged: true, salesUnchanged: true };
    if (!apply) throw rollback;
  }, { timeout: 60000 });
} catch (error) {
  if (error !== rollback) throw error;
} finally { await prisma.$disconnect(); }
console.log(JSON.stringify(result, null, 2));
