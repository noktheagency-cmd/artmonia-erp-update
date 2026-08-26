create temp table _partial_july_repair on commit drop as
select
  s.id as student_id,
  s.code as student_code,
  i.id as invoice_id,
  i.balance_due as old_balance_due,
  i.status as old_status,
  p.id as payment_id,
  pa.amount_allocated
from erp.students s
join erp.invoices i
  on i.student_id = s.id
 and i.period_month = date '2026-07-01'
 and i.status <> 'VOID'::erp."InvoiceStatus"
join erp.payment_allocations pa on pa.invoice_id = i.id
join erp.payments p
  on p.id = pa.payment_id
 and p.student_id = s.id
where s.code = 'ART-2353'
  and p.payment_month = date '2026-07-01'
  and i.balance_due = pa.amount_allocated
  and i.balance_due > 0;

do $$
declare
  repair_count integer;
begin
  select count(*) into repair_count from _partial_july_repair;
  if repair_count not in (0, 1) then
    raise exception
      'Partial July invoice repair safety check failed: expected 1 row (or 0 on idempotent replay), found %',
      repair_count;
  end if;
end;
$$;

update erp.invoices invoice
set
  balance_due = 0,
  status = 'PAID'::erp."InvoiceStatus",
  updated_at = now()
from _partial_july_repair repair
where invoice.id = repair.invoice_id;

insert into erp.audit_logs (
  id,
  actor_user_id,
  action,
  entity_type,
  entity_id,
  before_json,
  after_json,
  reason,
  created_at
)
select
  gen_random_uuid(),
  null,
  'student.billing_period.repair.finalize',
  'student',
  repair.student_id,
  jsonb_build_object(
    'studentCode', repair.student_code,
    'invoiceId', repair.invoice_id,
    'paymentId', repair.payment_id,
    'balanceDue', repair.old_balance_due,
    'status', repair.old_status,
    'movedAllocation', repair.amount_allocated
  ),
  jsonb_build_object(
    'studentCode', repair.student_code,
    'invoiceId', repair.invoice_id,
    'paymentId', repair.payment_id,
    'balanceDue', 0,
    'status', 'PAID',
    'rule', 'Existing inferred balance was reduced by the newly attached July allocation.'
  ),
  'The existing July invoice already included the unallocated July payment in its balance; the moved allocation now settles the remainder.',
  now()
from _partial_july_repair repair;
