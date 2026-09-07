create function erp.student_is_reserved_on_date(target_student_id uuid,target_date date)
returns boolean language sql stable security invoker set search_path='' as $$
  select coalesce((select h.freeze_reserved from erp.student_status_history h
    where h.student_id=target_student_id and h.effective_at<=target_date
    order by h.effective_at desc,h.created_at desc,h.id desc limit 1),false);
$$;
revoke all on function erp.student_is_reserved_on_date(uuid,date) from public,anon,authenticated;

create function erp.guard_reserved_student_attendance() returns trigger
language plpgsql security invoker set search_path='' as $$
declare student uuid; lesson_date date;
begin
  select student_id into student from erp.enrollments where id=new.enrollment_id;
  perform 1 from erp.students where id=student for update;
  select session_date into lesson_date from erp.slot_sessions where id=new.session_id;
  if erp.student_is_reserved_on_date(student,lesson_date) then
    if new.source='AUTOMATIC'::erp."AttendanceCaptureSource" then return null; end if;
    raise exception 'Rezervli dondurma dövrünə davamiyyət yazıla bilməz; əvvəlcə tələbənin dərsə qayıdışını qeyd edin';
  end if;
  return new;
end; $$;
create trigger guard_reserved_student_attendance before insert or update on erp.attendance_records
for each row execute function erp.guard_reserved_student_attendance();
revoke all on function erp.guard_reserved_student_attendance() from public,anon,authenticated;
