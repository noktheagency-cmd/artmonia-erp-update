import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { ErpActor } from "@/server/auth/actor";
import type { PermissionCode } from "@/server/rbac/permissions";
import { currentBakuDateValue } from "@/lib/baku-date";
import { registerGuestStudent } from "./guest-registration-service";
import { bookSingleLesson, markSingleLesson, paySingleLesson } from "./single-lesson-service";
import { currentActiveStudentsSql } from "./active-students-metrics-sql";
import { buildStudentDueDebtValueSql, buildStudentNextPaymentDateSql } from "./student-billing-sql";
import { guestOnlyStudentSql } from "./guest-lesson-sql";
import { resolveStaffSalarySnapshot } from "@/modules/finance/staff-salary";
import { recalculateTeacherPayoutsForMonthInTransaction } from "@/modules/hr/teacher-payroll-service";
import { filteredDailyReportWindow } from "@/modules/dashboard/daily-report-policy";
import { dailyReportSummarySql } from "@/modules/dashboard/daily-report-sql";

test("guest registration, CRM follow-up, irregular visits, isolated totals and both salary modes", { skip: process.env.RUN_SINGLE_LESSON_DB_TESTS !== "1" }, async () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 1 }) });
  const rollback = new Error("synthetic guest rollback");
  try {
    await assert.rejects(prisma.$transaction(async tx => {
      const today = currentBakuDateValue(), date = new Date(today), month = new Date(today.slice(0,7)+"-01");
      const id = randomUUID();
      const user = await tx.user.create({ data: { fullName: "Synthetic guest operator", email: `${id}@example.invalid` } });
      const codes: PermissionCode[] = ["student.create", "student.read", "student.update", "crm.lead.convert", "attendance.manage", "billing.payment.create"];
      const actor = { id: user.id, permissions: new Map(codes.map(code => [code, "ALL" as const])) } as ErpActor;
      const program = await tx.program.create({ data: { name: `Synthetic guest ${id}` } });
      const staticTeacher = await tx.teacher.create({ data: { fullName: `Synthetic static ${id}` } });
      await tx.hrEmployee.create({ data: { teacherId: staticTeacher.id, staffType: "TEACHER", fullName: "Synthetic static", department: "Synthetic", position: "Teacher", hireDate: month, salaryMode: "STATIC", salaryAmount: "625.75" } });
      const percentTeacher = await tx.teacher.create({ data: { fullName: `Synthetic percent ${id}` } });
      await tx.teacherContractRule.create({ data: { teacherId: percentTeacher.id, salaryPercent: 40, validFrom: month, createdById: user.id } });
      const activeCount = async () => (await tx.$queryRaw<Array<{ count: number }>>(Prisma.sql`select ${currentActiveStudentsSql()} as count`))[0].count;
      const beforeActive = await activeCount();
      const base = { idempotencyKey: randomUUID(), programId: program.id, teacherId: staticTeacher.id, fullName: `Synthetic guest ${id}`, phone: "0501234567", guestDate: today, guestTime: "12:00", guestDuration: 60, guestPrice: "25.00" };
      const first = await registerGuestStudent(tx, base, actor);
      assert.deepEqual(await registerGuestStudent(tx, base, actor), first);
      await assert.rejects(registerGuestStudent(tx, { ...base, guestPrice: "30.00" }, actor), /məlumatları fərqlidir/);
      const payment = { lessonId: first.lessonId, requestId: randomUUID(), paidDate: today, method: "CASH" as const };
      await paySingleLesson(tx, payment, actor);
      assert.equal(await tx.teacherPayout.count({ where: { teacherId: staticTeacher.id } }), 0, "prepaid un-attended visit has no teacher pay");
      await markSingleLesson(tx, { lessonId: first.lessonId, status: "ATTENDED" }, actor);
      await markSingleLesson(tx, { lessonId: first.lessonId, status: "ATTENDED" }, actor);
      await paySingleLesson(tx, payment, actor);
      let payout = await tx.teacherPayout.findUniqueOrThrow({ where: { teacherId_periodMonth: { teacherId: staticTeacher.id, periodMonth: month } }, include: { lines: true } });
      assert.equal(payout.payoutAmount.toFixed(2), "8.75"); assert.equal(payout.lines.length, 1); assert.equal(payout.lines[0].enrollmentId, null);
      const salary = await resolveStaffSalarySnapshot(tx, { teacherId: staticTeacher.id, employeeUserId: null }, date);
      assert.equal(salary.salaryCalculatedAmount, 634.5); assert.equal(salary.salaryBaseAmount, 625.75);

      const contact = await tx.contact.create({ data: { fullName: `Synthetic lead ${id}` } });
      const lead = await tx.lead.create({ data: { contactId: contact.id, managerId: user.id, stage: "TRIAL_CONSULTATION", nextFollowUpAt: new Date() } });
      const appointment = await tx.crmAppointment.create({ data: { leadId: lead.id, ownerId: user.id, teacherId: percentTeacher.id, kind: "TRIAL", plannedAt: new Date(), idempotencyKey: randomUUID() } });
      const fromLead = { ...base, idempotencyKey: randomUUID(), leadId: lead.id, fullName: `Synthetic lead ${id}`, teacherId: percentTeacher.id, phone: "0507654321", confirmMeetingAttended: "true" };
      await assert.rejects(registerGuestStudent(tx, { ...fromLead, confirmMeetingAttended: "false" }, actor), /iştirakı təsdiqləyin/);
      const second = await registerGuestStudent(tx, fromLead, actor);
      const converted = await tx.lead.findUniqueOrThrow({ where: { id: lead.id } });
      assert.equal(converted.convertedStudentId, second.studentId); assert.equal(converted.nextFollowUpAt, null);
      assert.notEqual(converted.stage, "REGISTERED");
      assert.equal((await tx.crmAppointment.findUniqueOrThrow({ where: { id: appointment.id } })).outcome, "ATTENDED");
      await markSingleLesson(tx, { lessonId: second.lessonId, status: "ATTENDED" }, actor);
      assert.equal(await tx.teacherPayout.count({ where: { teacherId: percentTeacher.id } }), 0, "unpaid visit has no teacher pay");
      await paySingleLesson(tx, { ...payment, lessonId: second.lessonId, requestId: randomUUID() }, actor);
      const percentPay = await tx.teacherPayout.findUniqueOrThrow({ where: { teacherId_periodMonth: { teacherId: percentTeacher.id, periodMonth: month } } });
      assert.equal(percentPay.payoutAmount.toFixed(2), "10.00");

      // Return two months later: independent visit, no subscription for the missing month.
      const future = new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+2,1)).toISOString().slice(0,10);
      const third = await bookSingleLesson(tx, { requestId: randomUUID(), studentId: first.studentId, programId: program.id, teacherId: staticTeacher.id, date: future, time: "16:00", duration: 90, price: "25.00" }, actor);
      await assert.rejects(bookSingleLesson(tx, { requestId: randomUUID(), studentId: first.studentId, programId: program.id, teacherId: staticTeacher.id, date: future, time: "16:30", duration: 60, price: "25.00" }, actor), /həmin vaxtda/);
      await paySingleLesson(tx, { ...payment, lessonId: third.id, requestId: randomUUID() }, actor);
      const ids = [first.studentId, second.studentId];
      assert.equal(await tx.enrollment.count({ where: { studentId: { in: ids } } }), 0);
      assert.equal(await tx.courseSale.count({ where: { studentId: { in: ids } } }), 0);
      assert.equal(await tx.studentBillingCycle.count({ where: { studentId: { in: ids } } }), 0);
      assert.equal(await activeCount(), beforeActive);
      const [guest] = await tx.$queryRaw<Array<{ guest: boolean; next: Date | null; debt: Prisma.Decimal }>>(Prisma.sql`select ${guestOnlyStudentSql(Prisma.sql`${first.studentId}::uuid`)} as guest, ${buildStudentNextPaymentDateSql(Prisma.sql`${first.studentId}::uuid`)} as next, ${buildStudentDueDebtValueSql({ studentId: Prisma.sql`${first.studentId}::uuid`, asOfDate: date })} as debt`);
      assert.equal(guest.guest, true); assert.equal(guest.next, null); assert.equal(Number(guest.debt), 0);
      const [report] = await tx.$queryRaw<Array<{ sales: number; payments: string; oneOff: string }>>(dailyReportSummarySql(filteredDailyReportWindow({ from: today, to: today, managerId: user.id })));
      assert.equal(report.sales, 0); assert.equal(Number(report.payments), 0); assert.equal(Number(report.oneOff), 75);

      // Recalculation is repeatable; approved money and manual adjustments are preserved.
      await tx.teacherPayout.update({ where: { id: payout.id }, data: { adjustmentAmount: "3.25" } });
      await recalculateTeacherPayoutsForMonthInTransaction(tx, month, user.id, [staticTeacher.id]);
      payout = await tx.teacherPayout.findUniqueOrThrow({ where: { id: payout.id }, include: { lines: true } });
      assert.equal(payout.payoutAmount.toFixed(2), "8.75"); assert.equal(payout.adjustmentAmount.toFixed(2), "3.25"); assert.equal(payout.lines.length, 1);
      await tx.teacherPayout.update({ where: { id: percentPay.id }, data: { status: "APPROVED" } });
      await tx.teacherContractRule.updateMany({ where: { teacherId: percentTeacher.id }, data: { salaryPercent: 50 } });
      await recalculateTeacherPayoutsForMonthInTransaction(tx, month, user.id, [percentTeacher.id]);
      assert.equal((await tx.teacherPayout.findUniqueOrThrow({ where: { id: percentPay.id } })).payoutAmount.toFixed(2), "10.00");
      throw rollback;
    }, { timeout: 60000 }), error => error === rollback);
  } finally { await prisma.$disconnect(); }
});
