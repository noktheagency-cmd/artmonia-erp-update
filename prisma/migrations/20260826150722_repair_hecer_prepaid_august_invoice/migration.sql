+create temp table _hecer_august_prepayment_repair on commit drop as
with candidate as (
  select
    s.id as student_id,
    s.code as student_code,
    s.billing_anchor_date as old_billing_anchor_date,
    s.original_first_lesson_at,
    i.id as invoice_id,
    i.balance_due as old_balance_due,
    i.status as old_invoice_status,
    p.id as payment_id,
    p.amount as payment_amount,
    p.paid_at,
    greatest(
      p.amount - coalesce((
        select sum(existing_allocation.amount_allocated)
        from erp.payment_allocations existing_allocation
        where existing_allocation.payment_id = p.id
      ), 0),
      0
    ) as unallocated_amount
  from erp.students s
  join erp.invoices i
    on i.student_id = s.id
   and i.period_month = date '2026-08-01'
   and i.status <> 'VOID'::erp."InvoiceStatus"
  join erp.payments p
    on p.student_id = s.id
   and p.schedule_type = 'MONTHLY'::erp."PaymentScheduleType"
   and p.payment_month = date '2026-08-01'
  where s.code = 'ART-1133'
    and s.original_first_lesson_at = date '2026-08-28'
    and i.due_date = date '2026-08-28'
    and i.balance_due > 0
)
select
  candidate.*,
  least(candidate.old_balance_due, candidate.unallocated_amount) as amount_to_allocate
from candidate
where candidate.unallocated_amount > 0;

do $$
declare
  repair_count integer;
begin
  select count(*) into repair_count
  from _hecer_august_prepayment_repair;

  if repair_count not in (0, 1) then
    raise exception
      'Hecer prepayment repair safety check failed: expected 1 row (or 0 on idempotent replay), found %',
      repair_count;
  end if;

  if repair_count = 1 and exists (
    select 1
    from _hecer_august_prepayment_repair
    where amount_to_allocate <> 149
       or payment_amount <> 149
       or old_balance_due <> 149
  ) then
    raise exception
      'Hecer prepayment repair safety check failed: expected an exact 149 AZN payment and invoice balance';
  end if;

  if repair_count = 0 and not exists (
    select 1
    from erp.students s
    join erp.invoices i
      on i.student_id = s.id
     and i.period_month = date '2026-08-01'
     and i.status = 'PAID'::erp."InvoiceStatus"
     and i.balance_due = 0
    join erp.payment_allocations pa on pa.invoice_id = i.id
    join erp.payments p
      on p.id = pa.payment_id
     and p.student_id = s.id
     and p.payment_month = date '2026-08-01'
    where s.code = 'ART-1133'
      and s.billing_anchor_date = date '2026-08-28'
      and pa.amount_allocated = 149
  ) then
    raise exception
      'Hecer prepayment repair safety check failed: target row is missing and the repaired state was not found';
  end if;
end;
$$;

update erp.students student
set
  billing_anchor_date = repair.original_first_lesson_at,
  updated_at = now()
from _hecer_august_prepayment_repair repair
where student.id = repair.student_id
  and student.billing_anchor_date is null;

insert into erp.payment_allocations (
  id,
  payment_id,
  invoice_id,
  amount_allocated,
  mode,
  created_at
)
select
  gen_random_uuid(),
  repair.payment_id,
  repair.invoice_id,
  repair.amount_to_allocate,
  'SELECTED_INVOICE'::erp."PaymentAllocationMode",
  now()
from _hecer_august_prepayment_repair repair
on conflict (payment_id, invoice_id) do nothing;

update erp.invoices invoice
set
  balance_due = greatest(invoice.balance_due - repair.amount_to_allocate, 0),
  status = case
    when greatest(invoice.balance_due - repair.amount_to_allocate, 0) = 0
      then 'PAID'::erp."InvoiceStatus"
    when invoice.due_date < current_date
      then 'OVERDUE'::erp."InvoiceStatus"
    else 'PARTIAL'::erp."InvoiceStatus"
  end,
  updated_at = now()
from _hecer_august_prepayment_repair repair
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
  'student.prepayment.reconcile',
  'student',
  repair.student_id,
  jsonb_build_object(
    'studentCode', repair.student_code,
    'billingAnchorDate', repair.old_billing_anchor_date,
    'invoiceId', repair.invoice_id,
    'invoiceBalance', repair.old_balance_due,
    'invoiceStatus', repair.old_invoice_status,
    'paymentId', repair.payment_id,
    'unallocatedPayment', repair.unallocated_amount
  ),
  jsonb_build_object(
    'studentCode', repair.student_code,
    'billingAnchorDate', repair.original_first_lesson_at,
    'invoiceId', repair.invoice_id,
    'invoiceBalance', greatest(repair.old_balance_due - repair.amount_to_allocate, 0),
    'invoiceStatus', case
      when greatest(repair.old_balance_due - repair.amount_to_allocate, 0) = 0 then 'PAID'
      else 'PARTIAL'
    end,
    'paymentId', repair.payment_id,
    'allocatedAmount', repair.amount_to_allocate,
    'paymentMonth', '2026-08-01'
  ),
  'İlk dərsdən əvvəl qəbul edilmiş avqust ödənişi sonradan yaranan avqust fakturası ilə bağlandı.',
  now()
from _hecer_august_prepayment_repair repair;

do $$
begin
  if exists (
    select 1
    from erp.students s
    join erp.invoices i
      on i.student_id = s.id
     and i.period_month = date '2026-08-01'
    where s.code = 'ART-1133'
      and (
        s.billing_anchor_date is distinct from date '2026-08-28'
        or i.balance_due <> 0
        or i.status <> 'PAID'::erp."InvoiceStatus"
        or not exists (
          select 1
          from erp.payment_allocations pa
          join erp.payments p on p.id = pa.payment_id
          where pa.invoice_id = i.id
            and p.student_id = s.id
            and p.payment_month = date '2026-08-01'
            and pa.amount_allocated = 149
        )
      )
  ) then
    raise exception 'Hecer prepayment repair verification failed';
  end if;
end;
$$;

