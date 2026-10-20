import { Prisma } from "@/generated/prisma/client";
import type { filteredDailyReportWindow } from "./daily-report-policy";
type Window = ReturnType<typeof filteredDailyReportWindow>;
const owner = (column: Prisma.Sql, id?: string) => id ? Prisma.sql`and ${column} = ${id}::uuid` : Prisma.empty;

export function dailyReportCtes(w: Window) {
 return Prisma.sql`with
 new_leads as (select l.* from erp.leads l where l.created_at >= ${w.start} and l.created_at < ${w.end} ${owner(Prisma.sql`l.manager_id`, w.managerId)}),
 contacts as (select e.*, l.created_at as lead_created_at from erp.lead_contact_events e join erp.leads l on l.id=e.lead_id where e.occurred_at >= ${w.start} and e.occurred_at < ${w.end} ${owner(Prisma.sql`e.actor_id`, w.managerId)}),
 appointments as (select a.*, l.contact_id from erp.crm_appointments a join erp.leads l on l.id=a.lead_id where ((a.planned_at >= ${w.start} and a.planned_at < ${w.end}) or (a.created_at >= ${w.start} and a.created_at < ${w.end}) or (a.occurred_at >= ${w.start} and a.occurred_at < ${w.end})) ${owner(Prisma.sql`a.owner_id`, w.managerId)}),
 sales as (select x.* from erp.course_sales x join erp.students s on s.id=x.student_id where not s.is_test_data and x.qualified_at >= ${w.from}::date and x.qualified_at < ${w.nextDate}::date ${owner(Prisma.sql`x.owner_id`, w.managerId)}),
 cancellations as (select x.* from erp.course_sales x join erp.students s on s.id=x.student_id where not s.is_test_data and x.cancelled_at >= ${w.start} and x.cancelled_at < ${w.end} ${owner(Prisma.sql`x.owner_id`, w.managerId)}),
 receipts as (select p.id, p.student_id, p.amount, p.paid_at, p.receipt_purpose, x.cancelled_at as sale_cancelled_at, coalesce(x.owner_id,s.manager_id,p.created_by_id) owner_id from erp.payments p join erp.students s on s.id=p.student_id left join erp.course_sales x on x.id=p.course_sale_id where not s.is_test_data and p.refunded_at is null and p.paid_at >= ${w.from}::date and p.paid_at < ${w.nextDate}::date ${owner(Prisma.sql`coalesce(x.owner_id,s.manager_id,p.created_by_id)`, w.managerId)}),
 workshop_receipts as (select p.* from erp.workshop_payments p where p.paid_at >= ${w.from}::date and p.paid_at < ${w.nextDate}::date ${owner(Prisma.sql`p.created_by_id`, w.managerId)}),
 work as (select x.* from erp.lead_work_items x where x.created_at < ${w.end} ${owner(Prisma.sql`x.owner_id`, w.managerId)}),
 lifecycle as (select h.* from erp.student_status_history h join erp.students s on s.id=h.student_id where not s.is_test_data and h.effective_at >= ${w.from}::date and h.effective_at < ${w.nextDate}::date and h.old_status is distinct from h.new_status ${owner(Prisma.sql`s.manager_id`, w.managerId)})
 `;
}
export function dailyReportSummarySql(w: Window) {
 return Prisma.sql`${dailyReportCtes(w)} select
 (select count(distinct contact_id)::int from new_leads) leads,
 (select count(distinct contact_id)::int from contacts where outcome='TALKED') contacted,
 (select count(*)::int from contacts) as "contactOps",
 (select count(distinct e.contact_id)::int from contacts e where outcome='TALKED' and exists(select 1 from erp.leads l where l.contact_id=e.contact_id and l.created_at >= ${w.start} and l.created_at < ${w.end})) as "newContacted",
 (select count(distinct e.contact_id)::int from contacts e where outcome='TALKED' and not exists(select 1 from erp.leads l where l.contact_id=e.contact_id and l.created_at >= ${w.start} and l.created_at < ${w.end})) as "oldContacted",
 (select count(distinct c.contact_id)::int from contacts c where c.outcome='UNANSWERED' and not exists (select 1 from contacts t where t.contact_id=c.contact_id and t.outcome='TALKED')) unanswered,
 (select count(distinct l.contact_id)::int from new_leads l where not exists(select 1 from erp.lead_contact_events e where e.contact_id=l.contact_id and e.occurred_at >= ${w.start} and e.occurred_at < ${w.end})) unworked,
 (select count(*)::int from appointments where not is_legacy and created_at >= ${w.start} and created_at < ${w.end}) as "appointmentCreated",
 (select count(*)::int from appointments where planned_at >= ${w.start} and planned_at < ${w.end}) scheduled,
 (select count(distinct contact_id)::int from appointments where planned_at >= ${w.start} and planned_at < ${w.end}) as "appointmentPeople",
 (select count(*)::int from appointments where outcome='ATTENDED' and occurred_at >= ${w.start} and occurred_at < ${w.end}) attended,
 (select count(*)::int from appointments where outcome='NO_SHOW' and occurred_at >= ${w.start} and occurred_at < ${w.end}) as "noShow",
 (select count(*)::int from appointments where outcome='CANCELLED' and planned_at >= ${w.start} and planned_at < ${w.end}) as "appointmentCancelled",
 (select count(*)::int from appointments where outcome='RESCHEDULED' and planned_at >= ${w.start} and planned_at < ${w.end}) rescheduled,
 (select count(*)::int from appointments where kind='CONSULTATION' and outcome='ATTENDED' and occurred_at >= ${w.start} and occurred_at < ${w.end}) consultations,
 (select count(*)::int from appointments where kind='TRIAL' and outcome='ATTENDED' and occurred_at >= ${w.start} and occurred_at < ${w.end}) trials,
 (select count(*)::int from sales where cancelled_at is null or cancelled_at >= ${w.end}) sales,
 (select count(*)::int from sales) as "originalSales",
 (select count(*)::int from sales where cancelled_at < ${w.end}) as "cancelledSales",
 (select count(*)::int from cancellations) as "cancellationEvents",
 (select count(*)::int from sales where kind='NEW' and (cancelled_at is null or cancelled_at >= ${w.end})) as "newSales",
 (select count(*)::int from sales where kind='RETURN' and (cancelled_at is null or cancelled_at >= ${w.end})) as "returnSales",
 (select count(*)::int from sales where route='CRM' and (cancelled_at is null or cancelled_at >= ${w.end})) as "crmSales",
 (select count(*)::int from sales where route='DIRECT' and (cancelled_at is null or cancelled_at >= ${w.end})) as "directSales",
 ((select coalesce(sum(amount),0) from receipts)+(select coalesce(sum(amount),0) from workshop_receipts))::text payments,
 (select coalesce(sum(amount),0)::text from receipts where receipt_purpose='ADMISSION' and sale_cancelled_at is null) deposit,
 (select coalesce(sum(amount),0)::text from receipts where receipt_purpose='INITIAL_BALANCE') balance,
 (select coalesce(sum(amount),0)::text from receipts where receipt_purpose='RENEWAL') renewal,
 (select coalesce(sum(amount),0)::text from receipts where receipt_purpose='ONE_OFF') as "oneOff",
 ((select coalesce(sum(amount),0) from receipts where receipt_purpose='OTHER')+(select coalesce(sum(amount),0) from workshop_receipts))::text other,
 (select coalesce(sum(amount),0)::text from receipts where receipt_purpose='UNCLASSIFIED') unclassified,
 (select count(*)::int from work where completed_at >= ${w.start} and completed_at < ${w.end}) completed,
 (select count(*)::int from work where planned_at < ${w.end} and (completed_at is null or completed_at >= ${w.end}) and (cancelled_at is null or cancelled_at >= ${w.end})) overdue,
 (select count(*)::int from work where planned_at >= ${w.end} and planned_at < ${w.tomorrowEnd} and (completed_at is null or completed_at >= ${w.end}) and (cancelled_at is null or cancelled_at >= ${w.end})) tomorrow,
 (select count(*)::int from work where planned_at < cancelled_at and result='REPLANNED' and cancelled_at >= ${w.start} and cancelled_at < ${w.end}) as "overdueReplanned",
 (select count(distinct student_id)::int from lifecycle where new_status='FROZEN') frozen,
 (select count(distinct student_id)::int from lifecycle where new_status='STOPPED') stopped,
 (select count(*)::int from appointments where is_legacy and outcome in ('ATTENDED','NO_SHOW') and occurred_at is null and planned_at >= ${w.start} and planned_at < ${w.end}) as "legacyAppointments"
 `;
}

