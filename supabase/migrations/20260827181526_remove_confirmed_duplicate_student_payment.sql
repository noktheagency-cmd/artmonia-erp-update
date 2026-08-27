set local lock_timeout = '5s';
set local statement_timeout = '15s';

select pg_advisory_xact_lock(hashtextextended('erp.student-billing-reconciliation', 0));

create temp table _confirmed_duplicate_payments on commit drop as
with payment_state as (
  select
    payment.*,
    coalesce(sum(allocation.amount_allocated), 0) as allocated_amount
  from erp.payments payment
  left join erp.payment_allocations allocation on allocation.payment_id = payment.id
  where payment.schedule_type = 'MONTHLY'::erp."PaymentScheduleType"
  group by payment.id
), duplicate_groups as (
  select
    payment.student_id,
    payment.amount,
    payment.paid_at,
    payment.payment_month,
    payment.schedule_type,
    payment.method,
    min(payment.created_at) as first_created_at,
    max(payment.created_at) as last_created_at,
    count(*) as payment_count,
    count(*) filter (where payment.allocated_amount = payment.amount) as fully_allocated_count,
    count(*) filter (where payment.allocated_amount = 0) as unallocated_count
  from payment_state payment
  group by
    payment.student_id,
    payment.amount,
    payment.paid_at,
    payment.payment_month,
    payment.schedule_type,
    payment.method
  having count(*) = 2
    and max(payment.created_at) - min(payment.created_at) <= interval '30 seconds'
    and count(*) filter (where payment.allocated_amount = payment.amount) = 1
    and count(*) filter (where payment.allocated_amount = 0) = 1
)
select
  duplicate.id as duplicate_payment_id,
  canonical.id as canonical_payment_id,
  duplicate.student_id,
  to_jsonb(duplicate) as duplicate_snapshot
from duplicate_groups grouped
join payment_state duplicate
  on duplicate.student_id = grouped.student_id
 and duplicate.amount = grouped.amount
 and duplicate.paid_at = grouped.paid_at
 and duplicate.payment_month = grouped.payment_month
 and duplicate.schedule_type = grouped.schedule_type
 and duplicate.method = grouped.method
 and duplicate.allocated_amount = 0
join payment_state canonical
  on canonical.student_id = grouped.student_id
 and canonical.amount = grouped.amount
 and canonical.paid_at = grouped.paid_at
 and canonical.payment_month = grouped.payment_month
 and canonical.schedule_type = grouped.schedule_type
 and canonical.method = grouped.method
 and canonical.allocated_amount = canonical.amount
where duplicate.note is null
  and duplicate.receipt_file_path is null
  and duplicate.receipt_reference is null
  and canonical.note is null
  and canonical.receipt_file_path is null
  and canonical.receipt_reference is null;

do $$
declare
  duplicate_count integer;
begin
  select count(*) into duplicate_count from _confirmed_duplicate_payments;
  if duplicate_count not in (0, 1) then
    raise exception
      'Duplicate payment safety check expected one confirmed row or idempotent zero, found %',
      duplicate_count;
  end if;
end;
$$;

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
  'student.payment.duplicate.remove',
  'student',
  duplicate.student_id,
  jsonb_build_object(
    'duplicatePayment', duplicate.duplicate_snapshot,
    'canonicalPaymentId', duplicate.canonical_payment_id
  ),
  jsonb_build_object(
    'removedDuplicatePaymentId', duplicate.duplicate_payment_id,
    'preservedCanonicalPaymentId', duplicate.canonical_payment_id
  ),
  'Eyni tələbə, ay, tarix, məbləğ və metodla 30 saniyə içində yaranmış allocation-sız dublikat ödəniş silindi',
  now()
from _confirmed_duplicate_payments duplicate;

delete from erp.payments payment
using _confirmed_duplicate_payments duplicate
where payment.id = duplicate.duplicate_payment_id;

do $$
begin
  if exists (
    select 1
    from erp.payments payment
    where payment.id in (
      select duplicate_payment_id from _confirmed_duplicate_payments
    )
  ) then
    raise exception 'Confirmed duplicate payment was not removed';
  end if;
end;
$$;
