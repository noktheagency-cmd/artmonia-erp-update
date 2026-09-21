import { Prisma } from "@/generated/prisma/client";
import type { ErpActor } from "@/server/auth/actor";
import { scopeFor } from "@/server/rbac/permissions";

export function retentionScope(actor: ErpActor) {
  const students = scopeFor(actor.permissions, "student.read");
  const attendance = scopeFor(actor.permissions, "attendance.read");
  return Prisma.sql`
    (${students === "ALL" ? Prisma.sql`true` : students === "ASSIGNED" ? Prisma.sql`s.manager_id = ${actor.id}::uuid` : Prisma.sql`false`})
    and (${attendance === "ALL" ? Prisma.sql`true` : attendance === "ASSIGNED" ? Prisma.sql`exists (
      select 1 from relations r join erp.teachers t on t.id = r.teacher_id
      where r.student_id = s.id and t.user_id = ${actor.id}::uuid
    )` : Prisma.sql`false`})
  `;
}

// Shared by the dashboard summary and the student dialog. Events are period-local,
// students are counted once, and freeze reservations are not counted twice.
export function retentionCtes(from: string, to: string, scope: Prisma.Sql, teacherId?: string, groupId?: string) {
  return Prisma.sql`
    with relations as (
      select distinct e.student_id, cs.teacher_id, cs.id as group_id
      from erp.enrollments e join erp.student_schedule_assignments a on a.enrollment_id = e.id
      join erp.class_slots cs on cs.id = a.slot_id
      where e.start_date <= ${to}::date and a.valid_from <= ${to}::date
        and (a.valid_to is null or a.valid_to >= ${from}::date - 1)
      union
      select e.student_id, e.teacher_id, null::uuid from erp.enrollments e
      where e.start_date <= ${to}::date and e.teacher_id is not null
        and not exists (select 1 from erp.student_schedule_assignments a where a.enrollment_id = e.id)
    ), base as (
      select s.id, s.contact_id, s.manager_id from erp.students s
      where not s.is_test_data and s.registered_at <= ${to}::date and ${scope}
    ), population as (
      select s.* from base s where
        ${teacherId || groupId ? Prisma.sql`exists (select 1 from relations r where r.student_id = s.id
          ${teacherId ? Prisma.sql`and r.teacher_id = ${teacherId}::uuid` : Prisma.empty}
          ${groupId ? Prisma.sql`and r.group_id = ${groupId}::uuid` : Prisma.empty})` : Prisma.sql`true`}
    ), events as (
      select h.id, h.student_id, h.new_status::text as status, h.effective_at as date, h.reason, h.note
      from erp.student_status_history h join population p on p.id = h.student_id
      where h.effective_at between ${from}::date and ${to}::date
        and h.new_status::text in ('FROZEN', 'STOPPED')
        and h.old_status is distinct from h.new_status
      union all
      select f.id, f.student_id, 'FROZEN', f.start_date, 'Dondurma dövrü', f.note
      from erp.student_freeze_periods f join population p on p.id = f.student_id
      where f.start_date between ${from}::date and ${to}::date
    ), losses as (
      select distinct on (student_id, status) * from events
      order by student_id, status, date desc, id desc
    )
  `;
}

export const retentionSummarySql = Prisma.sql`
  (select count(*)::int from population) as population,
  (select count(*)::int from losses where status = 'FROZEN') as frozen,
  (select count(*)::int from losses where status = 'STOPPED') as stopped,
  (select count(distinct student_id)::int from losses) as total
`;
