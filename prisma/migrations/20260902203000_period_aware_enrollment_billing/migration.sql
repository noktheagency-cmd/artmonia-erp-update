create table if not exists erp.enrollment_billing_terms (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references erp.enrollments(id) on delete cascade,
  effective_month date not null,
  mode varchar(20) not null,
  monthly_fee numeric(12, 2) not null,
  lessons_per_month integer,
  discount_type text,
  reason text not null,
  created_by_id uuid references erp.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint enrollment_billing_terms_period_mode_key
    unique (enrollment_id, effective_month, mode),
  constraint enrollment_billing_terms_mode_check
    check (mode in ('FROM_MONTH', 'ONLY_MONTH')),
  constraint enrollment_billing_terms_month_start_check
    check (effective_month = date_trunc('month', effective_month)::date),
  constraint enrollment_billing_terms_monthly_fee_check
    check (monthly_fee >= 0),
  constraint enrollment_billing_terms_lessons_check
    check (lessons_per_month is null or lessons_per_month > 0)
);

create index if not exists enrollment_billing_terms_lookup_idx
  on erp.enrollment_billing_terms (enrollment_id, effective_month desc);

create index if not exists enrollment_billing_terms_created_by_idx
  on erp.enrollment_billing_terms (created_by_id);

alter table erp.enrollment_billing_terms enable row level security;

comment on table erp.enrollment_billing_terms is
  'Period-aware student package pricing. ONLY_MONTH overrides FROM_MONTH for one billing month.';

create or replace function erp.enrollment_billing_amount(
  target_enrollment_id uuid,
  target_period_month date
)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    (
      select term.monthly_fee
      from erp.enrollment_billing_terms term
      where term.enrollment_id = target_enrollment_id
        and (
          (
            term.mode = 'ONLY_MONTH'
            and term.effective_month = date_trunc('month', target_period_month)::date
          )
          or (
            term.mode = 'FROM_MONTH'
            and term.effective_month <= date_trunc('month', target_period_month)::date
          )
        )
      order by
        case when term.mode = 'ONLY_MONTH' then 0 else 1 end,
        term.effective_month desc,
        term.created_at desc
      limit 1
    ),
    (
      select enrollment.monthly_fee
      from erp.enrollments enrollment
      where enrollment.id = target_enrollment_id
    )
  );
$$;

revoke all on function erp.enrollment_billing_amount(uuid, date)
  from public, anon, authenticated;

create or replace function erp.create_initial_enrollment_billing_term()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into erp.enrollment_billing_terms (
    enrollment_id,
    effective_month,
    mode,
    monthly_fee,
    lessons_per_month,
    discount_type,
    reason
  ) values (
    new.id,
    date_trunc('month', coalesce(new.first_lesson_at, new.start_date))::date,
    'FROM_MONTH',
    new.monthly_fee,
    new.lessons_per_month,
    new.discount_type,
    'Paket yaradılarkən ilkin billing şərtləri'
  )
  on conflict (enrollment_id, effective_month, mode) do nothing;

  return new;
end;
$$;

revoke all on function erp.create_initial_enrollment_billing_term()
  from public, anon, authenticated;

drop trigger if exists create_initial_enrollment_billing_term_trigger
  on erp.enrollments;

create trigger create_initial_enrollment_billing_term_trigger
after insert on erp.enrollments
for each row
execute function erp.create_initial_enrollment_billing_term();

insert into erp.enrollment_billing_terms (
  enrollment_id,
  effective_month,
  mode,
  monthly_fee,
  lessons_per_month,
  discount_type,
  reason
)
select
  enrollment.id,
  date '2026-09-01',
  'FROM_MONTH',
  enrollment.monthly_fee,
  enrollment.lessons_per_month,
  enrollment.discount_type,
  'Mövcud paket üçün ilkin gələcək billing şərtləri'
from erp.enrollments enrollment
on conflict (enrollment_id, effective_month, mode) do nothing;

