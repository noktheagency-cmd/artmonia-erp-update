import {
  HrBonusCampaignStatus,
  Prisma,
} from "@/generated/prisma/client";
import { writeAuditLog } from "@/modules/audit/audit-service";
import {
  calculateTeacherStudentBonus,
  calculateTierAward,
  nextMonthlyBonusPeriod,
  splitBonusPool,
} from "@/modules/hr/bonus-rules";
import { getTeacherPayrollPreviews } from "@/modules/hr/teacher-payroll";
import { getPrisma } from "@/server/db/prisma";

type NumericRow = { value: Prisma.Decimal | number | string | null };
type CampaignValueRow = {
  id: string;
  baseValue: Prisma.Decimal | number | string | null;
  adjustmentValue: Prisma.Decimal | number | string | null;
};

type TeacherPerformanceRow = {
  participantId: string;
  teacherId: string;
  cohortCount: number;
  eligibleStudentCount: number;
  churnedStudentCount: number;
};

export type BonusCampaignValueInput = {
  id: string;
};

export async function calculateBonusCampaignValues(
  campaigns: BonusCampaignValueInput[],
) {
  if (campaigns.length === 0) {
    return new Map<string, { baseValue: number; adjustmentValue: number; currentValue: number }>();
  }

  const rows = await getPrisma().$queryRaw<CampaignValueRow[]>(Prisma.sql`
    select
      campaign.id::text as id,
      case campaign.metric_kind
        when 'DEPARTMENT_COLLECTED_REVENUE'::"erp"."HrBonusMetricKind" then (
          select coalesce(sum(payment.amount), 0)
          from erp.payments payment
          join erp.students student on student.id = payment.student_id
          join erp.hr_employees employee on employee.user_id = student.manager_id
          where employee.department = campaign.department
            and payment.paid_at >= campaign.starts_at
            and payment.paid_at <= campaign.ends_at
        )
        when 'DEPARTMENT_SALES_COUNT'::"erp"."HrBonusMetricKind" then (
          select count(*)::numeric
          from erp.students student
          join erp.hr_employees employee on employee.user_id = student.manager_id
          where employee.department = campaign.department
            and student.registered_at >= campaign.starts_at
            and student.registered_at <= campaign.ends_at
        )
        when 'TEACHER_RETENTION_RATE'::"erp"."HrBonusMetricKind" then (
          select coalesce(round(avg(teacher_students.student_count), 2), 0)
          from (
            select count(*)::numeric as student_count
            from erp.hr_bonus_teacher_cohorts cohort
            where cohort.campaign_id = campaign.id
            group by cohort.participant_id
          ) teacher_students
        )
        else 0
      end as "baseValue",
      coalesce((
        select sum(adjustment.amount)
        from erp.hr_bonus_progress_adjustments adjustment
        where adjustment.campaign_id = campaign.id
      ), 0) as "adjustmentValue"
    from erp.hr_bonus_campaigns campaign
    where campaign.id in (${Prisma.join(campaigns.map((campaign) => campaign.id))})
  `);

  return new Map(rows.map((row) => {
    const baseValue = Number(row.baseValue ?? 0);
    const adjustmentValue = Number(row.adjustmentValue ?? 0);
    return [row.id, {
      baseValue,
      adjustmentValue,
      currentValue: Math.max(0, baseValue + adjustmentValue),
    }];
  }));
}

export async function calculateBonusCampaignValue(campaignId: string) {
  const prisma = getPrisma();
  const campaign = await prisma.hrBonusCampaign.findUnique({
    where: { id: campaignId },
    include: { adjustments: { select: { amount: true } } },
  });
  if (!campaign) throw new Error("Bonus kampaniyası tapılmadı");

  let baseValue = 0;
  if (campaign.metricKind === "DEPARTMENT_COLLECTED_REVENUE") {
    const [row] = await prisma.$queryRaw<NumericRow[]>(Prisma.sql`
      select coalesce(sum(p.amount), 0) as value
      from erp.payments p
      join erp.students s on s.id = p.student_id
      join erp.hr_employees he on he.user_id = s.manager_id
      where he.department = ${campaign.department}
        and p.paid_at >= ${campaign.startsAt}
        and p.paid_at <= ${campaign.endsAt}
    `);
    baseValue = Number(row?.value ?? 0);
  } else if (campaign.metricKind === "DEPARTMENT_SALES_COUNT") {
    const [row] = await prisma.$queryRaw<NumericRow[]>(Prisma.sql`
      select count(*)::int as value
      from erp.students s
      join erp.hr_employees he on he.user_id = s.manager_id
      where he.department = ${campaign.department}
        and s.registered_at >= ${campaign.startsAt}
        and s.registered_at <= ${campaign.endsAt}
    `);
    baseValue = Number(row?.value ?? 0);
  } else if (campaign.metricKind === "TEACHER_RETENTION_RATE") {
    const performance = await calculateTeacherPerformance(campaign.id);
    baseValue = performance.length > 0
      ? money(performance.reduce((sum, item) => sum + item.cohortCount, 0) / performance.length)
      : 0;
  }

  const adjustmentValue = campaign.adjustments.reduce(
    (sum, adjustment) => sum + Number(adjustment.amount),
    0,
  );
  return {
    baseValue,
    adjustmentValue,
    currentValue: Math.max(0, baseValue + adjustmentValue),
  };
}

