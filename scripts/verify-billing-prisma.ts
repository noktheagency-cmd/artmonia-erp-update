import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { Prisma } from "../src/generated/prisma/client";
import { getPrisma } from "../src/server/db/prisma";
import {
  applyDeadlineRule,
  previewDeadlineRule,
} from "../src/modules/students/billing-deadline-service";
import { changeReservedFreeze } from "../src/modules/students/reserved-freeze-service";
import { ensureStudentMonthlyInvoicesForPeriod } from "../src/modules/students/monthly-invoice-service";
import { currentBakuDateValue } from "../src/modules/students/payment-date-policy";
config({ path: ".env.local", quiet: true });
const db = getPrisma(),
  studentId = randomUUID(),
  enrollmentId = randomUUID();
const rollback = new Error("EXPECTED_QA_ROLLBACK");
const actorId = "d0fb9ad2-ec06-4bc6-8dc9-5c037775486a";
try {
  await db.$transaction(
    async (tx) => {
      const [source] = await tx.$queryRaw<
        Array<{ id: string; enrollment: string; assignment: string }>
      >(Prisma.sql`
      select s.id,e.id enrollment,a.id assignment from erp.students s join erp.enrollments e on e.student_id=s.id
      join erp.student_schedule_assignments a on a.enrollment_id=e.id where s.lifecycle_status='ACTIVE' and e.status='ACTIVE' and a.valid_to is null limit 1
    `);
      await tx.$executeRaw(Prisma.sql`insert into erp.students select (jsonb_populate_record(null::erp.students,to_jsonb(s)||jsonb_build_object(
      'id',${studentId}::text,'code',${`QA-PRISMA-${studentId}`}::text,'creation_idempotency_key',null,'is_test_data',true,
      'freeze_reserved',false,'billing_paused',false,'billing_anchor_date','2026-01-04','original_first_lesson_at','2026-01-04'))).* from erp.students s where id=${source.id}::uuid`);
      await tx.$executeRaw(Prisma.sql`insert into erp.enrollments select (jsonb_populate_record(null::erp.enrollments,to_jsonb(e)||jsonb_build_object(
      'id',${enrollmentId}::text,'student_id',${studentId}::text,'first_lesson_at','2026-01-04','start_date','2026-01-04'))).* from erp.enrollments e where id=${source.enrollment}::uuid`);
      await tx.$executeRaw(Prisma.sql`insert into erp.student_schedule_assignments select (jsonb_populate_record(null::erp.student_schedule_assignments,to_jsonb(a)||jsonb_build_object(
      'id',${randomUUID()}::text,'enrollment_id',${enrollmentId}::text))).* from erp.student_schedule_assignments a where id=${source.assignment}::uuid`);
      await ensureStudentMonthlyInvoicesForPeriod(tx, {
        studentId,
        requestedPeriodMonth: new Date("2026-09-01"),
        asOfDate: new Date(currentBakuDateValue()),
      });
      const original = await tx.invoice.findFirstOrThrow({
        where: { studentId, periodMonth: new Date("2026-09-01") },
      });
      const input = {
        studentId,
        requestId: randomUUID(),
        mode: "FROM_MONTH" as const,
        month: "2026-09",
        day: 25,
        reason: "Rollback actual Prisma integration",
      };
      await applyDeadlineRule(
        tx,
        input,
        actorId,
        (await previewDeadlineRule(tx, input)).fingerprint,
      );
      await ensureStudentMonthlyInvoicesForPeriod(tx, {
        studentId,
        requestedPeriodMonth: new Date("2026-09-01"),
        asOfDate: new Date(currentBakuDateValue()),
      });
      const changed = await tx.invoice.findUniqueOrThrow({
        where: { id: original.id },
      });
      assert.equal(changed.dueDate.toISOString().slice(0, 10), "2026-09-25");
      assert.equal(changed.amount.toString(), original.amount.toString());
      assert.equal(
        changed.balanceDue.toString(),
        original.balanceDue.toString(),
      );
      const slotsBefore = await tx.studentScheduleAssignment.findMany({
        where: { enrollmentId },
      });
      await changeReservedFreeze(tx, {
        studentId,
        actorId,
        reserve: true,
        effectiveAt: new Date(currentBakuDateValue() + "T00:00:00Z"),
        note: "Rollback reserve",
      });
      await ensureStudentMonthlyInvoicesForPeriod(tx, {
        studentId,
        requestedPeriodMonth: new Date("2026-10-01"),
        asOfDate: new Date(currentBakuDateValue()),
      });
      const reserveInvoice = await tx.invoice.findFirstOrThrow({
        where: { studentId, periodMonth: new Date("2026-10-01") },
      });
      assert.equal(
        reserveInvoice.dueDate.toISOString().slice(0, 10),
        "2026-10-25",
      );
      assert.ok(
        reserveInvoice.balanceDue.gt(0),
        "reservation is not automatically paid",
      );
      // Exercise payment allocations on a reserved student; the same invoice trigger is used by payment acceptance.
      const payment = await tx.payment.create({
        data: {
          studentId,
          amount: reserveInvoice.amount,
          paidAt: new Date(currentBakuDateValue()),
          paymentMonth: new Date("2026-10-01"),
          method: "CASH",
          scheduleType: "MONTHLY",
          createdById: actorId,
          idempotencyKey: randomUUID(),
        },
      });
      await tx.paymentAllocation.create({
        data: {
          paymentId: payment.id,
          invoiceId: reserveInvoice.id,
          amountAllocated: reserveInvoice.amount,
        },
      });
      await tx.invoice.update({
        where: { id: reserveInvoice.id },
        data: { balanceDue: 0, status: "PAID" },
      });
      const paidBefore = await tx.payment.findUniqueOrThrow({
        where: { id: payment.id },
      });
      const historical = {
        ...input,
        requestId: randomUUID(),
        mode: "ONLY_MONTH" as const,
        month: "2026-10",
        day: 18,
      };
      await applyDeadlineRule(
        tx,
        historical,
        actorId,
        (await previewDeadlineRule(tx, historical)).fingerprint,
      );
      assert.deepEqual(
        await tx.payment.findUniqueOrThrow({ where: { id: payment.id } }),
        paidBefore,
        "deadline cannot rewrite a received payment",
      );
      assert.equal(
        (
          await tx.invoice.findUniqueOrThrow({
            where: { id: reserveInvoice.id },
          })
        ).status,
        "PAID",
      );
      await changeReservedFreeze(tx, {
        studentId,
        actorId,
        reserve: false,
        effectiveAt: new Date(currentBakuDateValue() + "T00:00:00Z"),
        note: "Rollback resume",
      });
      assert.deepEqual(
        await tx.studentScheduleAssignment.findMany({
          where: { enrollmentId },
        }),
        slotsBefore,
      );
      assert.equal(
        (await tx.student.findUniqueOrThrow({ where: { id: studentId } }))
          .lifecycleStatus,
        "ACTIVE",
      );
      console.log(
        "PASS: real Prisma services, date edits and payment receipt during reserved freeze; allocations and slot data preserved",
      );
      throw rollback;
    },
    { timeout: 30000 },
  );
} catch (error) {
  if (error !== rollback) throw error;
} finally {
  await db.$disconnect();
}
console.log("PASS: all Prisma fixtures rolled back");
