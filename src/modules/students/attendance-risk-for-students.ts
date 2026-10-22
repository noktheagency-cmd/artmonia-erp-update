import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/server/db/prisma";
import { todayInBaku } from "@/modules/groups/shared";
import { riskyStudentIds, type AttendanceEntry } from "./attendance-analytics";

const RISK_LOOKBACK_DAYS = 93;

/** Current at-risk IDs among the given students (same rule as attendance analytics). */
export async function loadAtRiskStudentIds(studentIds: string[]): Promise<Set<string>> {
  if (studentIds.length === 0) return new Set();

  const today = todayInBaku();
  const from = new Date(`${today}T00:00:00.000Z`);
  from.setUTCDate(from.getUTCDate() - (RISK_LOOKBACK_DAYS - 1));
  const fromDate = from.toISOString().slice(0, 10);

  const rows = await getPrisma().$queryRaw<AttendanceEntry[]>(Prisma.sql`
    select distinct ss.id::text as "sessionId", ss.session_date::text as date, ss.start_time as time,
      t.id::text as "teacherId", t.full_name as teacher, cs.id::text as "groupId",
      coalesce(cs.display_name, cs.weekday::text || ' · ' || cs.start_time) as "group",
      s.id::text as "studentId", c.full_name as student, e.id::text as "enrollmentId", ar.status::text as status,
      s.lifecycle_status::text as "lifecycleStatus"
    from erp.slot_sessions ss
    join erp.class_slots cs on cs.id = ss.slot_id
    join erp.student_schedule_assignments a on a.slot_id = cs.id
      and a.valid_from <= ss.session_date and (a.valid_to is null or a.valid_to >= ss.session_date)
    join erp.enrollments e on e.id = a.enrollment_id and e.start_date <= ss.session_date
    join erp.students s on s.id = e.student_id
    join erp.contacts c on c.id = s.contact_id
    left join erp.attendance_records ar on ar.session_id = ss.id and ar.enrollment_id = e.id
    join erp.teachers t on t.id = coalesce(ar.teacher_id, cs.teacher_id)
    left join lateral (
      select h.new_status, h.freeze_reserved from erp.student_status_history h
      where h.student_id = s.id and h.effective_at <= ss.session_date
      order by h.effective_at desc, h.created_at desc, h.id desc limit 1
    ) history on true
    where s.id in (${Prisma.join(studentIds.map((id) => Prisma.sql`${id}::uuid`))})
      and ss.session_date between ${fromDate}::date and ${today}::date
      and ss.status <> 'CANCELLED'
      and s.is_test_data = false
      and (ss.session_date + ss.end_time::time) at time zone 'Asia/Baku' <= now()
      and coalesce(history.new_status::text, 'ACTIVE') not in ('FROZEN', 'STOPPED', 'DECLINED', 'COMPLETED')
      and not coalesce(history.freeze_reserved, false)
      and not exists (select 1 from erp.student_freeze_periods f where f.student_id = s.id
        and f.start_date <= ss.session_date and (f.end_date is null or f.end_date >= ss.session_date))
    order by date, time, "sessionId", "enrollmentId"
  `);

  return new Set(riskyStudentIds(rows));
}