export async function syncBonusCampaign(campaignId: string, actorUserId?: string | null) {
  const prisma = getPrisma();
  const campaign = await prisma.hrBonusCampaign.findUnique({
    where: { id: campaignId },
    include: {
      stages: {
        orderBy: { sortOrder: "asc" },
        include: { churnRules: { orderBy: { sortOrder: "asc" } } },
      },
      participants: {
        where: { isEligible: true },
        orderBy: { id: "asc" },
        include: {
          employee: {
            select: {
              salaryMode: true,
              salaryAmount: true,
              teacherId: true,
            },
          },
        },
      },
    },
  });
  if (!campaign || campaign.status === "CANCELLED") return null;

  const today = utcDateOnly(new Date());
  if (campaign.startsAt > today) {
    if (campaign.status !== "SCHEDULED") {
      await prisma.hrBonusCampaign.update({ where: { id: campaign.id }, data: { status: "SCHEDULED" } });
    }
    return calculateBonusCampaignValue(campaign.id);
  }

  if (campaign.metricKind === "TEACHER_RETENTION_RATE") {
    await ensureTeacherCohort(campaign.id);
  }

  const progress = await calculateBonusCampaignValue(campaign.id);

  if (campaign.metricKind === "TEACHER_RETENTION_RATE") {
    if (campaign.endsAt >= today) {
      if (campaign.status !== "ACTIVE") {
        await prisma.hrBonusCampaign.update({ where: { id: campaign.id }, data: { status: "ACTIVE" } });
      }
      return progress;
    }

    const performance = await calculateTeacherPerformance(campaign.id);
    await prisma.$transaction(async (tx) => {
      for (const result of performance) {
        const stage = campaign.stages.findLast(
          (candidate) => Number(candidate.threshold) <= result.cohortCount,
        );
        if (!stage) continue;
        const participant = campaign.participants.find((item) => item.id === result.participantId);
        if (!participant) continue;

        const award = calculateTeacherStudentBonus(
          Number(stage.fixedAmount),
          result.churnedStudentCount,
          stage.churnRules.map((rule) => ({
            churnThreshold: rule.churnThreshold,
            deductionAmount: Number(rule.deductionAmount),
          })),
        );
        if (award.amount <= 0) continue;

        const created = await tx.hrBonusAward.createMany({
          data: [{
            stageId: stage.id,
            participantId: participant.id,
            amount: award.amount,
            baseAmount: award.baseBonus,
            percentAmount: 0,
            fixedAmount: award.amount,
            workloadMultiplier: 1,
            metricValue: result.cohortCount,
            calculationNote: `${result.cohortCount} tələbə · ${result.churnedStudentCount} churn · ${award.baseBonus} ₼ baza − ${award.deductionAmount} ₼ kəsinti`,
          }],
          skipDuplicates: true,
        });
        if (created.count === 0) continue;
        await tx.hrBonusStage.updateMany({
          where: { id: stage.id, reachedAt: null },
          data: { reachedAt: new Date(), reachedValue: result.cohortCount },
        });
        await writeAuditLog(tx, {
          actorUserId: actorUserId ?? campaign.createdById,
          action: "hr.bonus.teacher.award.calculate",
          entityType: "hr_bonus_award",
          entityId: stage.id,
          after: {
            campaignId: campaign.id,
            participantId: participant.id,
            cohortCount: result.cohortCount,
            eligibleStudentCount: result.eligibleStudentCount,
            churnedStudentCount: result.churnedStudentCount,
            studentCount: result.cohortCount,
            baseBonus: award.baseBonus,
            deductionAmount: award.deductionAmount,
            awardAmount: award.amount,
          },
          reason: "Müəllim bonusu tələbə sayı və churn kəsintisinə görə hesablandı",
        });
      }
      const totalAwardCount = await tx.hrBonusAward.count({
        where: { participant: { campaignId: campaign.id }, status: { not: "VOIDED" } },
      });
      await tx.hrBonusCampaign.update({
        where: { id: campaign.id },
        data: { status: totalAwardCount > 0 ? "ACHIEVED" : "EXPIRED" },
      });
    });
    if (campaign.recursMonthly) await ensureNextMonthlyCampaign(campaign.id);
    return progress;
  }

  const finalStage = campaign.stages.at(-1);
  let finalReached = Boolean(finalStage?.reachedAt);
  const payroll = campaign.participants.some((participant) => participant.employee?.teacherId)
    ? await getTeacherPayrollPreviews(campaign.startsAt)
    : new Map();

  await prisma.$transaction(async (tx) => {
    for (const [stageIndex, stage] of campaign.stages.entries()) {
      if (stage.reachedAt || progress.currentValue < Number(stage.threshold)) continue;

      const unlocked = await tx.hrBonusStage.updateMany({
        where: { id: stage.id, reachedAt: null },
        data: { reachedAt: new Date(), reachedValue: progress.currentValue },
      });
      if (unlocked.count === 0) continue;

      const previousStage = campaign.stages[stageIndex - 1];
      const isLegacyPool = Number(stage.bonusPool) > 0
        && Number(stage.bonusPercent) === 0
        && Number(stage.fixedAmount) === 0;
      const awards = isLegacyPool
        ? splitBonusPool(Number(stage.bonusPool), campaign.participants.map((participant) => participant.id))
        : campaign.participants.map((participant) => ({
            participantId: participant.id,
            ...calculateTierAward({
              baseAmount: compensationBase(participant.employee, payroll),
              bonusPercent: Number(stage.bonusPercent),
              fixedAmount: Number(stage.fixedAmount),
              previousBonusPercent: Number(previousStage?.bonusPercent ?? 0),
              previousFixedAmount: Number(previousStage?.fixedAmount ?? 0),
            }),
          })).filter((award) => award.amount > 0);
      if (awards.length > 0) {
        await tx.hrBonusAward.createMany({
          data: awards.map((award) => {
            return {
              stageId: stage.id,
              participantId: award.participantId,
              amount: award.amount,
              baseAmount: Number("baseAmount" in award ? award.baseAmount : 0),
              percentAmount: Number("percentAmount" in award ? award.percentAmount : 0),
              fixedAmount: Number("fixedAmount" in award ? award.fixedAmount : 0),
              workloadMultiplier: 1,
              metricValue: progress.currentValue,
              calculationNote: isLegacyPool
                ? "Legacy bonus fondu bərabər bölünüb"
                : `${Number(stage.bonusPercent)}% + ${Number(stage.fixedAmount)} ₼ hədəf ödənişi (əvvəlki etap çıxılmaqla)`,
            };
          }),
          skipDuplicates: true,
        });
      }

      await writeAuditLog(tx, {
        actorUserId: actorUserId ?? campaign.createdById,
        action: "hr.bonus.stage.unlock",
        entityType: "hr_bonus_stage",
        entityId: stage.id,
        after: {
          campaignId: campaign.id,
          threshold: Number(stage.threshold),
          reachedValue: progress.currentValue,
          bonusPool: Number(stage.bonusPool),
          bonusPercent: Number(stage.bonusPercent),
          fixedAmount: Number(stage.fixedAmount),
          participantCount: awards.length,
        },
        reason: `${stage.sortOrder + 1}. bonus etapı açıldı`,
      });

      if (stage.id === finalStage?.id) finalReached = true;
    }

    const nextStatus: HrBonusCampaignStatus = finalReached
      ? "ACHIEVED"
      : campaign.endsAt < today
        ? "EXPIRED"
        : "ACTIVE";
    if (nextStatus !== campaign.status) {
      await tx.hrBonusCampaign.update({ where: { id: campaign.id }, data: { status: nextStatus } });
    }
  });

  if (campaign.recursMonthly && campaign.endsAt < today) {
    await ensureNextMonthlyCampaign(campaign.id);
  }

  return progress;
}

