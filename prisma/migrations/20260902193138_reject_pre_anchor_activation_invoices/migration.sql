create temp table _pre_anchor_activation_invoice_repairs on commit drop as
select
  student.id as student_id,
  student.code as student_code,
  invoice.id as invoice_id,
  invoice.period_month,
  invoice.due_date,
  invoice.amount,
  invoice.balance_due,
  invoice.status,
  student.billing_anchor_date,
  coalesce(sum(allocation.amount_allocated), 0) as allocated_amount
from erp.students student
join erp.invoices invoice on invoice.student_id = student.id
left join erp.payment_allocations allocation on allocation.invoice_id = invoice.id
where student.code in ('ART-1140', 'ART-1141')
  and student.billing_anchor_date is not null
  and invoice.status <> 'VOID'::erp."InvoiceStatus"
  and invoice.idempotency_key like 'student-activation-%'
  and invoice.period_month = date '2026-08-01'
  and invoice.period_month < date_trunc('month', student.billing_anchor_date)::date
  and invoice.due_date < student.billing_anchor_date
group by
  student.id,
  student.code,
  invoice.id,
  invoice.period_month,
  invoice.due_date,
  invoice.amount,
  invoice.balance_due,
  invoice.status,
  student.billing_anchor_date;

do $$
declare
  repair_count integer;
begin
  select count(*) into repair_count
  from _pre_anchor_activation_invoice_repairs;

  if repair_count not in (0, 2) then
    raise exception
      'Pre-anchor activation invoice repair expected 0 or 2 invoices, found %',
      repair_count;
  end if;

  if exists (
    select 1
    from _pre_anchor_activation_invoice_repairs repair
    where repair.amount <> 149
      or repair.balance_due <> 149
      or repair.allocated_amount <> 0
      or repair.status <> 'OVERDUE'::erp."InvoiceStatus"
  ) then
    raise exception 'Pre-anchor activation invoice repair safety check failed';
  end if;
end;
$$;

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
  'billing.invoice.void_pre_anchor_migration',
  'invoice',
  repair.invoice_id,
  jsonb_build_object(
    'studentCode', repair.student_code,
    'periodMonth', repair.period_month,
    'dueDate', repair.due_date,
    'billingAnchorDate', repair.billing_anchor_date,
    'amount', repair.amount,
    'balanceDue', repair.balance_due,
    'status', repair.status,
    'allocatedAmount', repair.allocated_amount
  ),
  jsonb_build_object(
    'studentCode', repair.student_code,
    'periodMonth', repair.period_month,
    'amount', repair.amount,
    'balanceDue', 0,
    'status', 'VOID'
  ),
  'İlk dərs ayından əvvəl səhv yaradılmış ödənişsiz aktivləşmə fakturası audit izi saxlanılaraq ləğv edildi.',
  now()
from _pre_anchor_activation_invoice_repairs repair
where not exists (
  select 1
  from erp.audit_logs existing_audit
  where existing_audit.action = 'billing.invoice.void_pre_anchor_migration'
    and existing_audit.entity_id = repair.invoice_id
);

update erp.invoices invoice
set
  balance_due = 0,
  status = 'VOID'::erp."InvoiceStatus",
  updated_at = now()
from _pre_anchor_activation_invoice_repairs repair
where invoice.id = repair.invoice_id;

do $$
begin
  if exists (
    select 1
    from erp.students student
    join erp.invoices invoice on invoice.student_id = student.id
    where student.code in ('ART-1140', 'ART-1141')
      and student.billing_anchor_date is not null
      and invoice.status <> 'VOID'::erp."InvoiceStatus"
      and invoice.idempotency_key like 'student-activation-%'
      and invoice.period_month < date_trunc('month', student.billing_anchor_date)::date
      and invoice.due_date < student.billing_anchor_date
  ) then
    raise exception 'Pre-anchor activation invoice repair verification failed';
  end if;
end;
$$;