with target_enrollments as (
  select
    student.code as student_code,
    invoice.enrollment_id
  from erp.students student
  join erp.invoices invoice on invoice.student_id = student.id
  where invoice.enrollment_id is not null
    and invoice.status <> 'VOID'::erp."InvoiceStatus"
    and (student.code, invoice.period_month) in (
      ('ART-1952', date '2026-08-01'),
      ('ART-2592', date '2026-08-01'),
      ('ART-2432', date '2026-07-01')
    )
), billing_term_seed as (
  select *
  from (
    values
      ('ART-1952', date '2026-01-01', 'FROM_MONTH', 150::numeric, 8, 'İlkin 8 dərslik paket'),
      ('ART-1952', date '2026-08-01', 'FROM_MONTH', 75::numeric, 4, 'Avqustdan 4 dərslik paket'),
      ('ART-2592', date '2026-02-01', 'FROM_MONTH', 100::numeric, 8, 'İlkin 8 dərslik paket'),
      ('ART-2592', date '2026-08-01', 'FROM_MONTH', 60::numeric, 4, 'Avqustdan 4 dərslik paket'),
      ('ART-2432', date '2026-03-01', 'FROM_MONTH', 100::numeric, 8, 'Standart 8 dərslik paket'),
      ('ART-2432', date '2026-07-01', 'ONLY_MONTH', 50::numeric, 4, 'Müəllim məzuniyyətinə görə yalnız iyul üçün yarımay')
  ) as seeded(student_code, effective_month, mode, monthly_fee, lessons_per_month, reason)
)
insert into erp.enrollment_billing_terms (
  enrollment_id,
  effective_month,
  mode,
  monthly_fee,
  lessons_per_month,
  discount_type,
  reason
)
select
  enrollment.id,
  term.effective_month,
  term.mode,
  term.monthly_fee,
  term.lessons_per_month,
  enrollment.discount_type,
  term.reason
from target_enrollments target
join erp.enrollments enrollment on enrollment.id = target.enrollment_id
join billing_term_seed term on term.student_code = target.student_code
on conflict (enrollment_id, effective_month, mode)
do update set
  monthly_fee = excluded.monthly_fee,
  lessons_per_month = excluded.lessons_per_month,
  discount_type = excluded.discount_type,
  reason = excluded.reason,
  updated_at = now();

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
      erp.enrollment_billing_amount(
        enrollment.id,
        date_trunc('month', as_of_date)::date
      ) as amount
    from erp.students student
    join erp.enrollments enrollment on enrollment.student_id = student.id
    where student.lifecycle_status = 'ACTIVE'::erp."StudentLifecycleStatus"
      and student.billing_paused = false
      and student.is_test_data = false
      and student.billing_anchor_date is not null
      and enrollment.status = 'ACTIVE'::erp."EnrollmentStatus"
      and erp.enrollment_billing_amount(
        enrollment.id,
        date_trunc('month', as_of_date)::date
      ) > 0
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
      'Aylıq billing dövrü təsdiqlənmiş ilk dərs tarixinə və həmin ayın tarifinə əsasən avtomatik yaradıldı',
      now()
    from inserted
    returning 1
  )
  select count(*) into created_count from audited;

  return created_count;
end;
$$;

revoke all on function erp.materialize_due_student_invoices(date)
  from public, anon, authenticated;

create temp table _confirmed_billing_term_repairs on commit drop as
select
  student.id as student_id,
  student.code as student_code,
  invoice.id as invoice_id,
  invoice.period_month,
  invoice.amount as old_amount,
  invoice.balance_due as old_balance_due,
  invoice.status as old_status,
  repair.correct_amount,
  coalesce(sum(allocation.amount_allocated), 0) as allocated_amount
from erp.students student
join erp.invoices invoice on invoice.student_id = student.id
join (
  values
    ('ART-1952', date '2026-08-01', 75::numeric),
    ('ART-2592', date '2026-08-01', 60::numeric),
    ('ART-2432', date '2026-07-01', 50::numeric)
) as repair(student_code, period_month, correct_amount)
  on repair.student_code = student.code
 and repair.period_month = invoice.period_month
