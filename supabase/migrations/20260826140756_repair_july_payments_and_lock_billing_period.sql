set local lock_timeout = '5s';

create temp table _billing_period_repair on commit drop as
with target_codes(code) as (
  values
    ('ART-1912'), ('ART-1972'), ('ART-2052'), ('ART-2055'), ('ART-2073'),
    ('ART-2112'), ('ART-2132'), ('ART-2152'), ('ART-2252'), ('ART-2272'),
    ('ART-2273'), ('ART-2292'), ('ART-2332'), ('ART-2352'), ('ART-2353'),
    ('ART-2372'), ('ART-2392'), ('ART-2412'), ('ART-2413'), ('ART-2414'),
    ('ART-2452'), ('ART-2473'), ('ART-2474'), ('ART-2492'), ('ART-2533'),
    ('ART-2534'), ('ART-2612'), ('ART-2614'), ('ART-2752'), ('ART-2812')
)
select
  s.id as student_id,
  s.code as student_code,
  c.full_name as student_name,
  s.billing_anchor_date,
  p.id as payment_id,
  p.amount as payment_amount,
  p.paid_at,
  p.payment_month,
  pa.id as wrong_allocation_id,
  pa.amount_allocated,
  i.id as august_invoice_id,
  i.enrollment_id,
  i.issue_date as old_august_issue_date,
  i.due_date as old_august_due_date,
  i.amount as august_amount,
  i.balance_due as old_august_balance,
  i.status as old_august_status
from target_codes target
join erp.students s on s.code = target.code
join erp.contacts c on c.id = s.contact_id
join erp.payments p on p.student_id = s.id
join erp.payment_allocations pa on pa.payment_id = p.id
join erp.invoices i on i.id = pa.invoice_id
where p.schedule_type = 'MONTHLY'::erp."PaymentScheduleType"
  and date_trunc('month', p.paid_at) = date '2026-07-01'
  and date_trunc('month', p.payment_month) = date '2026-07-01'
  and date_trunc('month', i.period_month) = date '2026-08-01'
  and extract(day from p.paid_at) = extract(day from s.billing_anchor_date)
  and coalesce(s.original_first_lesson_at, s.billing_anchor_date) <= p.paid_at
  and p.amount = pa.amount_allocated
  and not exists (
    select 1
    from erp.payments august_payment
    where august_payment.student_id = s.id
      and august_payment.id <> p.id
      and august_payment.schedule_type = 'MONTHLY'::erp."PaymentScheduleType"
      and date_trunc('month', august_payment.paid_at) = date '2026-08-01'
  );

do $$
declare
  repair_count integer;
  student_count integer;
begin
  select count(*), count(distinct student_id)
  into repair_count, student_count
  from _billing_period_repair;

  if repair_count not in (0, 30) or student_count <> repair_count then
    raise exception
      'July billing repair safety check failed: expected 30 audited students (or 0 on idempotent replay), found % rows / % students',
      repair_count,
      student_count;
  end if;
end;
$$;

create temp table _billing_period_repair_before on commit drop as
select
  repair.student_id,
  jsonb_build_object(
    'studentCode', repair.student_code,
    'studentName', repair.student_name,
    'billingAnchorDate', repair.billing_anchor_date,
    'paymentId', repair.payment_id,
    'paidAt', repair.paid_at,
    'paymentMonth', repair.payment_month,
    'paymentAmount', repair.payment_amount,
    'wrongAllocationId', repair.wrong_allocation_id,
    'wrongAllocationAmount', repair.amount_allocated,
    'augustInvoiceId', repair.august_invoice_id,
    'augustIssueDate', repair.old_august_issue_date,
    'augustDueDate', repair.old_august_due_date,
    'augustAmount', repair.august_amount,
    'augustBalance', repair.old_august_balance,
    'augustStatus', repair.old_august_status,
    'julyInvoice', (
      select to_jsonb(july_invoice)
      from (
        select
          invoice.id,
          invoice.issue_date,
          invoice.due_date,
          invoice.amount,
          invoice.balance_due,
          invoice.status
        from erp.invoices invoice
        where invoice.student_id = repair.student_id
          and invoice.enrollment_id = repair.enrollment_id
          and invoice.period_month = date '2026-07-01'
          and invoice.status <> 'VOID'::erp."InvoiceStatus"
        order by invoice.created_at
        limit 1
      ) july_invoice
    )
  ) as snapshot
from _billing_period_repair repair;

insert into erp.invoices (
  id,
  student_id,
  enrollment_id,
  period_month,
  issue_date,
  due_date,
  amount,
  balance_due,
  status,
  idempotency_key,
  created_at,
  updated_at
)
select
  gen_random_uuid(),
  repair.student_id,
  repair.enrollment_id,
  date '2026-07-01',
  make_date(2026, 7, least(extract(day from repair.billing_anchor_date)::integer, 31)),
  make_date(2026, 7, least(extract(day from repair.billing_anchor_date)::integer, 31)),
  repair.august_amount,
  repair.august_amount,
  'OVERDUE'::erp."InvoiceStatus",
  concat('billing-repair-2026-07-', repair.student_code, '-', repair.enrollment_id),
  now(),
  now()
