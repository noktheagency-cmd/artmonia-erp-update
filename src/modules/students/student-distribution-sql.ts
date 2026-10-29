import { Prisma } from "@/generated/prisma/client";
import { buildTeacherDirectoryScope } from "@/modules/hr/teacher-directory-scope";
import { guestOnlyStudentSql } from "./guest-lesson-sql";

function activeStudentScope() {
  return Prisma.sql`s.lifecycle_status = 'ACTIVE'::"erp"."StudentLifecycleStatus"
    and s.is_test_data = false
    and not ${guestOnlyStudentSql(Prisma.sql`s.id`)}`;
}

/** Keep active programs visible at zero; count only their current real students. */
export function studentProgramDistributionSql() {
  return Prisma.sql`
    select p.name, count(distinct s.id)::int as count
    from erp.programs p
    left join erp.enrollments e on e.program_id = p.id
      and e.status = 'ACTIVE'::"erp"."EnrollmentStatus"
    left join erp.students s on s.id = e.student_id and ${activeStudentScope()}
    where p.is_active = true
    group by p.id, p.name
  `;
}

/** Match the HR teacher directory, including its archive and employment guards. */
export function studentTeacherLoadSql() {
  return Prisma.sql`
    select t.full_name as name, count(distinct s.id)::int as count, t.capacity,
      case when t.capacity > 0 then count(distinct s.id)::numeric / t.capacity end as utilization
    from erp.teachers t
    left join erp.hr_employees he on he.teacher_id = t.id
    left join erp.enrollments e on e.teacher_id = t.id
      and e.status = 'ACTIVE'::"erp"."EnrollmentStatus"
    left join erp.students s on s.id = e.student_id and ${activeStudentScope()}
    ${buildTeacherDirectoryScope()}
    group by t.id, t.full_name, t.capacity
  `;
}
