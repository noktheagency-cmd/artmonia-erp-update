import { Prisma } from "@/generated/prisma/client";

/** Meeting cohorts follow the appointment date, including leads created in older months. */
export function meetingAnalyticsSql(scope: Prisma.Sql, from: Date | null, until: Date | null, today: Date) {
  const window = Prisma.sql`${from ? Prisma.sql`m.planned_at >= (${from}::date::timestamp at time zone 'Asia/Baku')` : Prisma.sql`true`}
    and ${until ? Prisma.sql`m.planned_at < (${until}::date::timestamp at time zone 'Asia/Baku')` : Prisma.sql`true`}`;
  return Prisma.sql`(
    with meeting_rows as (
      select a.id, a.lead_id, a.teacher_id, a.kind, a.outcome, a.planned_at,
        l.stage, l.converted_student_id,
        exists (select 1 from erp.course_sales cs join erp.students sale_student on sale_student.id=cs.student_id
          where cs.cancelled_at is null and not sale_student.is_test_data
          and (cs.lead_id = l.id or cs.student_id = l.converted_student_id)
          and cs.qualified_at >= (a.planned_at at time zone 'Asia/Baku')::date
          and cs.qualified_at <= (now() at time zone 'Asia/Baku')::date) as sold
      from erp.crm_appointments a join erp.leads l on l.id = a.lead_id
      where ${scope} and a.kind in ('TRIAL', 'CONSULTATION', 'MEETING')
      union all
      select l.id, l.id, null::uuid,
        case when l.next_action_type = 'TRIAL_LESSON_REMINDER' then 'TRIAL' else 'CONSULTATION' end,
        'SCHEDULED', l.next_follow_up_at, l.stage, l.converted_student_id, false
      from erp.leads l where ${scope}
        and l.converted_student_id is null and l.stage not in ('REGISTERED', 'LOST')
        and l.next_action_type in ('TRIAL_LESSON_REMINDER', 'CONSULTATION_REMINDER')
        and l.next_follow_up_at is not null
        and not exists (select 1 from erp.crm_appointments a where a.lead_id = l.id and (
          a.outcome = 'SCHEDULED' or (a.planned_at at time zone 'Asia/Baku')::date = (l.next_follow_up_at at time zone 'Asia/Baku')::date
        ))
    ), period_meetings as (select m.* from meeting_rows m where ${window})
    select jsonb_build_object(
      'scheduled', (select count(*) from period_meetings where outcome <> 'RESCHEDULED'),
      'attended', (select count(*) from period_meetings where outcome = 'ATTENDED'),
      'noShow', (select count(*) from period_meetings where outcome = 'NO_SHOW'),
      'pending', (select count(*) from meeting_rows where outcome = 'SCHEDULED'
        and converted_student_id is null and stage not in ('REGISTERED', 'LOST')),
      'overdue', (select count(*) from meeting_rows where outcome = 'SCHEDULED'
        and converted_student_id is null and stage not in ('REGISTERED', 'LOST')
        and planned_at < (${today}::date::timestamp at time zone 'Asia/Baku')),
      'teachers', coalesce((select jsonb_agg(to_jsonb(stats) order by stats.scheduled desc, stats.teacher)
        from (select m.teacher_id as "teacherId", coalesce(t.full_name, 'Müəllim təyin edilməyib') teacher,
          count(*) filter (where m.outcome <> 'RESCHEDULED')::int scheduled,
          count(*) filter (where m.outcome = 'ATTENDED')::int attended,
          count(*) filter (where m.outcome = 'NO_SHOW')::int "noShow",
          count(*) filter (where m.outcome = 'ATTENDED' and m.sold)::int successful,
          count(*) filter (where m.outcome = 'ATTENDED' and not m.sold and m.stage = 'LOST')::int unsuccessful,
          count(*) filter (where m.outcome = 'SCHEDULED')::int pending
        from period_meetings m left join erp.teachers t on t.id = m.teacher_id
        where m.kind = 'TRIAL' group by m.teacher_id, t.full_name limit 100) stats
      ), '[]'::jsonb)
    )
  )`;
}
