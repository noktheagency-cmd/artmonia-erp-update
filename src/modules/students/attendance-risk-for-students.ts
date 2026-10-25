import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/server/db/prisma";
import { todayInBaku } from "@/modules/groups/shared";
import type { PermissionScope } from "@/server/rbac/permissions";
import { attendanceAnalyticsScope } from "./attendance-analytics-scope";
import {
  attendanceRiskPeriod,
  studentAttendanceRisks,
  type AttendanceEntry,
  type StudentAttendanceRisk,
} from "./attendance-analytics";

type RiskScope = {
  actorId: string;
  studentScope: PermissionScope | null;
  attendanceScope: PermissionScope | null;
  studentIds?: string[];
};

async function loadAttendanceEntries({ studentIds, actorId, studentScope, attendanceScope }: RiskScope) {
  if (!studentScope || !attendanceScope || studentIds?.length === 0) return [];
  const { from, to } = attendanceRiskPeriod(todayInBaku());

  const idsSql = studentIds
    ? Prisma.sql`and s.id in (${Prisma.join(studentIds.map((id) => Prisma.sql`${id}::uuid`))})`
    : Prisma.empty;

  return getPrisma().$queryRaw<AttendanceEntry[]>(Prisma.sql`
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
    where ss.session_date between ${from}::date and ${to}::date
      ${idsSql}
      and ${attendanceAnalyticsScope(actorId, studentScope, attendanceScope)}
      and ss.status <> 'CANCELLED'
      and s.is_test_data = false
      and (ss.session_date + ss.end_time::time) at time zone 'Asia/Baku' <= now()
      and coalesce(history.new_status::text, 'ACTIVE') not in ('FROZEN', 'STOPPED', 'DECLINED', 'COMPLETED')
      and not coalesce(history.freeze_reserved, false)
      and not exists (select 1 from erp.student_freeze_periods f where f.student_id = s.id
        and f.start_date <= ss.session_date and (f.end_date is null or f.end_date >= ss.session_date))
    order by date, time, "sessionId", "enrollmentId"
  `);
}

/** Siyahı üçün: tələbə → risk (2 qayıb = warning, 3+ = danger). */
export async function loadStudentRisks(studentIds: string[], scope: Omit<RiskScope, "studentIds">): Promise<Map<string, StudentAttendanceRisk>> {
  if (studentIds.length === 0) return new Map();
  return studentAttendanceRisks(await loadAttendanceEntries({ ...scope, studentIds }));
}

export type StudentRiskPanelItem = StudentAttendanceRisk & { code: string };

/** Sağ kart üçün: qırmızılar yuxarıda, sonra sarılar. */
export async function loadRiskPanelStudents(scope: Omit<RiskScope, "studentIds">): Promise<StudentRiskPanelItem[]> {
  const risks = [...studentAttendanceRisks(await loadAttendanceEntries(scope)).values()];
  if (risks.length === 0) return [];

  const students = await getPrisma().student.findMany({
    where: { id: { in: risks.map((risk) => risk.studentId) } },
    select: { id: true, code: true },
  });
  const codes = new Map(students.map((student) => [student.id, student.code]));

  return risks
    .map((risk) => ({ ...risk, code: codes.get(risk.studentId) ?? "—" }))
    .sort((a, b) =>
      Number(b.level === "danger") - Number(a.level === "danger")
      || b.streak - a.streak
      || a.student.localeCompare(b.student, "az"));
}