export const dailyReportDetailKinds = ["leads","contacts","appointments","sales","payments","work","statuses"] as const;
export type DetailKind = typeof dailyReportDetailKinds[number];
export function dailyReportDetailsSql(w: Window, kind: DetailKind, offset: number) {
 const queries: Record<DetailKind, Prisma.Sql> = {
 leads: Prisma.sql`select l.id,c.full_name name,l.created_at at,'Yeni lead' description from new_leads l join erp.contacts c on c.id=l.contact_id`,
 contacts: Prisma.sql`select e.id,c.full_name name,e.occurred_at at, e.outcome || ' · ' || e.channel || ' · ' || u.full_name description from contacts e join erp.contacts c on c.id=e.contact_id join erp.users u on u.id=e.actor_id`,
 appointments: Prisma.sql`select a.id,c.full_name name,coalesce(a.occurred_at,a.planned_at) at,a.kind || ' · ' || a.outcome || ' · Plan: ' || to_char(a.planned_at at time zone 'Asia/Baku','DD.MM.YYYY HH24:MI') || coalesce(' · ' || t.full_name,'') || case when a.is_legacy then ' · Köhnə qeyd' else '' end || coalesce(' · ' || a.reason,'') description from appointments a join erp.contacts c on c.id=a.contact_id left join erp.teachers t on t.id=a.teacher_id`,
 sales: Prisma.sql`select x.id,c.full_name name,x.qualified_at::timestamp at,x.kind || ' · ' || x.route || ' · ' || x.status || ' · ' || u.full_name || coalesce(' · Ləğv: ' || x.cancellation_reason,'') description from sales x join erp.students s on s.id=x.student_id join erp.contacts c on c.id=s.contact_id join erp.users u on u.id=x.owner_id union all select x.id,c.full_name name,x.cancelled_at at,'Ləğv: ' || x.cancellation_reason || ' · İlk satış: ' || x.qualified_at::text description from cancellations x join erp.students s on s.id=x.student_id join erp.contacts c on c.id=s.contact_id where not exists(select 1 from sales a where a.id=x.id)`,
 payments: Prisma.sql`select p.id,c.full_name name,p.paid_at::timestamp at,p.amount::text || ' AZN · ' || p.receipt_purpose description from receipts p join erp.students s on s.id=p.student_id join erp.contacts c on c.id=s.contact_id union all select p.id,'Workshop' name,p.paid_at::timestamp at,p.amount::text || ' AZN · OTHER' description from workshop_receipts p`,
 work: Prisma.sql`select x.id,c.full_name name,x.planned_at at,x.kind || ' · ' || case when x.completed_at < ${w.end} then 'Edildi' when x.cancelled_at < ${w.end} then coalesce(x.result,'Ləğv') when x.planned_at < ${w.end} then 'Gecikmiş' else 'Növbəti gün' end || coalesce(' · Nəticə: ' || x.result,'') description from work x join erp.leads l on l.id=x.lead_id join erp.contacts c on c.id=l.contact_id where (x.completed_at >= ${w.start} and x.completed_at < ${w.end}) or (x.cancelled_at >= ${w.start} and x.cancelled_at < ${w.end}) or ((x.completed_at is null or x.completed_at >= ${w.end}) and (x.cancelled_at is null or x.cancelled_at >= ${w.end}) and x.planned_at < ${w.tomorrowEnd})`,
 statuses: Prisma.sql`select h.id,c.full_name name,h.effective_at::timestamp at,h.old_status::text || ' → ' || h.new_status::text description from lifecycle h join erp.students s on s.id=h.student_id join erp.contacts c on c.id=s.contact_id where h.new_status in ('FROZEN','STOPPED')`,
 };
 return Prisma.sql`${dailyReportCtes(w)} select * from (${queries[kind]}) details order by at desc,id limit 51 offset ${offset}`;
}
