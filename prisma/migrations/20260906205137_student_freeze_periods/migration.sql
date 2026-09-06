-- Explicit, half-open historical freeze intervals. No legacy dates are inferred or repaired.
create table erp.student_freeze_periods (
  id uuid primary key,
  student_id uuid not null references erp.students(id) on delete cascade,
  start_date date not null,
  end_date date,
  note text not null check (length(btrim(note)) between 3 and 1000),
  created_by_id uuid not null references erp.users(id),
  created_at timestamp(3) not null default now(),
  updated_at timestamp(3) not null default now(),
  check (end_date is null or end_date > start_date)
);
create index student_freeze_periods_student_id_start_date_idx on erp.student_freeze_periods(student_id,start_date);
create index student_freeze_periods_created_by_id_idx on erp.student_freeze_periods(created_by_id);
alter table erp.student_freeze_periods enable row level security;
revoke all on erp.student_freeze_periods from public,anon,authenticated;

create function erp.validate_student_freeze_period() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  perform 1 from erp.students where id=new.student_id for update;
  if new.start_date > (now() at time zone 'Asia/Baku')::date
    or new.end_date > (now() at time zone 'Asia/Baku')::date then
    raise exception 'Freeze dates cannot be in the future';
  end if;
  if tg_op='UPDATE' and (new.student_id<>old.student_id or new.start_date<>old.start_date
    or old.end_date is not null or new.end_date is null) then
    raise exception 'Historical freeze intervals are immutable; only an open interval may be closed';
  end if;
  if exists(select 1 from erp.student_freeze_periods f where f.student_id=new.student_id and f.id<>new.id
    and daterange(f.start_date,f.end_date,'[)') && daterange(new.start_date,new.end_date,'[)')) then
    raise exception 'Freeze intervals overlap';
  end if;
  return new;
end; $$;
create trigger validate_student_freeze_period before insert or update on erp.student_freeze_periods
for each row execute function erp.validate_student_freeze_period();
revoke all on function erp.validate_student_freeze_period() from public,anon,authenticated;

create function erp.student_cycle_fully_frozen(target_student_id uuid,target_month date)
returns boolean language sql stable security invoker set search_path='' as $$
  select exists(select 1 from erp.student_freeze_periods f join erp.students s on s.id=f.student_id
    where f.student_id=target_student_id and s.billing_anchor_date is not null
      and f.start_date<=erp.billing_date_for_month(s.billing_anchor_date,target_month)
      and (f.end_date is null or f.end_date>=erp.billing_date_for_month(s.billing_anchor_date,(date_trunc('month',target_month)+interval '1 month')::date)));
$$;
revoke all on function erp.student_cycle_fully_frozen(uuid,date) from public,anon,authenticated;

-- Preserve existing eligibility policy and add the explicit full-cycle exclusion for all recurring jobs.
alter function erp.student_is_billable_on_date(uuid,date) rename to student_is_billable_on_date_before_freeze_periods;
create function erp.student_is_billable_on_date(target_student_id uuid,target_date date)
returns boolean language sql stable security invoker set search_path='' as $$
  select erp.student_is_billable_on_date_before_freeze_periods(target_student_id,target_date)
    and not erp.student_cycle_fully_frozen(target_student_id,date_trunc('month',target_date)::date);
$$;
revoke all on function erp.student_is_billable_on_date(uuid,date) from public,anon,authenticated;

create function erp.guard_explicit_frozen_cycle() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  perform 1 from erp.students where id=new.student_id for update;
  if new.status='VOID'::erp."InvoiceStatus" then return new; end if;
  -- Existing paid/partial invoices remain editable by the controlled payment workflow.
  if tg_op='UPDATE' and old.status<>'VOID'::erp."InvoiceStatus"
    and old.student_id=new.student_id and old.period_month=new.period_month then return new; end if;
  if erp.student_cycle_fully_frozen(new.student_id,new.period_month) then
    raise exception 'This billing cycle is frozen. Review the freeze interval before creating an invoice';
  end if;
  return new;
