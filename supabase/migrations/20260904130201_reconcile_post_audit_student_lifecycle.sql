-- Re-run the reconciliation at deployment time as legacy app instances may still
-- write status-only changes between the initial audit and the new release.
create temporary table post_audit_lifecycle_cleanup on commit drop as
select
  student."id" as student_id,
  student."lifecycle_status" as lifecycle_status,
  coalesce((
    select max(history."effective_at")
    from "erp"."student_status_history" history
    where history."student_id" = student."id"
      and history."new_status" = student."lifecycle_status"
  ), (student."updated_at" at time zone 'Asia/Baku')::date) as effective_at,
  (
    select count(*)::int
    from "erp"."enrollments" enrollment
    join "erp"."student_schedule_assignments" assignment
      on assignment."enrollment_id" = enrollment."id"
    where enrollment."student_id" = student."id"
      and assignment."valid_to" is null
  ) as open_assignment_count,
  (
    select count(*)::int
    from "erp"."enrollments" enrollment
    where enrollment."student_id" = student."id"
      and enrollment."status" = 'ACTIVE'::"erp"."EnrollmentStatus"
  ) as active_enrollment_count
from "erp"."students" student
where student."lifecycle_status" in (
  'SLOT_WAITING'::"erp"."StudentLifecycleStatus",
  'FROZEN'::"erp"."StudentLifecycleStatus",
  'STOPPED'::"erp"."StudentLifecycleStatus",
  'DECLINED'::"erp"."StudentLifecycleStatus"
)
and (
  exists (
    select 1
    from "erp"."enrollments" enrollment
    where enrollment."student_id" = student."id"
      and enrollment."status" = 'ACTIVE'::"erp"."EnrollmentStatus"
  )
  or exists (
    select 1
    from "erp"."enrollments" enrollment
    join "erp"."student_schedule_assignments" assignment
      on assignment."enrollment_id" = enrollment."id"
    where enrollment."student_id" = student."id"
      and assignment."valid_to" is null
  )
);

insert into "erp"."audit_logs" (
  "id", "action", "entity_type", "entity_id", "before_json", "after_json", "reason"
)
select
  gen_random_uuid(),
  'student.lifecycle.reconcile',
  'student',
  cleanup.student_id,
  jsonb_build_object(
    'lifecycleStatus', cleanup.lifecycle_status,
    'activeEnrollmentCount', cleanup.active_enrollment_count,
    'openScheduleAssignmentCount', cleanup.open_assignment_count
  ),
  jsonb_build_object(
    'enrollmentStatus', 'PAUSED',
    'openScheduleAssignmentCount', 0,
    'effectiveAt', cleanup.effective_at
  ),
  'İlkin auditdən sonra yaranmış status, enrollment və slot uyğunsuzluğu düzəldildi'
from post_audit_lifecycle_cleanup cleanup;

delete from "erp"."student_schedule_assignments" assignment
using "erp"."enrollments" enrollment, post_audit_lifecycle_cleanup cleanup
where assignment."enrollment_id" = enrollment."id"
  and enrollment."student_id" = cleanup.student_id
  and assignment."valid_to" is null
  and assignment."valid_from" >= cleanup.effective_at;

update "erp"."student_schedule_assignments" assignment
set
  "valid_to" = cleanup.effective_at - 1,
  "updated_at" = now()
from "erp"."enrollments" enrollment, post_audit_lifecycle_cleanup cleanup
where assignment."enrollment_id" = enrollment."id"
  and enrollment."student_id" = cleanup.student_id
  and assignment."valid_to" is null
  and assignment."valid_from" < cleanup.effective_at;

update "erp"."enrollments" enrollment
set "status" = 'PAUSED'::"erp"."EnrollmentStatus", "updated_at" = now()
from post_audit_lifecycle_cleanup cleanup
where enrollment."student_id" = cleanup.student_id
  and enrollment."status" = 'ACTIVE'::"erp"."EnrollmentStatus";