left join erp.payment_allocations allocation on allocation.invoice_id = invoice.id
where invoice.status <> 'VOID'::erp."InvoiceStatus"
group by
  student.id,
  student.code,
  invoice.id,
  invoice.period_month,
  invoice.amount,
  invoice.balance_due,
  invoice.status,
  repair.correct_amount;

do $$
declare
  repair_count integer;
begin
  select count(*) into repair_count
  from _confirmed_billing_term_repairs;

  if repair_count <> 3 then
    raise exception
      'Confirmed billing-term repair expected exactly 3 invoices, found %',
      repair_count;
  end if;

  if exists (
    select 1
    from _confirmed_billing_term_repairs repair
    where repair.allocated_amount <> repair.correct_amount
      or repair.old_amount < repair.correct_amount
      or repair.old_balance_due not in (
        repair.old_amount - repair.correct_amount,
        0
      )
      or repair.old_status not in (
        'PARTIAL'::erp."InvoiceStatus",
        'PAID'::erp."InvoiceStatus"
      )
  ) then
    raise exception
      'Confirmed billing-term repair safety check failed';
  end if;
end;
$$;

update erp.invoices invoice
set
  amount = repair.correct_amount,
  balance_due = 0,
  status = 'PAID'::erp."InvoiceStatus",
  updated_at = now()
from _confirmed_billing_term_repairs repair
where invoice.id = repair.invoice_id
  and (
    invoice.amount is distinct from repair.correct_amount
    or invoice.balance_due <> 0
    or invoice.status <> 'PAID'::erp."InvoiceStatus"
  );

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
  'billing.invoice.reprice_migration',
  'invoice',
  repair.invoice_id,
  jsonb_build_object(
    'studentCode', repair.student_code,
    'periodMonth', repair.period_month,
    'amount', repair.old_amount,
    'balanceDue', repair.old_balance_due,
    'status', repair.old_status,
    'allocatedAmount', repair.allocated_amount
  ),
  jsonb_build_object(
    'studentCode', repair.student_code,
    'periodMonth', repair.period_month,
    'amount', repair.correct_amount,
    'balanceDue', 0,
    'status', 'PAID',
    'allocatedAmount', repair.allocated_amount
  ),
  case repair.student_code
    when 'ART-2432' then 'Yalnız iyul üçün təsdiqlənmiş yarımay məbləği tətbiq edildi.'
    else 'Təsdiqlənmiş paket dəyişikliyi həmin billing ayının fakturasına tətbiq edildi.'
  end,
  now()
from _confirmed_billing_term_repairs repair
where (
    repair.old_amount is distinct from repair.correct_amount
    or repair.old_balance_due <> 0
    or repair.old_status <> 'PAID'::erp."InvoiceStatus"
  )
  and not exists (
    select 1
    from erp.audit_logs existing_audit
    where existing_audit.action = 'billing.invoice.reprice_migration'
      and existing_audit.entity_id = repair.invoice_id
  );

do $$
begin
  if exists (
    select 1
    from _confirmed_billing_term_repairs repair
    join erp.invoices invoice on invoice.id = repair.invoice_id
    where invoice.amount <> repair.correct_amount
       or invoice.balance_due <> 0
       or invoice.status <> 'PAID'::erp."InvoiceStatus"
  ) then
    raise exception 'Confirmed billing-term repair verification failed';
  end if;

  if not exists (
    select 1
    from erp.students student
    join erp.invoices invoice on invoice.student_id = student.id
    where student.code = 'ART-2113'
      and invoice.period_month = date '2026-07-01'
      and invoice.balance_due = 94
      and invoice.status = 'PARTIAL'::erp."InvoiceStatus"
  ) or not exists (
    select 1
    from erp.students student
    join erp.invoices invoice on invoice.student_id = student.id
    where student.code = 'ART-2353'
      and invoice.period_month = date '2026-07-01'
      and invoice.balance_due = 40
      and invoice.status = 'PARTIAL'::erp."InvoiceStatus"
  ) then
    raise exception 'Untargeted frozen-student invoices changed unexpectedly';
  end if;
end;
$$;
