-- Reconcile existing invoices whenever a freeze is recorded, including backdated freezes.
-- Paid/allocated invoices are preserved and flagged for review, never silently moved.
create or replace function erp.reconcile_frozen_student_invoices(
  target_student_id uuid, from_date date, actor_id uuid default null
) returns integer language plpgsql security invoker set search_path = '' as $$
declare inv record; changed integer := 0;
begin
  perform 1 from erp.students where id = target_student_id for update;
  for inv in
    select i.*,
      coalesce((select sum(a.amount_allocated) from erp.payment_allocations a where a.invoice_id=i.id),0) allocated
    from erp.invoices i
    where i.student_id=target_student_id and i.status <> 'VOID'::erp."InvoiceStatus"
      and i.due_date >= from_date
      and (select h.new_status from erp.student_status_history h
           where h.student_id=i.student_id and h.effective_at<=i.due_date
           order by h.effective_at desc,h.created_at desc,h.id desc limit 1)='FROZEN'::erp."StudentLifecycleStatus"
    order by i.due_date,i.id for update of i
  loop
    if inv.allocated > 0 or inv.status='PAID'::erp."InvoiceStatus" or inv.balance_due<>inv.amount then
      insert into erp.audit_logs(id,actor_user_id,action,entity_type,entity_id,before_json,after_json,reason,created_at)
      values(gen_random_uuid(),actor_id,'billing.freeze.review_required','invoice',inv.id,
        to_jsonb(inv),jsonb_build_object('reviewRequired',true),
        'Dondurulma ödənilmiş/qismən ödənilmiş dövrlə üst-üstə düşür; maliyyə baxışı tələb olunur.',now());
      continue;
    end if;
    insert into erp.audit_logs(id,actor_user_id,action,entity_type,entity_id,before_json,after_json,reason,created_at)
    values(gen_random_uuid(),actor_id,'billing.invoice.void_frozen_period','invoice',inv.id,
      to_jsonb(inv),jsonb_build_object('status','VOID','balance_due',0),
      'Ödəniş günü dondurulmuş dövrə düşən ödənişsiz faktura ləğv edildi.',now());
    update erp.invoices set status='VOID',balance_due=0,updated_at=now() where id=inv.id;
    changed := changed+1;
  end loop;
  return changed;
end;
$$;
revoke all on function erp.reconcile_frozen_student_invoices(uuid,date,uuid) from public,anon,authenticated;

create or replace function erp.reconcile_billing_after_freeze_history()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.new_status='FROZEN'::erp."StudentLifecycleStatus" then
    perform erp.reconcile_frozen_student_invoices(new.student_id,new.effective_at,new.changed_by_id);
  end if;
  return new;
end;
$$;
revoke all on function erp.reconcile_billing_after_freeze_history() from public,anon,authenticated;
drop trigger if exists reconcile_billing_after_freeze_history on erp.student_status_history;
create trigger reconcile_billing_after_freeze_history after insert or update of effective_at,new_status
on erp.student_status_history for each row execute function erp.reconcile_billing_after_freeze_history();

create or replace function erp.guard_automatic_frozen_invoice()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  -- Serialize with freeze changes so either the freeze cancels this invoice or creation is blocked.
  perform 1 from erp.students where id=new.student_id for update;
  if new.status <> 'VOID'::erp."InvoiceStatus"
    and (new.idempotency_key like 'student-activation-%'
      or new.idempotency_key like 'billing-auto-%'
      or new.idempotency_key like 'student-gap-%')
    and (select h.new_status from erp.student_status_history h
      where h.student_id=new.student_id and h.effective_at<=new.due_date
      order by h.effective_at desc,h.created_at desc,h.id desc limit 1)='FROZEN'::erp."StudentLifecycleStatus"
  then
    raise exception 'Cannot automatically bill a frozen cycle; check freeze and reactivation dates';
  end if;
  return new;
end;
$$;
revoke all on function erp.guard_automatic_frozen_invoice() from public,anon,authenticated;
drop trigger if exists guard_automatic_frozen_invoice on erp.invoices;
create trigger guard_automatic_frozen_invoice before insert on erp.invoices
for each row execute function erp.guard_automatic_frozen_invoice();