end; $$;
create trigger guard_explicit_frozen_cycle before insert or update of status,student_id,period_month on erp.invoices
for each row execute function erp.guard_explicit_frozen_cycle();
revoke all on function erp.guard_explicit_frozen_cycle() from public,anon,authenticated;

-- Rejoining through the existing workflow closes an ongoing freeze without moving the anchor.
create function erp.close_explicit_freeze_on_reactivation() returns trigger
language plpgsql security invoker set search_path='' as $$
declare f record;
begin
  if new.event_type<>'REACTIVATED'::erp."StudentLifecycleEventType" then return new; end if;
  for f in select * from erp.student_freeze_periods where student_id=new.student_id and end_date is null for update loop
    if new.effective_at<=f.start_date then raise exception 'Return date must follow freeze start'; end if;
    if exists(select 1 from erp.audit_logs a where a.action='billing.invoice.void_freeze_interval'
      and a.after_json->>'freezePeriodId'=f.id::text
      and (a.after_json->>'cycleEnd')::date>new.effective_at) then
      raise exception 'Return date overlaps a confirmed written-off cycle; finance review required';
    end if;
    update erp.student_freeze_periods set end_date=new.effective_at,updated_at=now() where id=f.id;
    insert into erp.audit_logs(id,actor_user_id,action,entity_type,entity_id,before_json,after_json,reason,created_at)
    values(gen_random_uuid(),new.changed_by_id,'student.freeze_period.close','student',new.student_id,
      to_jsonb(f),jsonb_build_object('freezePeriodId',f.id,'endDate',new.effective_at),new.reason,now());
  end loop;
  return new;
end; $$;
create trigger close_explicit_freeze_on_reactivation before insert on erp.student_status_history
for each row execute function erp.close_explicit_freeze_on_reactivation();
revoke all on function erp.close_explicit_freeze_on_reactivation() from public,anon,authenticated;

insert into erp.permissions(id,code,description) values(gen_random_uuid(),'student.freeze.manage','Dondurulma dövrləri və təsdiqlənmiş maliyyə təsiri') on conflict(code) do nothing;
insert into erp.role_permissions(role_id,permission_id,scope)
select r.id,p.id,'ALL'::erp."PermissionScope" from erp.roles r cross join erp.permissions p
where r.code::text in ('OWNER','ADMIN','FINANCE') and p.code='student.freeze.manage'
on conflict do nothing;

-- Explicit intervals own their preview/confirmation; the legacy date-only trigger must not override it.
create or replace function erp.reconcile_billing_after_freeze_history()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.new_status='FROZEN'::erp."StudentLifecycleStatus"
    and not exists(select 1 from erp.student_freeze_periods f where f.student_id=new.student_id and f.end_date is null) then
    perform erp.reconcile_frozen_student_invoices(new.student_id,new.effective_at,new.changed_by_id);
  end if;
  return new;
end; $$;

create function erp.next_unfrozen_billing_date(target_student_id uuid,from_month date)
returns date language plpgsql stable security invoker set search_path='' as $$
declare anchor date; month_date date := date_trunc('month',from_month)::date; freeze_end date; found_freeze boolean;
begin
  select billing_anchor_date into anchor from erp.students where id=target_student_id;
  if anchor is null then return null; end if;
  loop
    select f.end_date,true into freeze_end,found_freeze from erp.student_freeze_periods f
    where f.student_id=target_student_id and f.start_date<=erp.billing_date_for_month(anchor,month_date)
      and (f.end_date is null or f.end_date>=erp.billing_date_for_month(anchor,(month_date+interval '1 month')::date))
    order by f.start_date limit 1;
    if not coalesce(found_freeze,false) then return erp.billing_date_for_month(anchor,month_date); end if;
    if freeze_end is null then return null; end if;
    month_date := greatest((month_date+interval '1 month')::date,date_trunc('month',freeze_end)::date);
  end loop;
end; $$;
revoke all on function erp.next_unfrozen_billing_date(uuid,date) from public,anon,authenticated;