async function ensureTeacherCohort(campaignId: string) {
  await getPrisma().$executeRaw(Prisma.sql`
    insert into erp.hr_bonus_teacher_cohorts (
      campaign_id,
      participant_id,
      teacher_id,
      enrollment_id,
      student_id,
      assigned_at
    )
    select distinct on (student.id)
      campaign.id,
      participant.id,
      teacher.id,
      enrollment.id,
      student.id,
      assignment.valid_from
    from erp.hr_bonus_campaigns campaign
    join erp.hr_bonus_participants participant on participant.campaign_id = campaign.id
      and participant.is_eligible = true
    join erp.hr_employees employee on employee.id = participant.employee_id
    join erp.teachers teacher on teacher.id = employee.teacher_id
    join erp.class_slots slot on slot.teacher_id = teacher.id
    join erp.student_schedule_assignments assignment on assignment.slot_id = slot.id
    join erp.enrollments enrollment on enrollment.id = assignment.enrollment_id
    join erp.students student on student.id = enrollment.student_id
    left join lateral (
      select history.new_status
      from erp.student_status_history history
      where history.student_id = student.id
        and history.effective_at <= campaign.starts_at
      order by history.effective_at desc, history.created_at desc
      limit 1
    ) status_before_start on true
    left join lateral (
      select history.old_status
      from erp.student_status_history history
      where history.student_id = student.id
        and history.effective_at > campaign.starts_at
      order by history.effective_at asc, history.created_at asc
      limit 1
    ) first_status_after_start on true
    where campaign.id = ${campaignId}::uuid
      and campaign.metric_kind = 'TEACHER_RETENTION_RATE'::"erp"."HrBonusMetricKind"
      and assignment.valid_from <= campaign.starts_at
      and (assignment.valid_to is null or assignment.valid_to >= campaign.starts_at)
      and enrollment.start_date <= campaign.starts_at
      and coalesce(
        status_before_start.new_status,
        first_status_after_start.old_status,
        student.lifecycle_status
      ) in (
        'SLOT_WAITING'::"erp"."StudentLifecycleStatus",
        'ACTIVE'::"erp"."StudentLifecycleStatus"
      )
    order by student.id, assignment.valid_from desc, assignment.created_at desc
    on conflict (campaign_id, student_id) do nothing
  `);
}

