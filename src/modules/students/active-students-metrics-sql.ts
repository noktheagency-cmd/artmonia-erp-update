import { guestOnlyStudentSql } from "./guest-lesson-sql";
import { Prisma } from "@/generated/prisma/client";

/**
 * Operational "Aktiv tələbə" headcount — same definition as /students list
 * and summary cards (`lifecycle_status = ACTIVE`, non-test).
 *
 * Use for every live UI count that must match the students module:
 * owner dashboard KPI, company KPI actual (current incomplete month), etc.
 */
export function currentActiveStudentsSql() {
  return Prisma.sql`(
    select count(*)::int
    from erp.students s
    where s.lifecycle_status = 'ACTIVE'::"erp"."StudentLifecycleStatus"
      and s.is_test_data = false and not ${guestOnlyStudentSql(Prisma.sql`s.id`)}
  )`;
}

/**
 * Point-in-time active count as of an exclusive upper bound.
 *
 * Reconstructs status from student_status_history (falls back to current
 * lifecycle_status when history is missing). Use only for historical
 * comparisons: previous-period trend, month opening balance, completed months.
 */
export function activeStudentsAsOfSql(asOfExclusive: Prisma.Sql) {
  return Prisma.sql`(
    select count(*)::int
    from erp.students s
    where s.registered_at < ${asOfExclusive}
      and s.is_test_data = false and not ${guestOnlyStudentSql(Prisma.sql`s.id`)}
      and coalesce(
        (
          select h.new_status
          from erp.student_status_history h
          where h.student_id = s.id
            and h.effective_at < ${asOfExclusive}
          order by h.effective_at desc, h.created_at desc
          limit 1
        ),
        s.lifecycle_status
      ) = 'ACTIVE'::"erp"."StudentLifecycleStatus"
  )`;
}

/**
 * Company / owner KPI actual for a month:
 * - incomplete (still running) → live students-list snapshot
 * - completed → history as-of month end
 */
export function activeStudentsActualSql(asOfExclusive: Prisma.Sql, isComplete: boolean) {
  return isComplete ? activeStudentsAsOfSql(asOfExclusive) : currentActiveStudentsSql();
}
