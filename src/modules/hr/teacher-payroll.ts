import "server-only";

import { ApprovalStatus, FinanceSalaryMode, Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/server/db/prisma";
import { calculateAttendanceAdjustedPayout } from "@/modules/hr/teacher-payroll-formula";

type PayrollLineRow = {
  teacherId: string;
  enrollmentId: string;
  paymentId: string;
  paidAmount: Prisma.Decimal | number | string;
  plannedLessons: number;
  attendedLessons: number;
  absentLessons: number;
  totalAttendedLessons: number;
};

export type TeacherPayrollPreview = {
  teacherId: string;
  salaryPercent: number;
  paidRevenue: number;
  eligibleRevenue: number;
  payoutAmount: number;
  attendedLessons: number;
  absentLessons: number;
  plannedLessons: number;
};

export async function getTeacherPayrollPreviews(period = new Date()): Promise<Map<string, TeacherPayrollPreview>> {
  const prisma = getPrisma();
  const periodMonth = monthStart(period);
  const [rules, lines] = await Promise.all([
    prisma.teacherContractRule.findMany({
      where: {
        validFrom: { lte: periodMonth },
        OR: [{ validTo: null }, { validTo: { gte: periodMonth } }],
        teacher: {
          OR: [
            { hrEmployee: { is: null } },
            { hrEmployee: { is: { salaryMode: FinanceSalaryMode.PERCENT } } },
          ],
        },
      },
      orderBy: [{ validFrom: "desc" }, { createdAt: "desc" }],
      select: { teacherId: true, salaryPercent: true },
    }),
    queryPayrollLines(prisma, periodMonth),
  ]);
  return buildPreviews(rules, lines);
}

export async function recalculateTeacherPayoutsForMonth(
  period: Date,
  actorId: string | null,
  teacherIds?: string[],
) {
  await getPrisma().$transaction((tx) => (
    recalculateTeacherPayoutsForMonthInTransaction(tx, period, actorId, teacherIds)
  ));
}

export async function recalculateTeacherPayoutsForMonthInTransaction(
  tx: Prisma.TransactionClient,
  period: Date,
  actorId: string | null,
  teacherIds?: string[],
) {
  const periodMonth = monthStart(period);
    const rules = await tx.teacherContractRule.findMany({
      where: {
        ...(teacherIds?.length ? { teacherId: { in: teacherIds } } : {}),
        validFrom: { lte: periodMonth },
        OR: [{ validTo: null }, { validTo: { gte: periodMonth } }],
        teacher: {
          OR: [
            { hrEmployee: { is: null } },
            { hrEmployee: { is: { salaryMode: FinanceSalaryMode.PERCENT } } },
          ],
        },
      },
      orderBy: [{ validFrom: "desc" }, { createdAt: "desc" }],
      select: { teacherId: true, salaryPercent: true },
    });
    const uniqueRules = [...rules.reduce((byTeacher, rule) => {
      if (!byTeacher.has(rule.teacherId)) byTeacher.set(rule.teacherId, rule);
      return byTeacher;
    }, new Map<string, (typeof rules)[number]>()).values()];
    if (!uniqueRules.length) return;
    const scopedTeacherIds = uniqueRules.map((rule) => rule.teacherId);
    const lines = await queryPayrollLines(tx, periodMonth, scopedTeacherIds);
    const previews = buildPreviews(uniqueRules, lines);

    await tx.teacherPayout.createMany({
      data: uniqueRules.map((rule) => {
        const preview = previews.get(rule.teacherId)!;
        return {
          teacherId: rule.teacherId,
          periodMonth,
          eligibleRevenue: preview.eligibleRevenue,
          payoutAmount: preview.payoutAmount,
          generatedById: actorId,
        };
      }),
      skipDuplicates: true,
    });

    const payoutUpdates = uniqueRules.map((rule) => {
      const preview = previews.get(rule.teacherId)!;
      return Prisma.sql`(
        ${rule.teacherId}::uuid,
        ${preview.eligibleRevenue}::numeric,
        ${preview.payoutAmount}::numeric
      )`;
    });
    await tx.$executeRaw(Prisma.sql`
      update erp.teacher_payouts payout
      set
        eligible_revenue = changes.eligible_revenue,
        payout_amount = changes.payout_amount,
        generated_by_id = coalesce(${actorId}::uuid, payout.generated_by_id),
        updated_at = now()
      from (values ${Prisma.join(payoutUpdates)}) as changes(
        teacher_id,
        eligible_revenue,
        payout_amount
      )
      where payout.teacher_id = changes.teacher_id
        and payout.period_month = ${periodMonth}
        and payout.status <> 'APPROVED'::"erp"."ApprovalStatus"
    `);

    const mutablePayouts = await tx.teacherPayout.findMany({
      where: {
        teacherId: { in: scopedTeacherIds },
        periodMonth,
        status: { not: ApprovalStatus.APPROVED },
      },
      select: { id: true, teacherId: true },
    });
    if (!mutablePayouts.length) return;

    const payoutIdByTeacher = new Map(mutablePayouts.map((payout) => [payout.teacherId, payout.id]));
    await tx.teacherPayoutLine.deleteMany({
      where: { payoutId: { in: mutablePayouts.map((payout) => payout.id) } },
    });

    const payoutLines = lines.flatMap((line) => {
      const payoutId = payoutIdByTeacher.get(line.teacherId);
      const preview = previews.get(line.teacherId);
      if (!payoutId || !preview) return [];
      const calculation = calculatePayrollLine(line, preview.salaryPercent);
      return [{
        payoutId,
        enrollmentId: line.enrollmentId,
        paymentId: line.paymentId,
        eligibleRevenue: calculation.eligibleRevenue,
        payoutAmount: calculation.payoutAmount,
        note: `${line.attendedLessons} gəldi · ${line.absentLessons} gəlmədi / ${line.plannedLessons} plan · ${preview.salaryPercent}%`,
      }];
    });
    if (payoutLines.length) {
      await tx.teacherPayoutLine.createMany({ data: payoutLines });
    }
}

async function queryPayrollLines(db: Pick<Prisma.TransactionClient, "$queryRaw">, periodMonth: Date, teacherIds?: string[]) {
  const nextMonth = new Date(Date.UTC(periodMonth.getUTCFullYear(), periodMonth.getUTCMonth() + 1, 1));
  const teacherFilter = teacherIds?.length ? Prisma.sql`and attendance.teacher_id in (${Prisma.join(teacherIds)})` : Prisma.empty;
  return db.$queryRaw<PayrollLineRow[]>(Prisma.sql`
    with paid_enrollments as (
      select
        i.enrollment_id,
        pa.payment_id,
        sum(pa.amount_allocated) as paid_amount,
        greatest(coalesce(nullif(e.lessons_per_month, 0), p.default_lessons_per_month, 1), 1)::int as planned_lessons
      from erp.invoices i
      join erp.enrollments e on e.id = i.enrollment_id
      join erp.programs p on p.id = e.program_id
      join erp.payment_allocations pa on pa.invoice_id = i.id
      where i.period_month = ${periodMonth}
        and i.status <> 'VOID'::"erp"."InvoiceStatus"
      group by i.enrollment_id, pa.payment_id, e.lessons_per_month, p.default_lessons_per_month
    ),
    attendance_by_teacher as (
      select
        ar.enrollment_id,
        ar.teacher_id,
        count(*) filter (where ar.status = 'PRESENT'::"erp"."AttendanceMark")::int as attended_lessons,
        count(*) filter (where ar.status = 'ABSENT'::"erp"."AttendanceMark")::int as absent_lessons
      from erp.attendance_records ar
      join erp.slot_sessions ss on ss.id = ar.session_id
      where ss.session_date >= ${periodMonth}
        and ss.session_date < ${nextMonth}
        and exists (
          select 1
          from paid_enrollments paid
          where paid.enrollment_id = ar.enrollment_id
        )
      group by ar.enrollment_id, ar.teacher_id
    ),
    attendance_totals as (
      select
        enrollment_id,
        sum(attended_lessons)::int as total_attended_lessons
      from attendance_by_teacher
      group by enrollment_id
    )
    select
      attendance.teacher_id::text as "teacherId",
      paid.enrollment_id::text as "enrollmentId",
      paid.payment_id::text as "paymentId",
      paid.paid_amount as "paidAmount",
      paid.planned_lessons as "plannedLessons",
      attendance.attended_lessons as "attendedLessons",
      attendance.absent_lessons as "absentLessons",
      totals.total_attended_lessons as "totalAttendedLessons"
    from paid_enrollments paid
    join attendance_by_teacher attendance on attendance.enrollment_id = paid.enrollment_id
    join attendance_totals totals on totals.enrollment_id = paid.enrollment_id
    where true
      ${teacherFilter}
  `);
}

function buildPreviews(rules: Array<{ teacherId: string; salaryPercent: Prisma.Decimal }>, lines: PayrollLineRow[]) {
  const map = new Map<string, TeacherPayrollPreview>();
  const linesByTeacher = new Map<string, PayrollLineRow[]>();
  for (const line of lines) {
    const teacherLines = linesByTeacher.get(line.teacherId);
    if (teacherLines) teacherLines.push(line);
    else linesByTeacher.set(line.teacherId, [line]);
  }
  for (const rule of rules) {
    if (map.has(rule.teacherId)) continue;
    const percent = Number(rule.salaryPercent);
    const teacherLines = linesByTeacher.get(rule.teacherId) ?? [];
    const calculations = teacherLines.map((line) => calculatePayrollLine(line, percent));
    const attendanceByEnrollment = new Map<string, PayrollLineRow>();
    for (const line of teacherLines) {
      if (!attendanceByEnrollment.has(line.enrollmentId)) {
        attendanceByEnrollment.set(line.enrollmentId, line);
      }
    }
    const attendanceLines = [...attendanceByEnrollment.values()];
    const paidRevenue = teacherLines.reduce((sum, line) => sum + Number(line.paidAmount), 0);
    const eligibleRevenue = calculations.reduce((sum, calculation) => sum + calculation.eligibleRevenue, 0);
    map.set(rule.teacherId, {
      teacherId: rule.teacherId,
      salaryPercent: percent,
      paidRevenue: money(paidRevenue),
      eligibleRevenue: money(eligibleRevenue),
      payoutAmount: money(calculations.reduce((sum, calculation) => sum + calculation.payoutAmount, 0)),
      attendedLessons: attendanceLines.reduce((sum, line) => sum + line.attendedLessons, 0),
      absentLessons: attendanceLines.reduce((sum, line) => sum + line.absentLessons, 0),
      plannedLessons: attendanceLines.reduce((sum, line) => sum + line.plannedLessons, 0),
    });
  }
  return map;
}

function calculatePayrollLine(line: PayrollLineRow, salaryPercent: number) {
  return calculateAttendanceAdjustedPayout({
    paidAmount: Number(line.paidAmount),
    attendedLessons: line.attendedLessons,
    totalAttendedLessons: line.totalAttendedLessons,
    plannedLessons: line.plannedLessons,
    salaryPercent,
  });
}

function monthStart(value: Date) { return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1)); }
function money(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