async function calculateTeacherPerformance(campaignId: string) {
  const rows = await getPrisma().$queryRaw<TeacherPerformanceRow[]>(Prisma.sql`
    select
      participant.id::text as "participantId",
      teacher.id::text as "teacherId",
      count(cohort.id)::int as "cohortCount",
      count(cohort.id) filter (where outcome.is_eligible)::int as "eligibleStudentCount",
      count(cohort.id) filter (where outcome.is_eligible and outcome.did_churn)::int as "churnedStudentCount"
    from erp.hr_bonus_participants participant
    join erp.hr_bonus_campaigns campaign on campaign.id = participant.campaign_id
    join erp.hr_employees employee on employee.id = participant.employee_id
    join erp.teachers teacher on teacher.id = employee.teacher_id
    left join erp.hr_bonus_teacher_cohorts cohort on cohort.participant_id = participant.id
    left join lateral (
      select
        count(*)::int as assignment_count,
        case
        when count(*) = 0 or bool_or(assignment.valid_to is null) then null
        else max(assignment.valid_to)
      end as ended_at
      from erp.student_schedule_assignments assignment
      join erp.class_slots slot on slot.id = assignment.slot_id
      where assignment.enrollment_id = cohort.enrollment_id
        and slot.teacher_id = cohort.teacher_id
        and assignment.valid_from <= campaign.starts_at
        and (assignment.valid_to is null or assignment.valid_to >= campaign.starts_at)
    ) slot_assignment on cohort.id is not null
    left join lateral (
      select
        exists (
          select 1
          from erp.student_status_history history
          where history.student_id = cohort.student_id
            and history.new_status in (
              'STOPPED'::"erp"."StudentLifecycleStatus",
              'DECLINED'::"erp"."StudentLifecycleStatus"
            )
            and history.effective_at >= campaign.starts_at
            and history.effective_at <= least(
              campaign.ends_at,
              coalesce(slot_assignment.ended_at + 7, campaign.ends_at)
            )
        ) as did_churn,
        (
          slot_assignment.assignment_count > 0
          and (
            slot_assignment.ended_at is null
            or slot_assignment.ended_at > campaign.ends_at
            or exists (
            select 1
            from erp.student_status_history history
            where history.student_id = cohort.student_id
              and history.new_status in (
                'STOPPED'::"erp"."StudentLifecycleStatus",
                'DECLINED'::"erp"."StudentLifecycleStatus"
              )
              and history.effective_at >= campaign.starts_at
              and history.effective_at <= least(
                campaign.ends_at,
                coalesce(slot_assignment.ended_at + 7, campaign.ends_at)
              )
            )
          )
        ) as is_eligible
    ) outcome on cohort.id is not null
    where participant.campaign_id = ${campaignId}::uuid
      and participant.is_eligible = true
    group by participant.id, teacher.id
    order by participant.id
  `);
  return rows.map((row) => ({
    ...row,
    cohortCount: Number(row.cohortCount),
    eligibleStudentCount: Number(row.eligibleStudentCount),
    churnedStudentCount: Number(row.churnedStudentCount),
  }));
}

