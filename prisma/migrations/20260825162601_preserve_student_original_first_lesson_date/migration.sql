-- Keep the student's first-ever lesson date separate from the current
-- enrollment/cycle lesson date so reactivation never destroys history.
alter table erp.students
  add column if not exists original_first_lesson_at date;

with first_lesson_candidates as (
  select
    s.id as student_id,
    min(candidate.lesson_date) as original_first_lesson_at
  from erp.students s
  cross join lateral (
    select e.first_lesson_at as lesson_date
    from erp.enrollments e
    where e.student_id = s.id
      and e.first_lesson_at is not null

    union all

    select s.billing_anchor_date
    where s.billing_anchor_date is not null

    union all

    select left(a.before_json ->> 'firstLessonAt', 10)::date
    from erp.audit_logs a
    where a.entity_type = 'student'
      and a.entity_id = s.id
      and a.before_json ->> 'firstLessonAt' ~ '^\d{4}-\d{2}-\d{2}'

    union all

    select left(a.after_json ->> 'firstLessonAt', 10)::date
    from erp.audit_logs a
    where a.entity_type = 'student'
      and a.entity_id = s.id
      and a.after_json ->> 'firstLessonAt' ~ '^\d{4}-\d{2}-\d{2}'

    union all

    select h.effective_at
    from erp.student_status_history h
    where h.student_id = s.id
      and h.new_status = 'ACTIVE'::erp."StudentLifecycleStatus"
  ) candidate
  group by s.id
), preserved as (
  update erp.students s
  set original_first_lesson_at = candidates.original_first_lesson_at
  from first_lesson_candidates candidates
  where s.id = candidates.student_id
    and s.original_first_lesson_at is null
  returning s.id, s.original_first_lesson_at
)
insert into erp.audit_logs (
  id,
  action,
  entity_type,
  entity_id,
  after_json,
  reason
)
select
  gen_random_uuid(),
  'student.first_lesson.preserve',
  'student',
  preserved.id,
  jsonb_build_object('originalFirstLessonAt', preserved.original_first_lesson_at),
  'Tələbənin ümumi ilk dərs tarixi mövcud tarixçədən qorundu'
from preserved;
