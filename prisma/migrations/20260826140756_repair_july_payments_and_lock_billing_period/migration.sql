set local lock_timeout = '5s';

delete from erp.payment_allocations
where amount_allocated <= 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'erp.payment_allocations'::regclass
      and conname = 'payment_allocations_amount_positive_check'
  ) then
    alter table erp.payment_allocations
      add constraint payment_allocations_amount_positive_check
      check (amount_allocated > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
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