function compensationBase(
  employee: { salaryMode: string; salaryAmount: Prisma.Decimal; teacherId: string | null } | null,
  payroll: Map<string, { payoutAmount: number }>,
) {
  if (!employee) return 0;
  if (employee.salaryMode === "STATIC") return Number(employee.salaryAmount);
  if (employee.teacherId) return payroll.get(employee.teacherId)?.payoutAmount ?? 0;
  return Number(employee.salaryAmount);
}

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

async function ensureNextMonthlyCampaign(campaignId: string) {
  const prisma = getPrisma();
  const source = await prisma.hrBonusCampaign.findUnique({
    where: { id: campaignId },
    include: {
      stages: {
        orderBy: { sortOrder: "asc" },
        include: { churnRules: { orderBy: { sortOrder: "asc" } } },
      },
    },
  });
  if (!source?.recursMonthly || !source.recurrenceGroupId) return null;

  const { startsAt, endsAt } = nextMonthlyBonusPeriod(source.endsAt);
  const existing = await prisma.hrBonusCampaign.findFirst({
    where: { recurrenceGroupId: source.recurrenceGroupId, startsAt },
    select: { id: true },
  });
  if (existing) return existing;

  const participants = await prisma.hrEmployee.findMany({
    where: {
      department: source.department,
      status: { in: ["ACTIVE", "PROBATION"] },
      ...(source.metricKind === "TEACHER_RETENTION_RATE" ? { teacherId: { not: null } } : {}),
    },
    select: { id: true, fullName: true, email: true },
    orderBy: { fullName: "asc" },
  });
  if (participants.length === 0) return null;

  try {
    return await prisma.$transaction(async (tx) => {
      const created = await tx.hrBonusCampaign.create({
        data: {
          name: source.name,
          department: source.department,
          startsAt,
          endsAt,
          metricKind: source.metricKind,
          distributionMode: source.distributionMode,
          status: startsAt > utcDateOnly(new Date()) ? "SCHEDULED" : "ACTIVE",
          recursMonthly: true,
          recurrenceGroupId: source.recurrenceGroupId,
          createdById: source.createdById,
          stages: {
            create: source.stages.map((stage) => ({
              sortOrder: stage.sortOrder,
              threshold: stage.threshold,
              bonusPool: stage.bonusPool,
              bonusPercent: stage.bonusPercent,
              fixedAmount: stage.fixedAmount,
              churnRules: {
                create: stage.churnRules.map((rule) => ({
                  sortOrder: rule.sortOrder,
                  churnThreshold: rule.churnThreshold,
                  deductionAmount: rule.deductionAmount,
                })),
              },
            })),
          },
          participants: {
            create: participants.map((participant) => ({
              employeeId: participant.id,
              employeeName: participant.fullName,
              employeeEmail: participant.email,
            })),
          },
        },
      });
      await writeAuditLog(tx, {
        actorUserId: source.createdById,
        action: "hr.bonus.campaign.recur",
        entityType: "hr_bonus_campaign",
        entityId: created.id,
        after: { sourceCampaignId: source.id, startsAt, endsAt },
        reason: "Aylıq bonus kampaniyası avtomatik yaradıldı",
      });
      return created;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return prisma.hrBonusCampaign.findFirst({
        where: { recurrenceGroupId: source.recurrenceGroupId, startsAt },
      });
    }
    throw error;
  }
}

export async function syncActiveBonusCampaigns(actorUserId?: string | null) {
  const campaigns = await getPrisma().hrBonusCampaign.findMany({
    where: {
      OR: [
        { status: { in: ["SCHEDULED", "ACTIVE"] } },
        { status: "ACHIEVED", recursMonthly: true, endsAt: { lt: utcDateOnly(new Date()) } },
        { status: "EXPIRED", recursMonthly: true, endsAt: { lt: utcDateOnly(new Date()) } },
      ],
    },
    select: { id: true },
    orderBy: { startsAt: "asc" },
  });
  for (const campaign of campaigns) {
    await syncBonusCampaign(campaign.id, actorUserId);
  }
}

export function utcDateOnly(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}
