import { Prisma } from "@/generated/prisma/client";
import { requireErpActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";
import { companySalesCountSql } from "@/modules/students/sales-metrics-sql";
import { canReadDailyReport, dailyReportWindow } from "./daily-report-policy";

export type DailyReportData = {
  date: string;
  leads: number;
  contacted: number;
  scheduled: number;
  attended: number;
  noShow: number;
  pending: number;
  sales: number;
  payments: string;
  completed: number;
  overdue: number;
  tomorrow: number;
  frozen: number;
  stopped: number;
};

export async function getDailyReportData(): Promise<DailyReportData | null> {
  const actor = await requireErpActor();
  if (!canReadDailyReport(actor.id, actor.permissions)) return null;
  const { date, nextDate, start, end, tomorrowEnd } = dailyReportWindow();
  const [row] = await getPrisma().$queryRaw<Omit<DailyReportData, "date">[]>(Prisma.sql`
    with new_leads as (
      select l.id, l.stage from erp.leads l
      where l.created_at >= ${start} and l.created_at < ${end}
    ), open_leads as (
      select l.* from erp.leads l
      where l.stage not in ('REGISTERED', 'LOST') and l.converted_student_id is null
    ), appointments as (
      select t.* from erp.tasks t join erp.leads l on l.id = t.entity_id
      where t.type = 'lead_appointment' and t.entity_type = 'lead' and t.status <> 'CANCELLED'
        and t.due_at >= ${start} and t.due_at < ${end}
    ), lifecycle as (
      select h.student_id, h.new_status from erp.student_status_history h
      join erp.students s on s.id = h.student_id
      where not s.is_test_data and h.effective_at = ${date}::date
        and h.old_status is distinct from h.new_status
    )
    select
      (select count(*)::int from new_leads) as leads,
      (select count(*)::int from new_leads l where l.stage in ('CONTACTED','QUALIFIED','TRIAL_LESSON','TRIAL_CONSULTATION','REGISTERED')
        or exists (select 1 from erp.lead_stage_history h where h.lead_id = l.id
          and h.created_at >= ${start} and h.created_at < ${end}
          and h.new_stage in ('CONTACTED','QUALIFIED','TRIAL_LESSON','TRIAL_CONSULTATION','REGISTERED'))) as contacted,
      (select count(*)::int from appointments) as scheduled,
      (select count(*)::int from appointments where completion_note = 'ATTENDED') as attended,
      (select count(*)::int from appointments where completion_note = 'NO_SHOW') as "noShow",
      (select count(*)::int from appointments where completion_note = 'SCHEDULED') as pending,
      ${companySalesCountSql(Prisma.sql`${date}`, Prisma.sql`${nextDate}`)} as sales,
      (select coalesce(sum(p.amount),0)::text from erp.payments p join erp.students s on s.id = p.student_id
        where not s.is_test_data and p.paid_at = ${date}::date) as payments,
      (select count(*)::int from erp.tasks where type = 'lead_follow_up' and status = 'DONE'
        and completed_at >= ${start} and completed_at < ${end}) as completed,
      (select count(*)::int from open_leads where next_follow_up_at < ${start}) as overdue,
      (select count(*)::int from open_leads where next_follow_up_at >= ${end} and next_follow_up_at < ${tomorrowEnd}) as tomorrow,
      (select count(distinct student_id)::int from lifecycle where new_status = 'FROZEN') as frozen,
      (select count(distinct student_id)::int from lifecycle where new_status = 'STOPPED') as stopped
  `);
  if (!row) throw new Error("Daily report query returned no result");
  return { date, ...row };
}
