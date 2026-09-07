-- Payment deadlines are independent of the immutable teaching-cycle anchor.
create table erp.student_due_date_rules (
  id uuid primary key,
  version bigint generated always as identity unique,
  student_id uuid not null references erp.students(id) on delete cascade,
  effective_month date not null check (extract(day from effective_month)=1),
  mode text not null check (mode in ('FROM_MONTH','ONLY_MONTH')),
  due_day integer not null check (due_day between 1 and 31),
  reason text not null check (length(btrim(reason)) between 3 and 1000),
  created_by_id uuid not null references erp.users(id),
  created_at timestamptz not null default now(),
  check (created_by_id in ('f74ddcf3-fed2-4d36-86e5-5e75ab94f225'::uuid,'d0fb9ad2-ec06-4bc6-8dc9-5c037775486a'::uuid))
);
create index student_due_rules_lookup_idx on erp.student_due_date_rules(student_id,version desc);
create index student_due_rules_creator_idx on erp.student_due_date_rules(created_by_id);
alter table erp.student_due_date_rules enable row level security;
revoke all on erp.student_due_date_rules from public,anon,authenticated;
revoke all on sequence erp.student_due_date_rules_version_seq from public,anon,authenticated;

create function erp.student_payment_due_date(target_student_id uuid,target_month date)
returns date language sql stable security invoker set search_path='' as $$
  select case when r.due_day is null then erp.billing_date_for_month(s.billing_anchor_date,target_month)
    else (date_trunc('month',target_month)::date + (least(r.due_day,
      extract(day from (date_trunc('month',target_month)+interval '1 month - 1 day'))::integer)-1)) end
  from erp.students s left join lateral (
    select due_day from erp.student_due_date_rules r where r.student_id=s.id
      and ((r.mode='ONLY_MONTH' and r.effective_month=date_trunc('month',target_month)::date)
        or (r.mode='FROM_MONTH' and r.effective_month<=date_trunc('month',target_month)::date))
    order by r.version desc limit 1
  ) r on true where s.id=target_student_id;
$$;
revoke all on function erp.student_payment_due_date(uuid,date) from public,anon,authenticated;

-- Every writer (payments, price edits and the cron job) respects the same deadline rule.
create function erp.apply_invoice_due_date_rule() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  perform 1 from erp.students where id=new.student_id for update;
  if new.status<>'VOID'::erp."InvoiceStatus" and new.enrollment_id is not null
    and exists(select 1 from erp.student_due_date_rules r where r.student_id=new.student_id
      and ((r.mode='ONLY_MONTH' and r.effective_month=new.period_month)
        or (r.mode='FROM_MONTH' and r.effective_month<=new.period_month))) then
    new.due_date:=erp.student_payment_due_date(new.student_id,new.period_month);
    new.status:=case when new.balance_due<=0 then 'PAID'::erp."InvoiceStatus"
      when new.due_date<(now() at time zone 'Asia/Baku')::date then 'OVERDUE'::erp."InvoiceStatus"
      when new.balance_due<new.amount then 'PARTIAL'::erp."InvoiceStatus" else 'OPEN'::erp."InvoiceStatus" end;
  end if;
  return new;
end; $$;
create trigger aa_apply_invoice_due_date_rule before insert or update on erp.invoices
for each row execute function erp.apply_invoice_due_date_rule();
revoke all on function erp.apply_invoice_due_date_rule() from public,anon,authenticated;

-- Reservation is a subtype of FROZEN, never an ACTIVE student.
alter table erp.students add column freeze_reserved boolean not null default false;
alter table erp.student_status_history add column freeze_reserved boolean not null default false;
alter table erp.students add constraint students_reserved_freeze_state check
  (not freeze_reserved or (lifecycle_status='FROZEN'::erp."StudentLifecycleStatus" and not billing_paused));
alter table erp.student_status_history add constraint history_reserved_freeze_state check
  (not freeze_reserved or new_status='FROZEN'::erp."StudentLifecycleStatus");

create function erp.clear_reserved_freeze_on_status_change() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if new.lifecycle_status<>'FROZEN'::erp."StudentLifecycleStatus" or new.billing_paused then
    new.freeze_reserved:=false;
  end if;
  return new;
end; $$;
create trigger clear_reserved_freeze_on_status_change before update on erp.students
for each row execute function erp.clear_reserved_freeze_on_status_change();
revoke all on function erp.clear_reserved_freeze_on_status_change() from public,anon,authenticated;

