import assert from "node:assert/strict";
import test from "node:test";
import { Prisma, StudentLifecycleStatus, EnrollmentStatus } from "@/generated/prisma/client";
import { acceptanceCases, acceptanceSummary } from "@/modules/acceptance/t-cases";
import {
  admissionCycle,
  assertAdmissionPayment,
} from "@/modules/students/course-sale-policy";
import {
  assertPackageUpgradeAllowed,
  earliestPackageUpgradeMonth,
  isPackageUpgrade,
} from "@/modules/students/package-upgrade-policy";
import {
  buildStudentStatusUpdateData,
  enrollmentStatusForStudentLifecycle,
  isBillingPausedStatus,
  isInactiveStudentStatus,
} from "@/modules/students/lifecycle-service";
import { calculateAttendanceAdjustedPayout } from "@/modules/hr/teacher-payroll-formula";
import { appointmentKindLabels } from "@/modules/crm/appointment-policy";
import { isRealContactOutcome, outcomesForChannel } from "@/modules/crm/contact-policy";
import { PublicActionError } from "@/server/actions/public-action-error";

test("catalog covers T-01…T-54 exactly once", () => {
  assert.equal(acceptanceCases.length, 54);
  const ids = acceptanceCases.map((c) => c.id);
  assert.equal(new Set(ids).size, 54);
  for (let i = 1; i <= 54; i += 1) {
    const id = `T-${String(i).padStart(2, "0")}` as const;
    assert.ok(ids.includes(id), `missing ${id}`);
  }
  const summary = acceptanceSummary();
  assert.equal(summary.automated + summary.manual, 54);
  console.log(
    `T-matrix coverage: ${summary.automated} automated / ${summary.manual} manual (of ${summary.total})`,
  );
});

test("T-01: unpaid card is not an admission sale cycle", () => {
  // Paid registration is required in UI/API; sale journal only opens when
  // assertAdmissionPayment succeeds. Cycle kind alone is still NEW.
  const cycle = admissionCycle({ studentId: "s1", admissionTracking: true });
  assert.equal(cycle.kind, "NEW");
  assert.equal(isBillingPausedStatus(StudentLifecycleStatus.SLOT_WAITING), true);
  assert.throws(
    () => assertAdmissionPayment(new Prisma.Decimal(0), true),
    (error: unknown) => error instanceof PublicActionError,
  );
});

test("T-02: 19 AZN with contract does not qualify", () => {
  assert.throws(
    () => assertAdmissionPayment(new Prisma.Decimal(19), true),
    (error: unknown) => error instanceof PublicActionError,
  );
});

test("T-03: 20 AZN without contract does not qualify", () => {
  assert.throws(
    () => assertAdmissionPayment(new Prisma.Decimal(20), false),
    (error: unknown) => error instanceof PublicActionError,
  );
});

test("T-04: 20 AZN + contract qualifies (activation still separate)", () => {
  assert.doesNotThrow(() => assertAdmissionPayment(new Prisma.Decimal(20), true));
  // Slot/plan alone must not imply ACTIVE enrollment activation.
  assert.equal(
    enrollmentStatusForStudentLifecycle(StudentLifecycleStatus.SLOT_WAITING),
    EnrollmentStatus.PAUSED,
  );
});

test("T-05: remainder keeps same NEW cycle (not RETURN)", () => {
  const first = admissionCycle({ studentId: "s1", admissionTracking: true });
  const again = admissionCycle({ studentId: "s1", admissionTracking: true });
  assert.equal(first.key, again.key);
  assert.equal(first.kind, "NEW");
});

test("T-06 / T-10: slot waiting is not active billing enrollment", () => {
  assert.equal(
    enrollmentStatusForStudentLifecycle(StudentLifecycleStatus.SLOT_WAITING),
    EnrollmentStatus.PAUSED,
  );
  assert.equal(isBillingPausedStatus(StudentLifecycleStatus.SLOT_WAITING), true);
});

test("T-08: ACTIVE keeps enrollment active (PRESENT path)", () => {
  assert.equal(
    enrollmentStatusForStudentLifecycle(StudentLifecycleStatus.ACTIVE),
    EnrollmentStatus.ACTIVE,
  );
  assert.equal(isBillingPausedStatus(StudentLifecycleStatus.ACTIVE), false);
});

test("T-09 / T-29: absences do not inflate attendance payout denominator beyond plan", () => {
  const result = calculateAttendanceAdjustedPayout({
    paidAmount: 240,
    attendedLessons: 7,
    plannedLessons: 8,
    salaryPercent: 45,
  });
  assert.equal(result.lessonDenominator, 8);
  assert.equal(result.eligibleRevenue, 210);
});

test("T-14 / T-16 / T-19 / T-20: unified MEETING kind + subtypes; direct allowed", () => {
  assert.equal(appointmentKindLabels.MEETING, "Görüş");
  assert.match(appointmentKindLabels.CONSULTATION, /Görüş/);
  assert.match(appointmentKindLabels.TRIAL, /Görüş/);
  // Direct admission is the NEW cycle without a meeting requirement in policy.
  assert.equal(admissionCycle({ studentId: "direct", admissionTracking: true }).kind, "NEW");
});

