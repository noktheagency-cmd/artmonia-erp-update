import { ApprovalStatus, Prisma } from "@/generated/prisma/client";
import { writeAuditLog } from "@/modules/audit/audit-service";
import { calculateAttendanceAdjustedPayout } from "./teacher-payroll-formula";
import { calculateGuestLessonPayout, queryGuestLessonPayrollLines, STATIC_GUEST_LESSON_PERCENT, type GuestLessonPayrollLine } from "./guest-lesson-payroll";

type PayrollLineRow = {
  teacherId: string; enrollmentId: string; paymentId: string;
  paidAmount: Prisma.Decimal | number | string;
  plannedLessons: number; attendedLessons: number; absentLessons: number; totalAttendedLessons: number;
};
type PayrollRule = { teacherId: string; salaryPercent: Prisma.Decimal; monthlySalaryPercent: Prisma.Decimal | null; salaryMode: string };
export type TeacherPayrollPreview = {
  teacherId: string; salaryPercent: number; paidRevenue: number; eligibleRevenue: number;
  payoutAmount: number; guestLessonPayout: number; guestLessonRevenue: number;
  attendedLessons: number; absentLessons: number; plannedLessons: number;
};
type PayrollDb = Pick<Prisma.TransactionClient, "$queryRaw">;

async function queryRules(db: PayrollDb, month: Date, teacherIds?: string[]) {
  return db.$queryRaw<PayrollRule[]>(Prisma.sql`
    select t.id::text as "teacherId", coalesce(h.salary_mode::text, 'PERCENT') as "salaryMode",
      coalesce(r.salary_percent, h.salary_percent, 0) as "salaryPercent",
      case when h.salary_mode = 'STATIC' then null else r.salary_percent end as "monthlySalaryPercent"
    from erp.teachers t
    left join lateral (
      select salary_mode, salary_percent from erp.hr_employees h
      where h.teacher_id = t.id or (h.teacher_id is null and h.user_id = t.user_id)
      order by (h.teacher_id = t.id) desc nulls last limit 1
    ) h on true
    left join lateral (
      select salary_percent from erp.teacher_contract_rules r
      where r.teacher_id = t.id and r.valid_from <= ${month} and (r.valid_to is null or r.valid_to >= ${month})
      order by r.valid_from desc, r.created_at desc limit 1
    ) r on true
    where (r.salary_percent is not null or exists (
      select 1 from erp.single_lessons l join erp.payments p on p.id = l.payment_id
      where l.teacher_id = t.id and p.payment_month = ${month}
    ) or exists (select 1 from erp.teacher_payouts p where p.teacher_id = t.id and p.period_month = ${month}))
    ${teacherIds?.length ? Prisma.sql`and t.id in (${Prisma.join(teacherIds)})` : Prisma.empty}
    order by t.id
  `);
}

export async function getTeacherPayrollPreviewsFromDb(db: PayrollDb, period: Date) {
  const month = monthStart(period);
  const [rules, lines, guests] = await Promise.all([
    queryRules(db, month), queryPayrollLines(db, month), queryGuestLessonPayrollLines(db, month),
  ]);
  return buildPreviews(rules, lines, guests);
}

