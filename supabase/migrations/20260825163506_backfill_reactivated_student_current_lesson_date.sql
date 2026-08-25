-- Normalize students who were reactivated before current-cycle lesson dates
-- were separated from the immutable original lesson date.
with latest_reactivation as (
  select distinct on (h.student_id)
    h.student_id,
    h.effective_at as reactivated_at,
    h.created_at as reactivated_recorded_at
  from erp.student_status_history h
  where h.old_status in (
    'FROZEN'::erp."StudentLifecycleStatus",
    'STOPPED'::erp."StudentLifecycleStatus"
  )
    and h.new_status = 'ACTIVE'::erp."StudentLifecycleStatus"
  order by h.student_id, h.created_at desc, h.id desc
), current_enrollment as (
  select distinct on (e.student_id)
    e.id,
    e.student_id,
    e.start_date as previous_start_date,
    e.first_lesson_at as previous_first_lesson_at,
    lr.reactivated_at
  from erp.enrollments e
  join latest_reactivation lr on lr.student_id = e.student_id
  where e.status in (
    'ACTIVE'::erp."EnrollmentStatus",
    'PAUSED'::erp."EnrollmentStatus"
  )
    and e.created_at <= lr.reactivated_recorded_at
  order by e.student_id, e.start_date desc, e.created_at desc
), changed as (
  update erp.enrollments e
  set
    start_date = current_enrollment.reactivated_at,
    first_lesson_at = current_enrollment.reactivated_at,
    updated_at = now()
  from current_enrollment
  where e.id = current_enrollment.id
    and (
      e.start_date is distinct from current_enrollment.reactivated_at
      or e.first_lesson_at is distinct from current_enrollment.reactivated_at
    )
  returning e.id, e.student_id, e.first_lesson_at
)
insert into erp.audit_logs (
  id,
  action,
  entity_type,
  entity_id,
  before_json,
  after_json,
  reason
)
select
  gen_random_uuid(),
  'student.reactivation.lesson_date.backfill',
  'student',
  changed.student_id,
  jsonb_build_object(
    'enrollmentId', changed.id,
    'currentFirstLessonAt', current_enrollment.previous_first_lesson_at,
    'currentStartDate', current_enrollment.previous_start_date
  ),
  jsonb_build_object(
    'enrollmentId', changed.id,
    'originalFirstLessonAt', s.original_first_lesson_at,
    'currentFirstLessonAt', changed.first_lesson_at,
    'reactivated', true
  ),
  'Mövcud reaktivasiya tarixçəsinə əsasən cari dövrün ilk dərs tarixi bərpa edildi'
from changed
join current_enrollment on current_enrollment.id = changed.id
join erp.students s on s.id = changed.student_id;
