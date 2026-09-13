import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { requireErpActor } from "@/server/auth/actor";
import { assertPermission, scopeFor } from "@/server/rbac/permissions";
import { getPrisma } from "@/server/db/prisma";
import { PublicActionError } from "@/server/actions/public-action-error";
import { todayInBaku } from "@/modules/groups/shared";
import { attendancePeriod, attendanceStats, type AttendanceEntry, type AttendanceReport } from "./attendance-analytics";
import { attendanceAnalyticsScope } from "./attendance-analytics-scope";

export async function getAttendanceReport(input: unknown): Promise<AttendanceReport> {
  const actor = await requireErpActor("student.read");
  assertPermission(actor.permissions, "attendance.read");
  const today = todayInBaku();
  let period: ReturnType<typeof attendancePeriod>;
  try { period = attendancePeriod(input, today); }
  catch { throw new PublicActionError("Düzgün tarix aralığı seçin (ən çox 93 gün, gələcək tarix olmadan)."); }
  const studentScope = scopeFor(actor.permissions, "student.read");
  const attendanceScope = scopeFor(actor.permissions, "attendance.read");
  const rows = await getPrisma().$queryRaw<AttendanceEntry[]>(Prisma.sql`
    select distinct ss.id::text as "sessionId", ss.session_date::text as date, ss.start_time as time,
      t.id::text as "teacherId", t.full_name as teacher, cs.id::text as "groupId",
      coalesce(cs.display_name, cs.weekday::text || ' · ' || cs.start_time) as "group",
      s.id::text as "studentId", c.full_name as student, e.id::text as "enrollmentId", ar.status::text as status
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
    where ss.session_date between ${period.previousFrom}::date and ${period.to}::date
      and ss.status <> 'CANCELLED'
      and (ss.session_date + ss.end_time::time) at time zone 'Asia/Baku' <= now()
      and coalesce(history.new_status::text, 'ACTIVE') not in ('FROZEN', 'STOPPED', 'DECLINED', 'COMPLETED')
      and not coalesce(history.freeze_reserved, false)
      and not exists (select 1 from erp.student_freeze_periods f where f.student_id = s.id
        and f.start_date <= ss.session_date and (f.end_date is null or f.end_date >= ss.session_date))
      and ${attendanceAnalyticsScope(actor.id, studentScope, attendanceScope)}
    order by date, time, "sessionId", "enrollmentId"
    limit 20001
  `);
  if (rows.length > 20000) throw new PublicActionError("Məlumat çoxdur. Daha qısa tarix aralığı seçin.");
  return { ...period, entries: rows.filter((row) => row.date >= period.from), previousRate: attendanceStats(rows.filter((row) => row.date < period.from)).rate };
}