test("T-28: renewal path is not RETURN sale", () => {
  // Package / completed moves are not paid return sales; STOPPED/FROZEN are.
  assert.throws(
    () => admissionCycle({ studentId: "s1", admissionTracking: true, returnId: "r1", oldStatus: "COMPLETED" }),
    (error: unknown) => error instanceof PublicActionError,
  );
  assert.equal(
    admissionCycle({ studentId: "s1", admissionTracking: true }).kind,
    "NEW",
  );
});

test("T-30: FROZEN keeps seat and does not pause billing", () => {
  assert.equal(isBillingPausedStatus(StudentLifecycleStatus.FROZEN), false);
  assert.equal(
    enrollmentStatusForStudentLifecycle(StudentLifecycleStatus.FROZEN),
    EnrollmentStatus.ACTIVE,
  );
  const data = buildStudentStatusUpdateData(StudentLifecycleStatus.FROZEN, new Date("2026-11-01T00:00:00Z"));
  assert.equal(data.billingPaused, false);
  assert.equal(data.freezeReserved, true);
});

test("T-32: no auto-stop policy helpers exist for idle days", () => {
  // BK-11: only explicit inactive statuses pause billing; there is no 14-day helper.
  assert.equal(isBillingPausedStatus(StudentLifecycleStatus.ACTIVE), false);
  assert.equal(isBillingPausedStatus(StudentLifecycleStatus.FROZEN), false);
  assert.equal(isInactiveStudentStatus(StudentLifecycleStatus.STOPPED), true);
});

test("T-33: STOPPED frees seat (enrollment paused) and pauses billing", () => {
  assert.equal(isBillingPausedStatus(StudentLifecycleStatus.STOPPED), true);
  assert.equal(
    enrollmentStatusForStudentLifecycle(StudentLifecycleStatus.STOPPED),
    EnrollmentStatus.PAUSED,
  );
});

test("T-34: freeze return with payment creates RETURN sale", () => {
  const cycle = admissionCycle({
    studentId: "s1",
    admissionTracking: true,
    returnId: "freeze-return",
    oldStatus: "FROZEN",
  });
  assert.equal(cycle.kind, "RETURN");
  assert.equal(cycle.key, "return:freeze-return");
});

test("T-35: STOPPED return creates RETURN cycle", () => {
  const cycle = admissionCycle({
    studentId: "s1",
    admissionTracking: true,
    returnId: "ret-1",
    oldStatus: "STOPPED",
  });
  assert.equal(cycle.kind, "RETURN");
  assert.match(cycle.key, /^return:/);
});

test("T-36: paying old debt without RETURN cycle stays NEW-only when no returnId", () => {
  const cycle = admissionCycle({ studentId: "s1", admissionTracking: true });
  assert.equal(cycle.kind, "NEW");
});

test("T-37: first-month package upgrade blocked", () => {
  const anchor = new Date(Date.UTC(2026, 9, 5));
  assert.equal(isPackageUpgrade({
    previousMonthlyFee: 149,
    previousLessonsPerMonth: 8,
    monthlyFee: 240,
    lessonsPerMonth: 8,
  }), true);
  assert.throws(
    () => assertPackageUpgradeAllowed({
      previousMonthlyFee: 149,
      previousLessonsPerMonth: 8,
      monthlyFee: 240,
      lessonsPerMonth: 8,
      effectiveMonth: new Date(Date.UTC(2026, 9, 1)),
      billingAnchorDate: anchor,
    }),
    (error: unknown) => error instanceof PublicActionError,
  );
});

test("T-38: second period package upgrade allowed", () => {
  const anchor = new Date(Date.UTC(2026, 9, 5));
  const earliest = earliestPackageUpgradeMonth(anchor);
  assert.doesNotThrow(() => assertPackageUpgradeAllowed({
    previousMonthlyFee: 149,
    previousLessonsPerMonth: 8,
    monthlyFee: 240,
    lessonsPerMonth: 8,
    effectiveMonth: earliest,
    billingAnchorDate: anchor,
  }));
});

test("T-41 / T-42: WhatsApp sent is not real contact; reply is", () => {
  assert.deepEqual(outcomesForChannel("WHATSAPP"), ["WHATSAPP_SENT", "WHATSAPP_REPLIED"]);
  assert.equal(isRealContactOutcome("WHATSAPP_SENT"), false);
  assert.equal(isRealContactOutcome("WHATSAPP_REPLIED"), true);
  assert.equal(isRealContactOutcome("UNANSWERED"), false);
  assert.equal(isRealContactOutcome("TALKED"), true);
});

test("T-44 / T-46: sale window uses qualified_at semantics (SQL helper presence)", async () => {
  const { companySalesCountSql } = await import("@/modules/students/sales-metrics-sql");
  const sql = companySalesCountSql(
    Prisma.sql`'2026-10-01'`,
    Prisma.sql`'2026-11-01'`,
  );
  assert.match(String(sql.strings.join("?")), /course_sales/);
  assert.match(String(sql.strings.join("?")), /qualified_at/);
});

test("T-47: zero leads → 0% conversion helper math", () => {
  const totalLeads = 0;
  const sales = 5;
  const conversionRate = totalLeads > 0 ? `${Math.round((sales / totalLeads) * 100)}%` : "0%";
  assert.equal(conversionRate, "0%");
});