-- Only the two reviewed August invoices are repaired in this migration.
do $$
declare inv record; repaired integer := 0;
begin
  for inv in
    select i.*,s.code from erp.students s join erp.invoices i on i.student_id=s.id
    where s.code in ('ART-2292','ART-2073') and i.period_month=date '2026-08-01'
      and i.idempotency_key=concat('student-activation-',s.code,'-2026-08-01')
    for update of i
  loop
    if inv.status='VOID'::erp."InvoiceStatus" and inv.balance_due=0 then
      if not exists(select 1 from erp.audit_logs where entity_id=inv.id and action='billing.invoice.void_frozen_period') then
        raise exception 'Unexpected prior invoice change for %',inv.code;
      end if;
      repaired:=repaired+1;
      continue;
    end if;
    if inv.amount<>150 or inv.balance_due<>150 or inv.status<>'OVERDUE'::erp."InvoiceStatus"
      or exists(select 1 from erp.payment_allocations where invoice_id=inv.id)
      or (select new_status from erp.student_status_history where student_id=inv.student_id and effective_at<=inv.due_date
          order by effective_at desc,created_at desc,id desc limit 1)<>'FROZEN'::erp."StudentLifecycleStatus"
    then raise exception 'Invoice changed since approved audit for %',inv.code;
    end if;
    insert into erp.audit_logs(id,action,entity_type,entity_id,before_json,after_json,reason,created_at)
    values(gen_random_uuid(),'billing.invoice.void_frozen_period','invoice',inv.id,to_jsonb(inv),
      jsonb_build_object('status','VOID','balance_due',0),
      'Təsdiqlənmiş audit: dondurulmuş avqust dövrünün 150 AZN fakturası ləğv edildi.',now());
    update erp.invoices set status='VOID',balance_due=0,updated_at=now() where id=inv.id;
    repaired:=repaired+1;
  end loop;
  if repaired<>2 then raise exception 'Expected exactly two reviewed invoices, found %',repaired; end if;
end;
$$;

-- Restore Minaye's current state and the two assignments removed by the backdated freeze.
-- The original assignment dates and slot IDs come from the existing schedule audit, not guesses.
do $$
declare st record; en record; schedule record; slot_text text; restored integer := 0; slot_date date;
begin
  select * into strict st from erp.students where code='ART-2292' for update;
  if exists(select 1 from erp.audit_logs where entity_id=st.id and action='student.freeze_history.repair') then return; end if;
  if st.lifecycle_status<>'FROZEN'::erp."StudentLifecycleStatus" or not st.billing_paused then
    raise exception 'Minaye lifecycle changed since audit';
  end if;
  if (select new_status from erp.student_status_history where student_id=st.id
      order by effective_at desc,created_at desc,id desc limit 1)<>'ACTIVE'::erp."StudentLifecycleStatus" then
    raise exception 'No confirmed later activation for Minaye';
  end if;
  if not exists(select 1 from erp.audit_logs where entity_id=st.id and action='student.status.change'
    and after_json->>'effectiveAt'='2026-08-15T00:00:00.000Z'
    and after_json->>'deletedFutureScheduleAssignmentCount'='2') then
    raise exception 'Missing evidence for deleted assignments';
  end if;
  select e.* into strict en from erp.enrollments e where e.student_id=st.id and e.status='PAUSED';
  select * into strict schedule from erp.audit_logs where entity_id=en.id and action='student_schedule.replace'
    order by created_at desc limit 1;
  if jsonb_array_length(schedule.after_json->'slotIds')<>2 then raise exception 'Unexpected schedule audit'; end if;
  if exists(select 1 from erp.student_schedule_assignments where enrollment_id=en.id and valid_to is null) then
    raise exception 'Current assignments changed since audit';
  end if;
  for slot_text in select jsonb_array_elements_text(schedule.after_json->'slotIds') loop
    slot_date := (schedule.after_json->'slotStartDates'->>slot_text)::date;
    if slot_date is null then raise exception 'Missing original slot date'; end if;
    if not exists(select 1 from erp.class_slots where id=slot_text::uuid and teacher_id=en.teacher_id) then
      raise exception 'Original slot or teacher changed';
    end if;
    insert into erp.student_schedule_assignments(id,enrollment_id,slot_id,valid_from,valid_to,assigned_by_id,created_at,updated_at)
    values(gen_random_uuid(),en.id,slot_text::uuid,slot_date,null,schedule.actor_user_id,now(),now());
    restored:=restored+1;
  end loop;
  update erp.students set lifecycle_status='ACTIVE',billing_paused=false,updated_at=now() where id=st.id;
  update erp.enrollments set status='ACTIVE',updated_at=now() where id=en.id;
  insert into erp.audit_logs(id,action,entity_type,entity_id,before_json,after_json,reason,created_at)
  values(gen_random_uuid(),'student.freeze_history.repair','student',st.id,
    jsonb_build_object('status',st.lifecycle_status,'billingPaused',st.billing_paused,'enrollmentStatus',en.status),
    jsonb_build_object('status','ACTIVE','billingPaused',false,'enrollmentStatus','ACTIVE','restoredAssignments',restored,'sourceScheduleAudit',schedule.id,'schedule',schedule.after_json),
    '3 sentyabr bərpasından sonra geriyə tarixli dondurulmanın cari statusa və slotlara təsiri geri alındı.',now());
end;
$$;