from _billing_period_repair repair
where not exists (
  select 1
  from erp.invoices invoice
  where invoice.student_id = repair.student_id
    and invoice.enrollment_id = repair.enrollment_id
    and invoice.period_month = date '2026-07-01'
    and invoice.status <> 'VOID'::erp."InvoiceStatus"
);

delete from erp.payment_allocations allocation
using _billing_period_repair repair
where allocation.id = repair.wrong_allocation_id;

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
  july_invoice.id,
  repair.amount_allocated,
  'SELECTED_INVOICE'::erp."PaymentAllocationMode",
  now()
from _billing_period_repair repair
join lateral (
  select invoice.id
  from erp.invoices invoice
  where invoice.student_id = repair.student_id
    and invoice.enrollment_id = repair.enrollment_id
    and invoice.period_month = date '2026-07-01'
    and invoice.status <> 'VOID'::erp."InvoiceStatus"
  order by invoice.created_at
  limit 1
) july_invoice on true
where not exists (
  select 1
  from erp.payment_allocations allocation
  where allocation.payment_id = repair.payment_id
    and allocation.invoice_id = july_invoice.id
);

with july_balances as (
  select
    invoice.id,
    repair.billing_anchor_date,
    greatest(
      coalesce(
        (before_snapshot.snapshot -> 'julyInvoice' ->> 'balance_due')::numeric,
        invoice.amount
      ) - repair.amount_allocated,
      0
    ) as balance_due
  from _billing_period_repair repair
  join _billing_period_repair_before before_snapshot
    on before_snapshot.student_id = repair.student_id
  join erp.invoices invoice
    on invoice.student_id = repair.student_id
   and invoice.enrollment_id = repair.enrollment_id
   and invoice.period_month = date '2026-07-01'
   and invoice.status <> 'VOID'::erp."InvoiceStatus"
)
update erp.invoices invoice
set
  issue_date = make_date(2026, 7, least(extract(day from calculated.billing_anchor_date)::integer, 31)),
  due_date = make_date(2026, 7, least(extract(day from calculated.billing_anchor_date)::integer, 31)),
  balance_due = calculated.balance_due,
  status = case
    when calculated.balance_due <= 0 then 'PAID'::erp."InvoiceStatus"
    when calculated.balance_due < invoice.amount then 'PARTIAL'::erp."InvoiceStatus"
    when make_date(2026, 7, least(extract(day from calculated.billing_anchor_date)::integer, 31)) < current_date
      then 'OVERDUE'::erp."InvoiceStatus"
    else 'OPEN'::erp."InvoiceStatus"
  end,
  updated_at = now()
from july_balances calculated
where invoice.id = calculated.id;

with august_balances as (
  select
    invoice.id,
    repair.billing_anchor_date,
    greatest(invoice.amount - coalesce(sum(allocation.amount_allocated), 0), 0) as balance_due
  from _billing_period_repair repair
  join erp.invoices invoice on invoice.id = repair.august_invoice_id
  left join erp.payment_allocations allocation on allocation.invoice_id = invoice.id
  group by invoice.id, invoice.amount, repair.billing_anchor_date
)
update erp.invoices invoice
set
  issue_date = make_date(2026, 8, least(extract(day from calculated.billing_anchor_date)::integer, 31)),
  due_date = make_date(2026, 8, least(extract(day from calculated.billing_anchor_date)::integer, 31)),
  balance_due = calculated.balance_due,
  status = case
    when calculated.balance_due <= 0 then 'PAID'::erp."InvoiceStatus"
    when calculated.balance_due < invoice.amount then 'PARTIAL'::erp."InvoiceStatus"
    when make_date(2026, 8, least(extract(day from calculated.billing_anchor_date)::integer, 31)) < current_date
      then 'OVERDUE'::erp."InvoiceStatus"
    else 'OPEN'::erp."InvoiceStatus"
  end,
  updated_at = now()
from august_balances calculated
where invoice.id = calculated.id;

update erp.payments payment
set
  payment_month = date '2026-07-01',
  next_payment_at = null
