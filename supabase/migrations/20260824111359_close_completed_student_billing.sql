-- A completed student has finished the service: keep history, but close every
-- remaining operational and financial obligation.
update erp.students
set
  billing_paused = true,
  completed_at = coalesce(completed_at, current_date),
  updated_at = now()
where lifecycle_status = 'COMPLETED'::erp."StudentLifecycleStatus";

update erp.enrollments e
set
  status = 'COMPLETED'::erp."EnrollmentStatus",
  updated_at = now()
from erp.students s
where e.student_id = s.id
  and s.lifecycle_status = 'COMPLETED'::erp."StudentLifecycleStatus"
  and e.status in (
    'ACTIVE'::erp."EnrollmentStatus",
    'PAUSED'::erp."EnrollmentStatus"
  );

update erp.invoices i
set
  status = 'VOID'::erp."InvoiceStatus",
  balance_due = 0,
  updated_at = now()
from erp.students s
where i.student_id = s.id
  and s.lifecycle_status = 'COMPLETED'::erp."StudentLifecycleStatus"
  and i.status <> 'VOID'::erp."InvoiceStatus"
  and i.balance_due > 0;

update erp.payments p
set next_payment_at = null
from erp.students s
where p.student_id = s.id
  and s.lifecycle_status = 'COMPLETED'::erp."StudentLifecycleStatus"
  and p.next_payment_at is not null;
