-- Completed students must not keep an active slot assignment.
update erp.student_schedule_assignments ssa
set
  valid_to = greatest(ssa.valid_from, coalesce(s.completed_at, current_date)),
  updated_at = now()
from erp.enrollments e
join erp.students s on s.id = e.student_id
where ssa.enrollment_id = e.id
  and s.lifecycle_status = 'COMPLETED'::erp."StudentLifecycleStatus"
  and ssa.valid_to is null;

