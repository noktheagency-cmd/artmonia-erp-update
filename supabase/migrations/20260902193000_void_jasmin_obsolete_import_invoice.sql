create temp table _jasmin_obsolete_import_invoice on commit drop as
select
  s.id as student_id,
  s.code as student_code,
  i.id as invoice_id,
  i.period_month,
  i.due_date,
  i.amount,
  i.balance_due,
  i.status,
  i.idempotency_key
from erp.students s
join erp.invoices i on i.student_id = s.id
where s.code = 'ART-1832'
  and i.period_month = date '2025-09-01'
  and i.due_date = date '2025-09-18'
  and i.amount = 80
  and i.balance_due = i.amount
  and i.status <> 'VOID'::erp."InvoiceStatus"
  and i.period_month < date_trunc('month', s.created_at)::date
  and (
    i.idempotency_key like 'student-period-%'
    or i.idempotency_key like 'student-month-%'
  )
  and not exists (
    select 1
    from erp.payment_allocations allocation
    where allocation.invoice_id = i.id
  )
  and not exists (
    select 1
    from erp.payments payment
    where payment.student_id = s.id
      and payment.schedule_type = 'MONTHLY'::erp."PaymentScheduleType"
      and payment.payment_month = i.period_month
  );

do $$
declare
  repair_count integer;
begin
  select count(*) into repair_count
  from _jasmin_obsolete_import_invoice;

  if repair_count not in (0, 1) then
    raise exception
      'Jasmin obsolete invoice repair safety check failed: expected at most 1 row, found %',
      repair_count;
  end if;

  if repair_count = 0 and not exists (
    select 1
    from erp.students s
    join erp.invoices i on i.student_id = s.id
    where s.code = 'ART-1832'
      and i.period_month = date '2025-09-01'
      and i.due_date = date '2025-09-18'
      and i.amount = 80
      and i.balance_due = 0
      and i.status = 'VOID'::erp."InvoiceStatus"
  ) then
    raise exception
      'Jasmin obsolete invoice repair safety check failed: target is missing and repaired state was not found';
  end if;
end;
$$;

update erp.invoices invoice
set
  balance_due = 0,
  status = 'VOID'::erp."InvoiceStatus",
  updated_at = now()
from _jasmin_obsolete_import_invoice repair
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
  'billing.invoice.void_obsolete_import_period',
  'invoice',
  repair.invoice_id,
  jsonb_build_object(
    'studentCode', repair.student_code,
    'periodMonth', repair.period_month,
    'dueDate', repair.due_date,
    'amount', repair.amount,
    'balanceDue', repair.balance_due,
    'status', repair.status,
    'idempotencyKey', repair.idempotency_key
  ),
  jsonb_build_object(
    'studentCode', repair.student_code,
    'periodMonth', repair.period_month,
    'dueDate', repair.due_date,
    'amount', repair.amount,
    'balanceDue', 0,
    'status', 'VOID',
    'correctedPaymentMonth', '2026-08-01'
  ),
  'İdxal zamanı yanlış sentyabr ayına aid edilən ödəniş sonradan avqusta düzəldildiyi üçün təyinatsız qalan tarixi faktura ləğv edildi.',
  now()
from _jasmin_obsolete_import_invoice repair;

do $$
begin
  if not exists (
    select 1
    from erp.students s
    join erp.invoices i on i.student_id = s.id
    where s.code = 'ART-1832'
      and i.period_month = date '2025-09-01'
      and i.due_date = date '2025-09-18'
      and i.balance_due = 0
      and i.status = 'VOID'::erp."InvoiceStatus"
      and not exists (
        select 1
        from erp.student_billing_cycles cycle
        where cycle.invoice_id = i.id
      )
  ) then
    raise exception
      'Jasmin obsolete invoice repair verification failed';
  end if;
end;
$$;