export async function recalculateTeacherPayoutsForMonthInTransaction(
  tx: Prisma.TransactionClient, period: Date, actorId: string | null, teacherIds?: string[],
) {
  const month = monthStart(period);
  const candidates = await queryRules(tx, month, teacherIds);
  if (!candidates.length) return;
  // All writers serialize on teacher/month before reading money and attendance.
  for (const { teacherId } of candidates) {
    await tx.$executeRaw(Prisma.sql`select pg_advisory_xact_lock(hashtextextended(${`teacher-payout:${teacherId}:${month.toISOString()}`}, 0))`);
  }
  const ids = candidates.map(r => r.teacherId);
  const [rules, lines, guests] = await Promise.all([
    queryRules(tx, month, ids), queryPayrollLines(tx, month, ids), queryGuestLessonPayrollLines(tx, month, ids),
  ]);
  const previews = buildPreviews(rules, lines, guests);
  await tx.teacherPayout.createMany({ data: rules.map(rule => ({
    teacherId: rule.teacherId, periodMonth: month, generatedById: actorId,
  })), skipDuplicates: true });
  // Lock parent rows so approval cannot race line replacement.
  await tx.$queryRaw(Prisma.sql`select id from erp.teacher_payouts where teacher_id in (${Prisma.join(ids)}) and period_month = ${month} order by teacher_id for update`);
  const payouts = await tx.teacherPayout.findMany({ where: { teacherId: { in: ids }, periodMonth: month, status: { not: ApprovalStatus.APPROVED } } });
  for (const payout of payouts) {
    const rule = rules.find(r => r.teacherId === payout.teacherId)!;
    const preview = previews.get(payout.teacherId)!;
    const monthly = rule.monthlySalaryPercent === null ? [] : lines.filter(l => l.teacherId === rule.teacherId).map(line => {
      const calculation = calculatePayrollLine(line, Number(rule.monthlySalaryPercent));
      return { payoutId: payout.id, enrollmentId: line.enrollmentId, paymentId: line.paymentId, ...calculation,
        note: `${line.attendedLessons} gəldi · ${line.absentLessons} gəlmədi / ${line.plannedLessons} plan · ${rule.monthlySalaryPercent}%` };
    });
    const guestPercent = rule.salaryMode === "STATIC" ? STATIC_GUEST_LESSON_PERCENT : rule.salaryPercent;
    const guest = guests.filter(l => l.teacherId === rule.teacherId).map(line => ({
      payoutId: payout.id, enrollmentId: null, paymentId: line.paymentId,
      ...calculateGuestLessonPayout(line.paidAmount, guestPercent), note: `Qonaq dərs · ${guestPercent}%`,
    }));
    await tx.teacherPayout.update({ where: { id: payout.id }, data: {
      eligibleRevenue: new Prisma.Decimal(preview.eligibleRevenue), payoutAmount: new Prisma.Decimal(preview.payoutAmount),
      ...(actorId ? { generatedById: actorId } : {}),
    } });
    await tx.teacherPayoutLine.deleteMany({ where: { payoutId: payout.id } });
    const data = [...monthly, ...guest].map(({ payoutId, enrollmentId, paymentId, eligibleRevenue, payoutAmount, note }) => ({ payoutId, enrollmentId, paymentId, eligibleRevenue, payoutAmount, note }));
    if (data.length) await tx.teacherPayoutLine.createMany({ data });
    if (!payout.payoutAmount.equals(preview.payoutAmount) || !payout.eligibleRevenue.equals(preview.eligibleRevenue)) {
      await writeAuditLog(tx, { actorUserId: actorId, action: "teacher.payout.recalculate", entityType: "teacher_payout", entityId: payout.id,
        before: { eligibleRevenue: payout.eligibleRevenue.toFixed(2), payoutAmount: payout.payoutAmount.toFixed(2) },
        after: { eligibleRevenue: String(preview.eligibleRevenue), payoutAmount: String(preview.payoutAmount), guestLessonPayout: String(preview.guestLessonPayout) },
        reason: "Davamiyyət və ödəniş əsasında hesablandı; qonaq dərs payı ayrıca sətirlərdədir" });
    }
  }
}

function buildPreviews(rules: PayrollRule[], lines: PayrollLineRow[], guests: GuestLessonPayrollLine[]) {
  const result = new Map<string, TeacherPayrollPreview>();
  const sum = (values: Array<Prisma.Decimal | number | string>) => values.reduce<Prisma.Decimal>((total, v) => total.plus(v), new Prisma.Decimal(0)).toDecimalPlaces(2).toNumber();
  for (const rule of rules) {
    const monthly = rule.monthlySalaryPercent === null ? [] : lines.filter(l => l.teacherId === rule.teacherId);
    const calculations = monthly.map(l => calculatePayrollLine(l, Number(rule.monthlySalaryPercent)));
    const guestLines = guests.filter(l => l.teacherId === rule.teacherId);
    const guestCalculations = guestLines.map(l => calculateGuestLessonPayout(l.paidAmount, rule.salaryMode === "STATIC" ? STATIC_GUEST_LESSON_PERCENT : rule.salaryPercent));
    const attendance = [...new Map(monthly.map(l => [l.enrollmentId, l])).values()];
    result.set(rule.teacherId, {
      teacherId: rule.teacherId, salaryPercent: Number(rule.salaryPercent),
      paidRevenue: sum([...monthly.map(l => l.paidAmount), ...guestLines.map(l => l.paidAmount)]),
      eligibleRevenue: sum([...calculations, ...guestCalculations].map(l => l.eligibleRevenue)),
      payoutAmount: sum([...calculations, ...guestCalculations].map(l => l.payoutAmount)),
      guestLessonPayout: sum(guestCalculations.map(l => l.payoutAmount)), guestLessonRevenue: sum(guestCalculations.map(l => l.eligibleRevenue)),
      attendedLessons: attendance.reduce((s, l) => s + l.attendedLessons, 0) + guestLines.length,
      absentLessons: attendance.reduce((s, l) => s + l.absentLessons, 0),
      plannedLessons: attendance.reduce((s, l) => s + l.plannedLessons, 0) + guestLines.length,
    });
  }
  return result;
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
