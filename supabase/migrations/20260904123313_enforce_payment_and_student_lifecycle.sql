create type "erp"."StudentLifecycleEventType" as enum ('STATUS_CHANGE', 'REACTIVATED');

alter table "erp"."student_status_history"
  add column "event_type" "erp"."StudentLifecycleEventType" not null default 'STATUS_CHANGE';

update "erp"."student_status_history"
set "event_type" = 'REACTIVATED'
where "old_status" in (
  'FROZEN'::"erp"."StudentLifecycleStatus",
  'STOPPED'::"erp"."StudentLifecycleStatus",
  'DECLINED'::"erp"."StudentLifecycleStatus"
)
and "new_status" = 'ACTIVE'::"erp"."StudentLifecycleStatus";

-- The known Məhbubə case: cash was received on 31 August while the service month is September.
with corrected as (
  update "erp"."payments" payment
  set "paid_at" = date '2026-08-31'
  from "erp"."students" student
  where payment."student_id" = student."id"
    and student."code" = 'ART-1142'
    and payment."paid_at" = date '2026-09-06'
  returning payment."id", payment."student_id", payment."payment_month"
)
insert into "erp"."audit_logs" (
  "id", "action", "entity_type", "entity_id", "before_json", "after_json", "reason"
)
select
  gen_random_uuid(),
  'finance.payment.date.corrected',
  'payment',
  corrected."id",
  jsonb_build_object('paidAt', '2026-09-06', 'paymentMonth', corrected."payment_month"),
  jsonb_build_object('paidAt', '2026-08-31', 'paymentMonth', corrected."payment_month"),
  'Məhbubə case-i: faktiki pulun daxil olduğu tarix 31.08.2026 olaraq düzəldildi'
from corrected;

create or replace function "erp"."reject_future_student_payment_date"()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new."paid_at" > (now() at time zone 'Asia/Baku')::date then
    raise exception 'Ödəniş tarixi gələcək tarix ola bilməz. Faktiki pulun daxil olduğu tarixi seçin.'
      using errcode = '22007';
  end if;
  return new;
end;
$$;

drop trigger if exists "payments_reject_future_paid_at" on "erp"."payments";
create trigger "payments_reject_future_paid_at"
before insert or update of "paid_at" on "erp"."payments"
for each row execute function "erp"."reject_future_student_payment_date"();

revoke execute on function "erp"."reject_future_student_payment_date"() from public, anon, authenticated;

-- Snapshot the current inactive-state relationship issues before cleaning them.
create temporary table lifecycle_cleanup on commit drop as
select
  student."id" as student_id,
  student."lifecycle_status" as lifecycle_status,
  coalesce((
    select max(history."effective_at")
    from "erp"."student_status_history" history
    where history."student_id" = student."id"
      and history."new_status" = student."lifecycle_status"
  ), student."updated_at"::date) as effective_at,
  (
    select count(*)::int
    from "erp"."enrollments" enrollment
    join "erp"."student_schedule_assignments" assignment
      on assignment."enrollment_id" = enrollment."id"
    where enrollment."student_id" = student."id"
      and assignment."valid_to" is null
  ) as open_assignment_count,
  (
    select count(*)::int
    from "erp"."enrollments" enrollment
    where enrollment."student_id" = student."id"
      and enrollment."status" = 'ACTIVE'::"erp"."EnrollmentStatus"
  ) as active_enrollment_count
from "erp"."students" student
where student."lifecycle_status" in (
  'SLOT_WAITING'::"erp"."StudentLifecycleStatus",
  'FROZEN'::"erp"."StudentLifecycleStatus",
  'STOPPED'::"erp"."StudentLifecycleStatus",
  'DECLINED'::"erp"."StudentLifecycleStatus"
)
and (
  exists (
    select 1
    from "erp"."enrollments" enrollment
    where enrollment."student_id" = student."id"
      and enrollment."status" = 'ACTIVE'::"erp"."EnrollmentStatus"
  )
  or exists (
    select 1
    from "erp"."enrollments" enrollment
    join "erp"."student_schedule_assignments" assignment
      on assignment."enrollment_id" = enrollment."id"
    where enrollment."student_id" = student."id"
      and assignment."valid_to" is null
  )
);

insert into "erp"."audit_logs" (
  "id", "action", "entity_type", "entity_id", "before_json", "after_json", "reason"
)
select
  gen_random_uuid(),
  'student.lifecycle.reconcile',
  'student',
  cleanup.student_id,
  jsonb_build_object(
    'lifecycleStatus', cleanup.lifecycle_status,
    'activeEnrollmentCount', cleanup.active_enrollment_count,
    'openScheduleAssignmentCount', cleanup.open_assignment_count
  ),
  jsonb_build_object(
    'enrollmentStatus', 'PAUSED',
    'openScheduleAssignmentCount', 0,
    'effectiveAt', cleanup.effective_at
  ),
  'Status, enrollment və aktiv slot əlaqələri avtomatik uyğunlaşdırıldı'
from lifecycle_cleanup cleanup;

delete from "erp"."student_schedule_assignments" assignment
using "erp"."enrollments" enrollment, lifecycle_cleanup cleanup
where assignment."enrollment_id" = enrollment."id"
  and enrollment."student_id" = cleanup.student_id
  and assignment."valid_to" is null
  and assignment."valid_from" >= cleanup.effective_at;

update "erp"."student_schedule_assignments" assignment
set
  "valid_to" = cleanup.effective_at - 1,
  "updated_at" = now()
from "erp"."enrollments" enrollment, lifecycle_cleanup cleanup
where assignment."enrollment_id" = enrollment."id"
  and enrollment."student_id" = cleanup.student_id
  and assignment."valid_to" is null
  and assignment."valid_from" < cleanup.effective_at;

update "erp"."enrollments" enrollment
set "status" = 'PAUSED'::"erp"."EnrollmentStatus", "updated_at" = now()
from lifecycle_cleanup cleanup
where enrollment."student_id" = cleanup.student_id
  and enrollment."status" = 'ACTIVE'::"erp"."EnrollmentStatus";
