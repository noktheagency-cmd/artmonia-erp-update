-- Follow-up migration: initial Fırça migration may already be deployed.
-- Honor the ERP's existing synthetic-student flag without erasing history.
insert into erp.firca_exclusions(student_id,reason)
 select id,'Test hesabı' from erp.students where is_test_data
 on conflict(student_id) do nothing;
create or replace function erp.firca_student_eligible(p_student uuid) returns boolean language sql stable set search_path=pg_catalog,erp as $$
 select exists(select 1 from erp.students s join erp.student_mobile_accounts a on a.student_id=s.id
 where s.id=p_student and not s.is_test_data and s.lifecycle_status::text='ACTIVE' and a.status::text='ACTIVE'
 and not exists(select 1 from erp.firca_exclusions x where x.student_id=s.id))
$$;
-- Reopening a cancelled lesson reconciles accepted homework as well.
create or replace function erp.firca_session_trigger() returns trigger language plpgsql set search_path=pg_catalog,erp as $$
declare student uuid; points integer; cfg erp.firca_settings; work record;
begin
 for student in select distinct e.student_id from erp.attendance_records r join erp.enrollments e on e.id=r.enrollment_id where r.session_id=NEW.id order by e.student_id loop
  perform erp.firca_sync_attendance(student,NEW.id);
 end loop;
 select * into cfg from erp.firca_settings where id=1;
 for work in select student_id,submitted_at from erp.homework_submissions where session_id=NEW.id and status='accepted' order by student_id loop
  if NEW.status::text='CANCELLED' then
   perform erp.firca_set_balance(work.student_id,'homework',NEW.id,0,'Dərs ləğv edildi');
  elsif OLD.status::text='CANCELLED' and cfg.enabled and clock_timestamp()>=cfg.starts_at
    and work.submitted_at>=cfg.starts_at and erp.firca_student_eligible(work.student_id) then
   perform erp.firca_set_balance(work.student_id,'homework',NEW.id,cfg.homework_points,'Dərs bərpa edildi');
  end if;
 end loop;
 return null;
end $$;
revoke all on function erp.firca_student_eligible(uuid),erp.firca_session_trigger() from public,anon,authenticated;