from _billing_period_repair repair
where payment.id = repair.payment_id;

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
  'student.billing_period.repair',
  'student',
  repair.student_id,
  before_snapshot.snapshot,
  jsonb_build_object(
    'studentCode', repair.student_code,
    'rule', 'paid_at is transaction date; payment_month is the explicit billing period',
    'payment', (
      select jsonb_build_object(
        'id', payment.id,
        'paidAt', payment.paid_at,
        'paymentMonth', payment.payment_month,
        'amount', payment.amount
      )
      from erp.payments payment
      where payment.id = repair.payment_id
    ),
    'julyInvoice', (
      select jsonb_build_object(
        'id', invoice.id,
        'dueDate', invoice.due_date,
        'amount', invoice.amount,
        'balanceDue', invoice.balance_due,
        'status', invoice.status
      )
      from erp.invoices invoice
      where invoice.student_id = repair.student_id
        and invoice.enrollment_id = repair.enrollment_id
        and invoice.period_month = date '2026-07-01'
        and invoice.status <> 'VOID'::erp."InvoiceStatus"
      order by invoice.created_at
      limit 1
    ),
    'augustInvoice', (
      select jsonb_build_object(
        'id', invoice.id,
        'dueDate', invoice.due_date,
        'amount', invoice.amount,
        'balanceDue', invoice.balance_due,
        'status', invoice.status
      )
      from erp.invoices invoice
      where invoice.id = repair.august_invoice_id
    )
  ),
  '30 audited July payments were detached from August and assigned to July billing invoices.',
  now()
from _billing_period_repair repair
join _billing_period_repair_before before_snapshot
  on before_snapshot.student_id = repair.student_id;

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
  'payment_allocation.zero_removed',
  'payment_allocation',
  allocation.id,
  to_jsonb(allocation),
  null,
  'Zero-value allocations are invalid and were removed before enforcing the positive-amount constraint.',
  now()
from erp.payment_allocations allocation
where allocation.amount_allocated <= 0;

delete from erp.payment_allocations
where amount_allocated <= 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'erp.payment_allocations'::regclass
      and conname = 'payment_allocations_amount_positive_check'
  ) then
    alter table erp.payment_allocations
      add constraint payment_allocations_amount_positive_check
      check (amount_allocated > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'erp.payment_allocations'::regclass
      and conname = 'payment_allocations_payment_invoice_unique'
  ) then
    alter table erp.payment_allocations
      add constraint payment_allocations_payment_invoice_unique
      unique (payment_id, invoice_id);
  end if;
end;
$$;

create or replace function erp.enforce_payment_allocation_billing_period()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  payment_schedule erp."PaymentScheduleType";
  target_month date;
  invoice_month date;
begin
  select
    payment.schedule_type,
    date_trunc('month', payment.payment_month)::date,
    date_trunc('month', invoice.period_month)::date
  into payment_schedule, target_month, invoice_month
  from erp.payments payment
  join erp.invoices invoice on invoice.id = new.invoice_id
  where payment.id = new.payment_id;

  if payment_schedule = 'MONTHLY'::erp."PaymentScheduleType"
     and target_month is distinct from invoice_month then
    raise exception
      'Monthly payment billing period (%) must match invoice period (%)',
      target_month,
      invoice_month
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_payment_allocation_billing_period_trigger
  on erp.payment_allocations;
create trigger enforce_payment_allocation_billing_period_trigger
before insert or update of payment_id, invoice_id
on erp.payment_allocations
for each row
execute function erp.enforce_payment_allocation_billing_period();

create or replace function erp.prevent_duplicate_open_billing_invoice()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if old.student_id is not distinct from new.student_id
       and old.enrollment_id is not distinct from new.enrollment_id
       and date_trunc('month', old.period_month)::date
          is not distinct from date_trunc('month', new.period_month)::date
       and not (
         old.status = 'VOID'::erp."InvoiceStatus"
         and new.status <> 'VOID'::erp."InvoiceStatus"
       ) then
      return new;
    end if;
  end if;

  if new.enrollment_id is not null
     and new.status <> 'VOID'::erp."InvoiceStatus"
     and exists (
       select 1
       from erp.invoices invoice
       where invoice.student_id = new.student_id
         and invoice.enrollment_id = new.enrollment_id
         and invoice.period_month = date_trunc('month', new.period_month)::date
         and invoice.status <> 'VOID'::erp."InvoiceStatus"
         and invoice.id <> new.id
     ) then
    raise exception
      'A non-void invoice already exists for enrollment % and billing month %',
      new.enrollment_id,
      date_trunc('month', new.period_month)::date
      using errcode = '23505';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_duplicate_open_billing_invoice_trigger
  on erp.invoices;
create trigger prevent_duplicate_open_billing_invoice_trigger
before insert or update of student_id, enrollment_id, period_month, status
on erp.invoices
for each row
execute function erp.prevent_duplicate_open_billing_invoice();

create or replace function erp.prevent_allocated_payment_period_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.schedule_type = 'MONTHLY'::erp."PaymentScheduleType"
     and exists (
       select 1
       from erp.payment_allocations allocation
       join erp.invoices invoice on invoice.id = allocation.invoice_id
       where allocation.payment_id = new.id
         and date_trunc('month', invoice.period_month)::date
           <> date_trunc('month', new.payment_month)::date
     ) then
    raise exception
      'Allocated monthly payment period cannot differ from its invoice period'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_allocated_payment_period_change_trigger
  on erp.payments;
create trigger prevent_allocated_payment_period_change_trigger
before update of payment_month, schedule_type
on erp.payments
for each row
execute function erp.prevent_allocated_payment_period_change();