-- Reservation history takes precedence at the original cycle boundary, not a moved deadline.
create or replace function erp.student_is_billable_on_date_before_freeze_periods(target_student_id uuid,target_date date)
returns boolean language sql stable security invoker set search_path='' as $$
 select case when not (s.lifecycle_status='ACTIVE'::erp."StudentLifecycleStatus" or s.freeze_reserved) or s.billing_paused then false
 else coalesce((select h.new_status not in ('FROZEN'::erp."StudentLifecycleStatus",'STOPPED'::erp."StudentLifecycleStatus",
   'DECLINED'::erp."StudentLifecycleStatus",'COMPLETED'::erp."StudentLifecycleStatus") or h.freeze_reserved
   from erp.student_status_history h where h.student_id=s.id and h.effective_at<=target_date
   order by h.effective_at desc,h.created_at desc,h.id desc limit 1),true) end
 from erp.students s where s.id=target_student_id;
$$;

create or replace function erp.reconcile_billing_after_freeze_history()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.new_status='FROZEN'::erp."StudentLifecycleStatus" and not new.freeze_reserved
    and not exists(select 1 from erp.student_freeze_periods f where f.student_id=new.student_id and f.end_date is null) then
    perform erp.reconcile_frozen_student_invoices(new.student_id,new.effective_at,new.changed_by_id);
  end if;
  return new;
end; $$;

-- Preserve existing function bodies and change only the reviewed integration points.
do $$
declare definition text; changed text;
begin
  definition:=pg_get_functiondef('erp.materialize_due_student_invoices(date)'::regprocedure);
  changed:=replace(definition,'student.lifecycle_status = ''ACTIVE''::erp."StudentLifecycleStatus"',
    '(student.lifecycle_status = ''ACTIVE''::erp."StudentLifecycleStatus" or student.freeze_reserved)');
  changed:=regexp_replace(changed,'erp.billing_date_for_month\(\s*student.billing_anchor_date,',
    'erp.student_payment_due_date(student.id,','g');
  -- Eligibility is based on teaching cycle, even when the payment deadline is postponed.
  changed:=regexp_replace(changed,'erp.student_is_billable_on_date\(\s*student.id,\s*erp.student_payment_due_date\(student.id,',
    'erp.student_is_billable_on_date(student.id, erp.billing_date_for_month(student.billing_anchor_date,','g');
  if changed=definition then raise exception 'Missing materializer integration point'; end if;
  execute changed;

  definition:=pg_get_functiondef('erp.guard_automatic_frozen_invoice()'::regprocedure);
  changed:=replace(definition,'h.effective_at<=new.due_date','h.effective_at<=erp.billing_date_for_month((select billing_anchor_date from erp.students where id=new.student_id),new.period_month)');
  changed:=replace(changed,'select h.new_status from','select case when h.freeze_reserved then ''ACTIVE''::erp."StudentLifecycleStatus" else h.new_status end from');
  if changed=definition then raise exception 'Missing automatic guard integration point'; end if;
  execute changed;

  definition:=pg_get_functiondef('erp.reconcile_frozen_student_invoices(uuid,date,uuid)'::regprocedure);
  changed:=replace(definition,'i.due_date >= from_date','erp.billing_date_for_month((select billing_anchor_date from erp.students where id=i.student_id),i.period_month) >= from_date');
  changed:=replace(changed,'h.effective_at<=i.due_date','h.effective_at<=erp.billing_date_for_month((select billing_anchor_date from erp.students where id=i.student_id),i.period_month)');
  changed:=replace(changed,'select h.new_status from','select case when h.freeze_reserved then ''ACTIVE''::erp."StudentLifecycleStatus" else h.new_status end from');
  if changed=definition then raise exception 'Missing frozen reconciliation integration point'; end if;
  execute changed;

  definition:=pg_get_functiondef('erp.sync_student_billing_cycle_from_invoice()'::regprocedure);
  changed:=replace(definition,E'    new.due_date,\n    erp.billing_date_for_month(',
    E'    erp.billing_date_for_month(anchor_date,new.period_month),\n    erp.billing_date_for_month(');
  if changed=definition then raise exception 'Missing cycle synchronization integration point'; end if;
  execute changed;

  definition:=pg_get_functiondef('erp.next_unfrozen_billing_date(uuid,date)'::regprocedure);
  changed:=replace(definition,'return erp.billing_date_for_month(anchor,month_date)',
    'return erp.student_payment_due_date(target_student_id,month_date)');
  if changed=definition then raise exception 'Missing next date integration point'; end if;
  execute changed;
end; $$;
