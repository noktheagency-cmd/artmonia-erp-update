set local lock_timeout = '5s';
set local statement_timeout = '60s';

select pg_advisory_xact_lock(hashtextextended('erp.student-billing-reconciliation', 0));
lock table erp.payments, erp.invoices, erp.payment_allocations
  in share row exclusive mode;

create or replace function erp.student_is_billable_on_date(
  target_student_id uuid,
  target_date date
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when student.lifecycle_status <> 'ACTIVE'::erp."StudentLifecycleStatus" then false
    when student.billing_paused then false
    else coalesce((
      select case
        when history.new_status in (
          'FROZEN'::erp."StudentLifecycleStatus",
          'STOPPED'::erp."StudentLifecycleStatus",
          'DECLINED'::erp."StudentLifecycleStatus",
          'COMPLETED'::erp."StudentLifecycleStatus"
        ) then false
        else true
      end
      from erp.student_status_history history
      where history.student_id = student.id
        and history.effective_at <= target_date
      order by history.effective_at desc, history.created_at desc, history.id desc
      limit 1
    ), true)
  end
  from erp.students student
  where student.id = target_student_id;
$$;

revoke all on function erp.student_is_billable_on_date(uuid, date)
  from public, anon, authenticated;

-- Billing-cycle boundaries must always retain the original anchor day. Using an
-- invoice due date as the next month's anchor breaks 29/30/31-day students.
create or replace function erp.sync_student_billing_cycle_from_invoice()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  latest_payment_id uuid;
  latest_paid_at date;
  anchor_date date;
begin
  if new.enrollment_id is null or new.status = 'VOID'::erp."InvoiceStatus" then
    if new.status = 'VOID'::erp."InvoiceStatus" then
      delete from erp.student_billing_cycles where invoice_id = new.id;
    end if;
    return new;
  end if;

  select student.billing_anchor_date
  into anchor_date
  from erp.students student
  where student.id = new.student_id;

  if anchor_date is null then
    anchor_date := new.due_date;
  end if;

  select payment.id, payment.paid_at
  into latest_payment_id, latest_paid_at
  from erp.payment_allocations allocation
  join erp.payments payment on payment.id = allocation.payment_id
  where allocation.invoice_id = new.id
  order by payment.paid_at desc, payment.created_at desc, payment.id desc
  limit 1;

  insert into erp.student_billing_cycles (
    student_id,
    enrollment_id,
    invoice_id,
    payment_id,
    cycle_start,
    cycle_end,
    due_date,
    amount,
    status,
    paid_at
  ) values (
    new.student_id,
    new.enrollment_id,
    new.id,
    latest_payment_id,
    new.due_date,
    erp.billing_date_for_month(
      anchor_date,
      (date_trunc('month', new.period_month) + interval '1 month')::date
    ) - 1,
    new.due_date,
    new.amount,
    new.status,
    case when new.status = 'PAID'::erp."InvoiceStatus" then latest_paid_at end
  )
  on conflict (invoice_id) do update set
    payment_id = excluded.payment_id,
    cycle_start = excluded.cycle_start,
    cycle_end = excluded.cycle_end,
    due_date = excluded.due_date,
    amount = excluded.amount,
    status = excluded.status,
    paid_at = excluded.paid_at,
    updated_at = now();

  return new;
end;
$$;

revoke all on function erp.sync_student_billing_cycle_from_invoice()
  from public, anon, authenticated;

create or replace function erp.materialize_due_student_invoices(
  as_of_date date default ((now() at time zone 'Asia/Baku')::date)
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  created_count integer := 0;
begin
  if as_of_date is null then
    raise exception 'Billing materialization date is required';
  end if;

  if not pg_try_advisory_xact_lock(
    hashtextextended('erp.materialize-due-student-invoices', 0)
  ) then
    return 0;
  end if;

  with candidates as (
    select
      student.id as student_id,
      student.code as student_code,
      enrollment.id as enrollment_id,
      date_trunc('month', as_of_date)::date as period_month,
      erp.billing_date_for_month(
        student.billing_anchor_date,
        date_trunc('month', as_of_date)::date
      ) as due_date,
      enrollment.monthly_fee as amount
    from erp.students student
    join erp.enrollments enrollment on enrollment.student_id = student.id
    where student.lifecycle_status = 'ACTIVE'::erp."StudentLifecycleStatus"
      and student.billing_paused = false
      and student.is_test_data = false
      and student.billing_anchor_date is not null
      and enrollment.status = 'ACTIVE'::erp."EnrollmentStatus"
      and enrollment.monthly_fee > 0
      and student.billing_anchor_date <= as_of_date
      and erp.billing_date_for_month(
        student.billing_anchor_date,
        date_trunc('month', as_of_date)::date
      ) <= as_of_date
      and erp.student_is_billable_on_date(
        student.id,
        erp.billing_date_for_month(
          student.billing_anchor_date,
          date_trunc('month', as_of_date)::date
        )
      )
  ), inserted as (
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
      candidate.student_id,
      candidate.enrollment_id,
      candidate.period_month,
      candidate.due_date,
      candidate.due_date,
      candidate.amount,
      candidate.amount,
      case
        when candidate.due_date < as_of_date then 'OVERDUE'::erp."InvoiceStatus"
        else 'OPEN'::erp."InvoiceStatus"
      end,
      concat(
        'billing-auto-',
        candidate.student_code,
        '-',
        candidate.enrollment_id,
        '-',
        candidate.period_month
      ),
      now(),
      now()
    from candidates candidate
    on conflict (student_id, enrollment_id, period_month)
      where enrollment_id is not null
        and status <> 'VOID'::erp."InvoiceStatus"
    do nothing
    returning id, student_id, enrollment_id, period_month, due_date, amount
  ), audited as (
    insert into erp.audit_logs (
      id,
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
      'student.billing_cycle.materialize',
      'student',
      inserted.student_id,
      null,
      jsonb_build_object(
        'invoiceId', inserted.id,
        'enrollmentId', inserted.enrollment_id,
        'periodMonth', inserted.period_month,
        'dueDate', inserted.due_date,
        'amount', inserted.amount
      ),
      'Aylıq billing dövrü təsdiqlənmiş ilk dərs tarixinə əsasən avtomatik yaradıldı',
      now()
    from inserted
    returning 1
  )
  select count(*)::integer into created_count from inserted;

  update erp.invoices invoice
  set
    status = case
      when invoice.balance_due <= 0 then 'PAID'::erp."InvoiceStatus"
      when invoice.balance_due < invoice.amount then 'PARTIAL'::erp."InvoiceStatus"
      when invoice.due_date < as_of_date then 'OVERDUE'::erp."InvoiceStatus"
      else 'OPEN'::erp."InvoiceStatus"
    end,
    updated_at = now()
  where invoice.status <> 'VOID'::erp."InvoiceStatus"
    and invoice.balance_due > 0
    and invoice.status is distinct from case
      when invoice.balance_due < invoice.amount then 'PARTIAL'::erp."InvoiceStatus"
      when invoice.due_date < as_of_date then 'OVERDUE'::erp."InvoiceStatus"
      else 'OPEN'::erp."InvoiceStatus"
    end;

  return created_count;
end;
$$;

revoke all on function erp.materialize_due_student_invoices(date)
  from public, anon, authenticated;

-- Preserve a before-image for every student whose ledger can change below.
create temp table _billing_repair_students on commit drop as
select distinct candidate.student_id
from (
  select payment.student_id
  from erp.payments payment
  left join erp.payment_allocations allocation on allocation.payment_id = payment.id
  left join erp.invoices invoice on invoice.id = allocation.invoice_id
  where payment.schedule_type = 'MONTHLY'::erp."PaymentScheduleType"
  group by payment.id
  having payment.amount is distinct from coalesce(sum(allocation.amount_allocated), 0)
    or bool_or(
      invoice.id is not null
      and date_trunc('month', payment.payment_month)::date
        is distinct from date_trunc('month', invoice.period_month)::date
    )

  union

  select invoice.student_id
  from erp.invoices invoice
  left join erp.payment_allocations allocation on allocation.invoice_id = invoice.id
  where invoice.status <> 'VOID'::erp."InvoiceStatus"
  group by invoice.id
  having invoice.balance_due is distinct from greatest(
    invoice.amount - coalesce(sum(allocation.amount_allocated), 0),
    0
  )

  union

  select payment.student_id
  from erp.payments payment
  where payment.schedule_type = 'MONTHLY'::erp."PaymentScheduleType"
    and not exists (
      select 1
      from erp.invoices invoice
      where invoice.student_id = payment.student_id
        and invoice.period_month = date_trunc('month', payment.payment_month)::date
        and invoice.status <> 'VOID'::erp."InvoiceStatus"
    )
) candidate;

create temp table _billing_repair_before on commit drop as
select
  repair.student_id,
  jsonb_build_object(
    'openBalance', coalesce((
      select sum(invoice.balance_due)
      from erp.invoices invoice
      where invoice.student_id = repair.student_id
        and invoice.status <> 'VOID'::erp."InvoiceStatus"
        and invoice.balance_due > 0
    ), 0),
    'periodMismatchCount', (
      select count(*)
      from erp.payment_allocations allocation
      join erp.payments payment on payment.id = allocation.payment_id
      join erp.invoices invoice on invoice.id = allocation.invoice_id
      where payment.student_id = repair.student_id
        and payment.schedule_type = 'MONTHLY'::erp."PaymentScheduleType"
        and date_trunc('month', payment.payment_month)::date
          is distinct from date_trunc('month', invoice.period_month)::date
    ),
    'unallocatedMonthlyAmount', coalesce((
      select sum(greatest(payment.amount - allocated.amount, 0))
      from erp.payments payment
      cross join lateral (
        select coalesce(sum(allocation.amount_allocated), 0) as amount
        from erp.payment_allocations allocation
        where allocation.payment_id = payment.id
      ) allocated
      where payment.student_id = repair.student_id
        and payment.schedule_type = 'MONTHLY'::erp."PaymentScheduleType"
    ), 0)
  ) as snapshot
from _billing_repair_students repair;

-- Older imports sometimes left monthly invoices detached from the student's
-- only enrollment. Repairing the relation lets every monthly invoice own a
-- billing cycle without touching explicit one-time invoices.
with single_enrollment as (
  select enrollment.student_id, min(enrollment.id::text)::uuid as enrollment_id
  from erp.enrollments enrollment
  group by enrollment.student_id
  having count(*) = 1
)
update erp.invoices invoice
set enrollment_id = single_enrollment.enrollment_id,
    updated_at = now()
from single_enrollment
where invoice.student_id = single_enrollment.student_id
  and invoice.enrollment_id is null
  and invoice.status <> 'VOID'::erp."InvoiceStatus"
  and coalesce(invoice.idempotency_key, '') not like 'student-one-time-%'
  and not exists (
    select 1
    from erp.invoices existing
    where existing.student_id = invoice.student_id
      and existing.enrollment_id = single_enrollment.enrollment_id
      and existing.period_month = invoice.period_month
      and existing.status <> 'VOID'::erp."InvoiceStatus"
  );

-- Materialize an invoice for every explicit historical payment month that has
-- no invoice. The old allocation is only a fee/enrollment hint; payment_month
-- remains the immutable source of truth for the period.
create temp table _missing_payment_period_invoices on commit drop as
with payment_periods as (
  select
    payment.student_id,
    date_trunc('month', payment.payment_month)::date as period_month,
    sum(payment.amount) as payment_total
  from erp.payments payment
  where payment.schedule_type = 'MONTHLY'::erp."PaymentScheduleType"
  group by payment.student_id, date_trunc('month', payment.payment_month)::date
), missing_periods as (
  select payment_period.*
  from payment_periods payment_period
  where not exists (
    select 1
    from erp.invoices invoice
    where invoice.student_id = payment_period.student_id
      and invoice.period_month = payment_period.period_month
      and invoice.status <> 'VOID'::erp."InvoiceStatus"
  )
)
select
  missing.student_id,
  missing.period_month,
  missing.payment_total,
  coalesce(hint.enrollment_id, fallback.enrollment_id) as enrollment_id,
  coalesce(hint.source_amount, fallback.monthly_fee, missing.payment_total) as amount
from missing_periods missing
left join lateral (
  select
    invoice.enrollment_id,
    invoice.amount as source_amount
  from erp.payments payment
  join erp.payment_allocations allocation on allocation.payment_id = payment.id
  join erp.invoices invoice on invoice.id = allocation.invoice_id
  where payment.student_id = missing.student_id
    and date_trunc('month', payment.payment_month)::date = missing.period_month
  order by
    (invoice.enrollment_id is not null) desc,
    allocation.amount_allocated desc,
    invoice.created_at asc,
    invoice.id asc
  limit 1
) hint on true
left join lateral (
  select enrollment.id as enrollment_id, enrollment.monthly_fee
  from erp.enrollments enrollment
  where enrollment.student_id = missing.student_id
  order by
    (enrollment.first_lesson_at is null) asc,
    abs(enrollment.start_date - missing.period_month) asc,
    enrollment.created_at asc,
    enrollment.id asc
  limit 1
) fallback on true;

do $$
begin
  if exists (
    select 1 from _missing_payment_period_invoices where enrollment_id is null
  ) then
    raise exception 'Billing reconciliation requires an enrollment for every monthly payment period';
  end if;
end;
$$;

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
  missing.student_id,
  missing.enrollment_id,
  missing.period_month,
  erp.billing_date_for_month(student.billing_anchor_date, missing.period_month),
  erp.billing_date_for_month(student.billing_anchor_date, missing.period_month),
  missing.amount,
  missing.amount,
  case
    when erp.billing_date_for_month(student.billing_anchor_date, missing.period_month)
      < ((now() at time zone 'Asia/Baku')::date)
      then 'OVERDUE'::erp."InvoiceStatus"
    else 'OPEN'::erp."InvoiceStatus"
  end,
  concat(
    'billing-reconcile-',
    student.code,
    '-',
    missing.enrollment_id,
    '-',
    missing.period_month
  ),
  now(),
  now()
from _missing_payment_period_invoices missing
join erp.students student on student.id = missing.student_id
where student.billing_anchor_date is not null
  and not exists (
    select 1
    from erp.invoices invoice
    where invoice.student_id = missing.student_id
      and invoice.enrollment_id = missing.enrollment_id
      and invoice.period_month = missing.period_month
      and invoice.status <> 'VOID'::erp."InvoiceStatus"
  );

-- Detach monthly allocations before canonicalizing duplicate obligations. The
-- period-aware rebuild below will restore every valid allocation deterministically.
delete from erp.payment_allocations allocation
using erp.payments payment
where payment.id = allocation.payment_id
  and payment.schedule_type = 'MONTHLY'::erp."PaymentScheduleType";

-- If a detached legacy invoice duplicates an enrollment-backed obligation for
-- the same month, the enrollment-backed row is canonical.
update erp.invoices invoice
set status = 'VOID'::erp."InvoiceStatus",
    balance_due = 0,
    updated_at = now()
where invoice.enrollment_id is null
  and invoice.status <> 'VOID'::erp."InvoiceStatus"
  and coalesce(invoice.idempotency_key, '') not like 'student-one-time-%'
  and not exists (
    select 1 from erp.payment_allocations allocation where allocation.invoice_id = invoice.id
  )
  and exists (
    select 1
    from erp.invoices canonical
    where canonical.student_id = invoice.student_id
      and canonical.enrollment_id is not null
      and canonical.period_month = invoice.period_month
      and canonical.status <> 'VOID'::erp."InvoiceStatus"
  );

with ranked_invoices as (
  select
    invoice.id,
    row_number() over (
      partition by invoice.student_id, invoice.enrollment_id, invoice.period_month
      order by invoice.created_at asc, invoice.id asc
    ) as position
  from erp.invoices invoice
  where invoice.enrollment_id is not null
    and invoice.status <> 'VOID'::erp."InvoiceStatus"
)
update erp.invoices invoice
set status = 'VOID'::erp."InvoiceStatus",
    balance_due = 0,
    updated_at = now()
from ranked_invoices ranked
where ranked.id = invoice.id
  and ranked.position > 1
  and not exists (
    select 1
    from erp.payment_allocations allocation
    where allocation.invoice_id = invoice.id
  );

-- A monthly invoice date is derived only from the protected billing anchor.
update erp.invoices invoice
set
  issue_date = erp.billing_date_for_month(student.billing_anchor_date, invoice.period_month),
  due_date = erp.billing_date_for_month(student.billing_anchor_date, invoice.period_month),
  updated_at = now()
from erp.students student
where student.id = invoice.student_id
  and student.billing_anchor_date is not null
  and invoice.enrollment_id is not null
  and invoice.status <> 'VOID'::erp."InvoiceStatus"
  and coalesce(invoice.idempotency_key, '') not like 'student-one-time-%'
  and (
    invoice.issue_date is distinct from erp.billing_date_for_month(
      student.billing_anchor_date,
      invoice.period_month
    )
    or invoice.due_date is distinct from erp.billing_date_for_month(
      student.billing_anchor_date,
      invoice.period_month
    )
  );

-- One active invoice per enrollment and billing month is the accounting boundary.
-- The existing trigger remains as a readable error guard; this index also makes
-- concurrent cron/application inserts race-safe.
create unique index if not exists invoices_enrollment_period_non_void_key
  on erp.invoices (student_id, enrollment_id, period_month)
  where enrollment_id is not null
    and status <> 'VOID'::erp."InvoiceStatus";

-- The partial unique index is the concurrency-safe duplicate guard. The legacy
-- row trigger fires before ON CONFLICT can resolve a race, so it must be removed.
drop trigger if exists prevent_duplicate_open_billing_invoice_trigger
  on erp.invoices;

select erp.materialize_due_student_invoices();

-- Rebuild every monthly allocation deterministically. Cumulative amount ranges
-- make the allocation independent of row order and support partial payments and
-- multiple packages without cross-month leakage.
with payment_ranges as (
  select
    payment.id as payment_id,
    payment.student_id,
    date_trunc('month', payment.payment_month)::date as period_month,
    coalesce(sum(payment.amount) over (
      partition by payment.student_id, date_trunc('month', payment.payment_month)::date
      order by payment.paid_at, payment.created_at, payment.id
      rows between unbounded preceding and 1 preceding
    ), 0) as range_start,
    sum(payment.amount) over (
      partition by payment.student_id, date_trunc('month', payment.payment_month)::date
      order by payment.paid_at, payment.created_at, payment.id
      rows between unbounded preceding and current row
    ) as range_end
  from erp.payments payment
  where payment.schedule_type = 'MONTHLY'::erp."PaymentScheduleType"
), invoice_capacity as (
  select
    invoice.id as invoice_id,
    invoice.student_id,
    invoice.period_month,
    greatest(
      invoice.amount - coalesce(sum(allocation.amount_allocated), 0),
      0
    ) as capacity,
    invoice.due_date,
    invoice.created_at
  from erp.invoices invoice
  left join erp.payment_allocations allocation on allocation.invoice_id = invoice.id
  where invoice.status <> 'VOID'::erp."InvoiceStatus"
  group by invoice.id
), invoice_ranges as (
  select
    capacity.invoice_id,
    capacity.student_id,
    capacity.period_month,
    coalesce(sum(capacity.capacity) over (
      partition by capacity.student_id, capacity.period_month
      order by capacity.due_date, capacity.created_at, capacity.invoice_id
      rows between unbounded preceding and 1 preceding
    ), 0) as range_start,
    sum(capacity.capacity) over (
      partition by capacity.student_id, capacity.period_month
      order by capacity.due_date, capacity.created_at, capacity.invoice_id
      rows between unbounded preceding and current row
    ) as range_end
  from invoice_capacity capacity
  where capacity.capacity > 0
), rebuilt as (
  select
    payment.payment_id,
    invoice.invoice_id,
    least(payment.range_end, invoice.range_end)
      - greatest(payment.range_start, invoice.range_start) as amount_allocated
  from payment_ranges payment
  join invoice_ranges invoice
    on invoice.student_id = payment.student_id
   and invoice.period_month = payment.period_month
   and payment.range_start < invoice.range_end
   and invoice.range_start < payment.range_end
)
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
  rebuilt.payment_id,
  rebuilt.invoice_id,
  rebuilt.amount_allocated,
  'SELECTED_INVOICE'::erp."PaymentAllocationMode",
  now()
from rebuilt
where rebuilt.amount_allocated > 0;

with allocation_totals as (
  select
    invoice.id as invoice_id,
    coalesce(sum(allocation.amount_allocated), 0) as allocated
  from erp.invoices invoice
  left join erp.payment_allocations allocation on allocation.invoice_id = invoice.id
  where invoice.status <> 'VOID'::erp."InvoiceStatus"
  group by invoice.id
), calculated as (
  select
    invoice.id,
    greatest(invoice.amount - totals.allocated, 0) as balance_due,
    invoice.amount,
    invoice.due_date
  from erp.invoices invoice
  join allocation_totals totals on totals.invoice_id = invoice.id
  where invoice.status <> 'VOID'::erp."InvoiceStatus"
)
update erp.invoices invoice
set
  balance_due = calculated.balance_due,
  status = case
    when calculated.balance_due <= 0 then 'PAID'::erp."InvoiceStatus"
    when calculated.balance_due < calculated.amount then 'PARTIAL'::erp."InvoiceStatus"
    when calculated.due_date < ((now() at time zone 'Asia/Baku')::date)
      then 'OVERDUE'::erp."InvoiceStatus"
    else 'OPEN'::erp."InvoiceStatus"
  end,
  updated_at = now()
from calculated
where invoice.id = calculated.id;

-- A frozen due date creates no obligation. Existing paid periods are preserved;
-- only completely unpaid synthetic invoices are voided.
update erp.invoices invoice
set status = 'VOID'::erp."InvoiceStatus",
    balance_due = 0,
    updated_at = now()
where invoice.status <> 'VOID'::erp."InvoiceStatus"
  and invoice.balance_due = invoice.amount
  and not exists (
    select 1 from erp.payment_allocations allocation where allocation.invoice_id = invoice.id
  )
  and exists (
    select 1
    from lateral (
      select history.new_status
      from erp.student_status_history history
      where history.student_id = invoice.student_id
        and history.effective_at <= invoice.due_date
      order by history.effective_at desc, history.created_at desc, history.id desc
      limit 1
    ) status_at_due
    where status_at_due.new_status = 'FROZEN'::erp."StudentLifecycleStatus"
  );

-- Completed/declined students keep their payment history but never regain debt
-- when a wrong allocation is removed.
update erp.invoices invoice
set status = 'VOID'::erp."InvoiceStatus",
    balance_due = 0,
    updated_at = now()
from erp.students student
where student.id = invoice.student_id
  and student.lifecycle_status in (
    'COMPLETED'::erp."StudentLifecycleStatus",
    'DECLINED'::erp."StudentLifecycleStatus"
  )
  and invoice.status <> 'VOID'::erp."InvoiceStatus"
  and invoice.balance_due > 0;

-- Rebuild every remaining cycle once more so payment_id/paid_at and 31-day
-- boundaries reflect the reconciled ledger.
update erp.invoices invoice
set status = invoice.status,
    updated_at = now()
where invoice.status <> 'VOID'::erp."InvoiceStatus";

update erp.student_billing_migration_reviews review
set
  proposed_next_payment_at = (
    select min(cycle.due_date)
    from erp.student_billing_cycles cycle
    where cycle.student_id = review.student_id
      and cycle.status in (
        'DRAFT'::erp."InvoiceStatus",
        'OPEN'::erp."InvoiceStatus",
        'PARTIAL'::erp."InvoiceStatus",
        'OVERDUE'::erp."InvoiceStatus"
      )
  ),
  mismatch = false,
  issue_reason = null,
  review_status = 'APPLIED',
  applied_at = coalesce(review.applied_at, now()),
  updated_at = now();

insert into erp.audit_logs (
  id,
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
  'student.billing.reconcile',
  'student',
  repair.student_id,
  before_snapshot.snapshot,
  jsonb_build_object(
    'openBalance', coalesce((
      select sum(invoice.balance_due)
      from erp.invoices invoice
      where invoice.student_id = repair.student_id
        and invoice.status <> 'VOID'::erp."InvoiceStatus"
        and invoice.balance_due > 0
    ), 0),
    'periodMismatchCount', 0,
    'unallocatedMonthlyAmount', coalesce((
      select sum(greatest(payment.amount - allocated.amount, 0))
      from erp.payments payment
      cross join lateral (
        select coalesce(sum(allocation.amount_allocated), 0) as amount
        from erp.payment_allocations allocation
        where allocation.payment_id = payment.id
      ) allocated
      where payment.student_id = repair.student_id
        and payment.schedule_type = 'MONTHLY'::erp."PaymentScheduleType"
    ), 0)
  ),
  'Aylıq ödənişlər aid olduğu ay üzrə yenidən uzlaşdırıldı; faktura, balans və billing-cycle məlumatları sinxronlaşdırıldı',
  now()
from _billing_repair_students repair
join _billing_repair_before before_snapshot on before_snapshot.student_id = repair.student_id;

-- Future writes: period, ownership and both invoice/payment capacity are checked
-- under a consistent lock order before an allocation is accepted.
create or replace function erp.enforce_payment_allocation_integrity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  payment_row erp.payments%rowtype;
  invoice_row erp.invoices%rowtype;
  payment_allocated numeric(12, 2);
  invoice_allocated numeric(12, 2);
  existing_allocation_id uuid;
begin
  if tg_op = 'UPDATE' then
    existing_allocation_id := old.id;
  end if;

  select * into payment_row
  from erp.payments
  where id = new.payment_id
  for update;

  select * into invoice_row
  from erp.invoices
  where id = new.invoice_id
  for update;

  if payment_row.id is null or invoice_row.id is null then
    raise exception 'Payment and invoice are required for an allocation'
      using errcode = '23503';
  end if;

  if payment_row.student_id is distinct from invoice_row.student_id then
    raise exception 'Payment and invoice must belong to the same student'
      using errcode = '23514';
  end if;

  if invoice_row.status = 'VOID'::erp."InvoiceStatus" then
    raise exception 'A void invoice cannot receive an allocation'
      using errcode = '23514';
  end if;

  if payment_row.schedule_type = 'MONTHLY'::erp."PaymentScheduleType"
     and date_trunc('month', payment_row.payment_month)::date
       is distinct from date_trunc('month', invoice_row.period_month)::date then
    raise exception
      'Monthly payment billing period (%) must match invoice period (%)',
      date_trunc('month', payment_row.payment_month)::date,
      date_trunc('month', invoice_row.period_month)::date
      using errcode = '23514';
  end if;

  select coalesce(sum(allocation.amount_allocated), 0)
  into payment_allocated
  from erp.payment_allocations allocation
  where allocation.payment_id = new.payment_id
    and allocation.id is distinct from existing_allocation_id;

  if payment_allocated + new.amount_allocated > payment_row.amount then
    raise exception 'Allocation exceeds payment amount'
      using errcode = '23514';
  end if;

  select coalesce(sum(allocation.amount_allocated), 0)
  into invoice_allocated
  from erp.payment_allocations allocation
  where allocation.invoice_id = new.invoice_id
    and allocation.id is distinct from existing_allocation_id;

  if invoice_allocated + new.amount_allocated > invoice_row.amount then
    raise exception 'Allocation exceeds invoice amount'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function erp.enforce_payment_allocation_integrity()
  from public, anon, authenticated;

drop trigger if exists enforce_payment_allocation_billing_period_trigger
  on erp.payment_allocations;
drop trigger if exists enforce_payment_allocation_integrity_trigger
  on erp.payment_allocations;
create trigger enforce_payment_allocation_integrity_trigger
before insert or update of payment_id, invoice_id, amount_allocated
on erp.payment_allocations
for each row
execute function erp.enforce_payment_allocation_integrity();

create or replace function erp.sync_invoice_balance_from_allocations()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_invoice_id uuid;
  invoice_amount numeric(12, 2);
  invoice_status erp."InvoiceStatus";
  invoice_due_date date;
  allocated_amount numeric(12, 2);
  calculated_balance numeric(12, 2);
begin
  for target_invoice_id in
    select distinct candidate.invoice_id
    from (values
      (case when tg_op <> 'INSERT' then old.invoice_id end),
      (case when tg_op <> 'DELETE' then new.invoice_id end)
    ) candidate(invoice_id)
    where candidate.invoice_id is not null
  loop
    select invoice.amount, invoice.status, invoice.due_date
    into invoice_amount, invoice_status, invoice_due_date
    from erp.invoices invoice
    where invoice.id = target_invoice_id
    for update;

    if invoice_amount is null then
      continue;
    end if;

    select coalesce(sum(allocation.amount_allocated), 0)
    into allocated_amount
    from erp.payment_allocations allocation
    where allocation.invoice_id = target_invoice_id;

    calculated_balance := greatest(invoice_amount - allocated_amount, 0);

    update erp.invoices invoice
    set
      balance_due = calculated_balance,
      status = case
        when invoice_status = 'VOID'::erp."InvoiceStatus" then invoice_status
        when calculated_balance <= 0 then 'PAID'::erp."InvoiceStatus"
        when calculated_balance < invoice_amount then 'PARTIAL'::erp."InvoiceStatus"
        when invoice_due_date < ((now() at time zone 'Asia/Baku')::date)
          then 'OVERDUE'::erp."InvoiceStatus"
        else 'OPEN'::erp."InvoiceStatus"
      end,
      updated_at = now()
    where invoice.id = target_invoice_id;
  end loop;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function erp.sync_invoice_balance_from_allocations()
  from public, anon, authenticated;

drop trigger if exists sync_invoice_balance_from_allocations_trigger
  on erp.payment_allocations;
create trigger sync_invoice_balance_from_allocations_trigger
after insert or delete or update of payment_id, invoice_id, amount_allocated
on erp.payment_allocations
for each row
execute function erp.sync_invoice_balance_from_allocations();

-- Use pg_cron APIs (never direct writes to cron.job). Hourly execution is
-- idempotent and makes the job self-healing after transient failures. 20:05 UTC
-- is also 00:05 Asia/Baku, so a new local billing day is covered immediately.
select cron.schedule(
  'artmonia-student-billing-materializer',
  '5 * * * *',
  'select erp.materialize_due_student_invoices();'
);

-- Migration must fail atomically if any core accounting invariant remains.
do $$
begin
  if exists (
    select 1
    from erp.payment_allocations allocation
    join erp.payments payment on payment.id = allocation.payment_id
    join erp.invoices invoice on invoice.id = allocation.invoice_id
    where payment.schedule_type = 'MONTHLY'::erp."PaymentScheduleType"
      and date_trunc('month', payment.payment_month)::date
        is distinct from date_trunc('month', invoice.period_month)::date
  ) then
    raise exception 'Billing reconciliation left cross-period allocations';
  end if;

  if exists (
    select 1
    from erp.invoices invoice
    left join erp.payment_allocations allocation on allocation.invoice_id = invoice.id
    where invoice.status <> 'VOID'::erp."InvoiceStatus"
    group by invoice.id
    having invoice.balance_due is distinct from greatest(
      invoice.amount - coalesce(sum(allocation.amount_allocated), 0),
      0
    )
  ) then
    raise exception 'Billing reconciliation left invoice balance anomalies';
  end if;

  if exists (
    select 1
    from erp.payments payment
    left join erp.payment_allocations allocation on allocation.payment_id = payment.id
    group by payment.id
    having coalesce(sum(allocation.amount_allocated), 0) > payment.amount
  ) then
    raise exception 'Billing reconciliation overallocated a payment';
  end if;

  if exists (
    select 1
    from erp.students student
    join erp.enrollments enrollment on enrollment.student_id = student.id
    where student.lifecycle_status = 'ACTIVE'::erp."StudentLifecycleStatus"
      and student.billing_paused = false
      and student.is_test_data = false
      and student.billing_anchor_date is not null
      and enrollment.status = 'ACTIVE'::erp."EnrollmentStatus"
      and erp.billing_date_for_month(
        student.billing_anchor_date,
        date_trunc('month', (now() at time zone 'Asia/Baku')::date)::date
      ) <= (now() at time zone 'Asia/Baku')::date
      and erp.student_is_billable_on_date(
        student.id,
        erp.billing_date_for_month(
          student.billing_anchor_date,
          date_trunc('month', (now() at time zone 'Asia/Baku')::date)::date
        )
      )
      and not exists (
        select 1
        from erp.invoices invoice
        where invoice.student_id = student.id
          and invoice.enrollment_id = enrollment.id
          and invoice.period_month = date_trunc(
            'month',
            (now() at time zone 'Asia/Baku')::date
          )::date
          and invoice.status <> 'VOID'::erp."InvoiceStatus"
      )
  ) then
    raise exception 'Billing reconciliation left due active cycles without invoices';
  end if;
end;
$$;
