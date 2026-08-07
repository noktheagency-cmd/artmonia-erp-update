import { ApprovalStatus, Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/server/db/prisma";
import { calculateAttendanceAdjustedPayout } from "@/modules/hr/teacher-payroll-formula";

type PayrollLineRow = {
  teacherId: string;
  enrollmentId: string;
  paymentId: string;
  paidAmount: Prisma.Decimal | number | string;
  plannedLessons: number;
  attendedLessons: number;
  eligibleRevenue: Prisma.Decimal | number | string;
};

export type TeacherPayrollPreview = {
  teacherId: string;
  salaryPercent: number;
  paidRevenue: number;
  eligibleRevenue: number;
  payoutAmount: number;
  attendedLessons: number;
  plannedLessons: number;
};

export async function getTeacherPayrollPreviews(period = new Date()): Promise<Map<string, TeacherPayrollPreview>> {
  const prisma = getPrisma();
  const periodMonth = monthStart(period);
  const [rules, lines] = await Promise.all([
    prisma.teacherContractRule.findMany({
      where: { validFrom: { lte: periodMonth }, OR: [{ validTo: null }, { validTo: { gte: periodMonth } }] },
      orderBy: [{ validFrom: "desc" }, { createdAt: "desc" }],
      select: { teacherId: true, salaryPercent: true },
    }),
    queryPayrollLines(prisma, periodMonth),
  ]);
  return buildPreviews(rules, lines);
}

export async function recalculateTeacherPayoutsForMonth(period: Date, actorId: string, teacherIds?: string[]) {
  const prisma = getPrisma();
  const periodMonth = monthStart(period);
  await prisma.$transaction(async (tx) => {
    const rules = await tx.teacherContractRule.findMany({
      where: {
        ...(teacherIds?.length ? { teacherId: { in: teacherIds } } : {}),
        validFrom: { lte: periodMonth },
        OR: [{ validTo: null }, { validTo: { gte: periodMonth } }],
      },
      orderBy: [{ validFrom: "desc" }, { createdAt: "desc" }],
      select: { teacherId: true, salaryPercent: true },
    });
    const uniqueRules = [...new Map(rules.map((rule) => [rule.teacherId, rule])).values()];
    if (!uniqueRules.length) return;
    const scopedTeacherIds = uniqueRules.map((rule) => rule.teacherId);
    const lines = await queryPayrollLines(tx, periodMonth, scopedTeacherIds);
    const previews = buildPreviews(uniqueRules, lines);

    for (const rule of uniqueRules) {
      const existing = await tx.teacherPayout.findUnique({
        where: { teacherId_periodMonth: { teacherId: rule.teacherId, periodMonth } },
        select: { id: true, status: true },
      });
      if (existing?.status === ApprovalStatus.APPROVED) continue;
      const preview = previews.get(rule.teacherId)!;
      const payout = existing
        ? await tx.teacherPayout.update({ where: { id: existing.id }, data: { eligibleRevenue: preview.eligibleRevenue, payoutAmount: preview.payoutAmount, generatedById: actorId } })
        : await tx.teacherPayout.create({ data: { teacherId: rule.teacherId, periodMonth, eligibleRevenue: preview.eligibleRevenue, payoutAmount: preview.payoutAmount, generatedById: actorId } });
      await tx.teacherPayoutLine.deleteMany({ where: { payoutId: payout.id } });
      const teacherLines = lines.filter((line) => line.teacherId === rule.teacherId);
      if (teacherLines.length) {
        await tx.teacherPayoutLine.createMany({ data: teacherLines.map((line) => {
          const calculation = calculateAttendanceAdjustedPayout({ paidAmount: Number(line.paidAmount), attendedLessons: line.attendedLessons, plannedLessons: line.plannedLessons, salaryPercent: preview.salaryPercent });
          return {
            payoutId: payout.id,
            enrollmentId: line.enrollmentId,
            paymentId: line.paymentId,
            eligibleRevenue: calculation.eligibleRevenue,
            payoutAmount: calculation.payoutAmount,
            note: `${line.attendedLessons}/${line.plannedLessons} dərs · ${preview.salaryPercent}%`,
          };
        }) });
      }
    }
  });
}

async function queryPayrollLines(db: Pick<Prisma.TransactionClient, "$queryRaw">, periodMonth: Date, teacherIds?: string[]) {
  const nextMonth = new Date(Date.UTC(periodMonth.getUTCFullYear(), periodMonth.getUTCMonth() + 1, 1));
  const teacherFilter = teacherIds?.length ? Prisma.sql`and slot_owner.teacher_id in (${Prisma.join(teacherIds)})` : Prisma.empty;
  return db.$queryRaw<PayrollLineRow[]>(Prisma.sql`
    select
      slot_owner.teacher_id::text as "teacherId",
      i.enrollment_id::text as "enrollmentId",
      pa.payment_id::text as "paymentId",
      sum(pa.amount_allocated) as "paidAmount",
      greatest(coalesce(e.lessons_per_month, p.default_lessons_per_month, 1), 1)::int as "plannedLessons",
      coalesce(attendance.attended_lessons, 0)::int as "attendedLessons",
      round(
        sum(pa.amount_allocated) * least(
          coalesce(attendance.attended_lessons, 0)::numeric /
          greatest(coalesce(e.lessons_per_month, p.default_lessons_per_month, 1), 1)::numeric,
          1
        ), 2
      ) as "eligibleRevenue"
    from erp.invoices i
    join erp.enrollments e on e.id = i.enrollment_id
    join erp.programs p on p.id = e.program_id
    join erp.payment_allocations pa on pa.invoice_id = i.id
    join lateral (
      select cs.teacher_id
      from erp.student_schedule_assignments ssa
      join erp.class_slots cs on cs.id = ssa.slot_id
      where ssa.enrollment_id = e.id
        and ssa.valid_from < ${nextMonth}
        and (ssa.valid_to is null or ssa.valid_to >= ${periodMonth})
      order by ssa.valid_from desc, ssa.created_at desc
      limit 1
    ) slot_owner on true
    left join lateral (
      select count(*)::int as attended_lessons
      from erp.attendance_records ar
      join erp.slot_sessions ss on ss.id = ar.session_id
      where ar.enrollment_id = e.id
        and ar.teacher_id = slot_owner.teacher_id
        and ar.status = 'PRESENT'::"erp"."AttendanceMark"
        and ss.session_date >= ${periodMonth}
        and ss.session_date < ${nextMonth}
    ) attendance on true
    where i.period_month = ${periodMonth}
      and i.status <> 'VOID'::"erp"."InvoiceStatus"
      ${teacherFilter}
    group by slot_owner.teacher_id, i.enrollment_id, pa.payment_id, e.lessons_per_month,
      p.default_lessons_per_month, attendance.attended_lessons
  `);
}

function buildPreviews(rules: Array<{ teacherId: string; salaryPercent: Prisma.Decimal }>, lines: PayrollLineRow[]) {
  const map = new Map<string, TeacherPayrollPreview>();
  for (const rule of rules) {
    if (map.has(rule.teacherId)) continue;
    const percent = Number(rule.salaryPercent);
    const teacherLines = lines.filter((line) => line.teacherId === rule.teacherId);
    const paidRevenue = teacherLines.reduce((sum, line) => sum + Number(line.paidAmount), 0);
    const eligibleRevenue = teacherLines.reduce((sum, line) => sum + Number(line.eligibleRevenue), 0);
    map.set(rule.teacherId, {
      teacherId: rule.teacherId,
      salaryPercent: percent,
      paidRevenue: money(paidRevenue),
      eligibleRevenue: money(eligibleRevenue),
      payoutAmount: money(eligibleRevenue * percent / 100),
      attendedLessons: teacherLines.reduce((sum, line) => sum + line.attendedLessons, 0),
      plannedLessons: teacherLines.reduce((sum, line) => sum + line.plannedLessons, 0),
    });
  }
  return map;
}

function monthStart(value: Date) { return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1)); }
function money(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
