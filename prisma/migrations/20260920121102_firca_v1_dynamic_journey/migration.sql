-- One program lesson is one Journey step; retain legacy material content.
alter table erp.program_lesson_materials alter column track drop not null;
alter table erp.program_lesson_materials add column sequence integer;
with ordered as (
 select id,row_number() over(partition by topic_id order by track,id)::integer as n
 from erp.program_lesson_materials
) update erp.program_lesson_materials m set sequence=o.n from ordered o where o.id=m.id;
alter table erp.program_lesson_materials alter column sequence set not null;
alter table erp.program_lesson_materials alter column sequence set default 1;
alter table erp.program_lesson_materials drop constraint if exists program_lesson_materials_topic_track_key;
alter table erp.program_lesson_materials drop constraint if exists program_lesson_materials_topic_id_track_key;
drop index if exists erp.program_lesson_materials_topic_id_track_key;
alter table erp.program_lesson_materials add constraint program_lesson_materials_topic_sequence_key unique(topic_id,sequence) deferrable initially deferred;

create table erp.firca_settings (
 id integer primary key default 1 check(id=1),
 enabled boolean not null default false,
 starts_at timestamptz,
 attendance_points integer not null default 20 check(attendance_points between 1 and 1000),
 homework_points integer not null default 20 check(homework_points between 1 and 1000),
 comment_points integer not null default 5 check(comment_points between 1 and 100),
 weekly_comment_limit integer not null default 4 check(weekly_comment_limit between 1 and 100),
 min_comment_length integer not null default 20 check(min_comment_length between 1 and 1000),
 updated_at timestamptz not null default now(),
 check(not enabled or starts_at is not null)
);
insert into erp.firca_settings default values;
create table erp.firca_exclusions (
 student_id uuid primary key references erp.students(id) on delete cascade,
 reason text not null,
 created_at timestamptz not null default now()
);
-- Known synthetic student codes only; no real student or previous XP is deleted.
insert into erp.firca_exclusions(student_id,reason)
 select id,'Test hesabı' from erp.students where upper(code) like 'TEST%';
create table erp.firca_awards (
 id uuid primary key default gen_random_uuid(),
 student_id uuid not null references erp.students(id) on delete restrict,
 source varchar(20) not null check(source in ('attendance','homework','comment')),
 source_id uuid not null,
 balance integer not null default 0 check(balance>=0),
 awarded_points integer not null default 0 check(awarded_points>=0),
 first_awarded_at timestamptz,
 unique(student_id,source,source_id)
);
create table erp.firca_ledger (
 id uuid primary key default gen_random_uuid(),
 award_id uuid not null references erp.firca_awards(id) on delete restrict,
 delta integer not null check(delta<>0),
 reason text not null,
 actor_id uuid references erp.users(id) on delete restrict,
 occurred_at timestamptz not null default clock_timestamp()
);
create index firca_awards_student_idx on erp.firca_awards(student_id);
create index firca_awards_comment_week_idx on erp.firca_awards(student_id,first_awarded_at) where source='comment';
create index firca_ledger_award_idx on erp.firca_ledger(award_id);
create index firca_ledger_month_idx on erp.firca_ledger(occurred_at,award_id);
create table erp.homework_submissions (
 id uuid primary key default gen_random_uuid(),
 student_id uuid not null references erp.students(id) on delete restrict,
 homework_id uuid not null references erp.lesson_homeworks(id) on delete restrict,
 session_id uuid not null references erp.slot_sessions(id) on delete restrict,
 request_key uuid not null,
 object_path text not null,
 file_name text not null,
 content_type text not null,
 file_size integer not null check(file_size between 1 and 8388608),
 status varchar(20) not null default 'submitted' check(status in ('submitted','accepted','rejected')),
 feedback text,
 revision integer not null default 1,
 reviewed_by_id uuid references erp.users(id),
 reviewed_at timestamptz,
 submitted_at timestamptz not null default clock_timestamp(),
 unique(student_id,request_key),
 unique(student_id,session_id)
);
create index homework_submissions_queue_idx on erp.homework_submissions(status,submitted_at);
create table erp.firca_comments (
 id uuid primary key,
 student_id uuid not null references erp.students(id) on delete restrict,
 post_id uuid not null,
 post_author_id uuid not null,
 body text not null,
 normalized_text text not null,
 parent_id uuid,
 revision integer not null check(revision>0),
 eligible boolean not null,
 deleted boolean not null,
 moderated boolean not null default false,
 created_at timestamptz not null,
 received_at timestamptz not null default clock_timestamp()
);
create table erp.firca_comment_claims (
 student_id uuid not null references erp.students(id),
 post_id uuid not null,
 comment_id uuid not null references erp.firca_comments(id),
 primary key(student_id,post_id)
);
alter table erp.firca_comment_claims enable row level security;
revoke all on erp.firca_comment_claims from anon,authenticated;
create table erp.homework_submission_requests (
 student_id uuid not null references erp.students(id),
 request_key uuid not null,
 homework_id uuid not null,
 submission_id uuid not null references erp.homework_submissions(id),
 payload_hash text not null,
 created_at timestamptz not null default clock_timestamp(),
 primary key(student_id,request_key)
);
alter table erp.homework_submission_requests enable row level security;
revoke all on erp.homework_submission_requests from anon,authenticated;
create index firca_comments_duplicate_idx on erp.firca_comments(student_id,md5(normalized_text));
create table erp.firca_comment_events (
 comment_id uuid not null,
 revision integer not null,
 payload_hash text not null,
 received_at timestamptz not null default clock_timestamp(),
 primary key(comment_id,revision)
);
-- Serializes all three sources for a student; balances never overwrite history.
create function erp.firca_set_balance(p_student uuid,p_source text,p_source_id uuid,p_points integer,p_reason text,p_actor uuid default null)
 returns integer language plpgsql set search_path=pg_catalog,erp as $$
declare a erp.firca_awards; amount integer; difference integer;
begin
 perform pg_advisory_xact_lock(hashtextextended('firca:'||p_student::text,0));
 insert into erp.firca_awards(student_id,source,source_id) values(p_student,p_source,p_source_id)
 on conflict(student_id,source,source_id) do nothing;
 select * into a from erp.firca_awards where student_id=p_student and source=p_source and source_id=p_source_id for update;
 amount := case when p_points<=0 then 0 when a.first_awarded_at is not null then a.awarded_points else p_points end;
 difference := amount-a.balance;
 if difference=0 then return 0; end if;
 update erp.firca_awards set balance=amount,
 awarded_points=case when first_awarded_at is null then amount else awarded_points end,
 first_awarded_at=case when first_awarded_at is null and amount>0 then clock_timestamp() else first_awarded_at end
 where id=a.id;
 insert into erp.firca_ledger(award_id,delta,reason,actor_id) values(a.id,difference,p_reason,p_actor);
 return difference;
end $$;

create function erp.firca_student_eligible(p_student uuid) returns boolean language sql stable set search_path=pg_catalog,erp as $$
 select exists(select 1 from erp.students s join erp.student_mobile_accounts a on a.student_id=s.id
 where s.id=p_student and s.lifecycle_status::text='ACTIVE' and a.status::text='ACTIVE'
 and not exists(select 1 from erp.firca_exclusions x where x.student_id=s.id))
$$;

create function erp.firca_sync_attendance(p_student uuid,p_session uuid) returns void language plpgsql set search_path=pg_catalog,erp as $$
declare points integer:=0; cfg erp.firca_settings; existing_balance integer;
begin
 perform pg_advisory_xact_lock(hashtextextended('firca:'||p_student::text,0));
 select * into cfg from erp.firca_settings where id=1;
 select balance into existing_balance from erp.firca_awards where student_id=p_student and source='attendance' and source_id=p_session;
 if exists(select 1 from erp.attendance_records r join erp.enrollments e on e.id=r.enrollment_id
 join erp.slot_sessions s on s.id=r.session_id where e.student_id=p_student and r.session_id=p_session
 and r.status::text='PRESENT' and s.status::text<>'CANCELLED') then
   -- Pausing awards must not reverse valid existing attendance.
   if coalesce(existing_balance,0)>0 then return; end if;
   if cfg.enabled and clock_timestamp()>=cfg.starts_at and erp.firca_student_eligible(p_student) and exists(
    select 1 from erp.slot_sessions s where s.id=p_session
    and s.session_date >= (cfg.starts_at at time zone 'Asia/Baku')::date
   ) then points:=cfg.attendance_points; end if;
 end if;
 if points>0 or coalesce(existing_balance,0)>0 then
  perform erp.firca_set_balance(p_student,'attendance',p_session,points,'Davamiyyət yeniləndi');
 end if;
end $$;
create function erp.firca_attendance_trigger() returns trigger language plpgsql set search_path=pg_catalog,erp as $$
declare student uuid;
begin
 if TG_OP<>'INSERT' then
  select student_id into student from erp.enrollments where id=OLD.enrollment_id;
  if student is not null then perform erp.firca_sync_attendance(student,OLD.session_id); end if;
 end if;
 if TG_OP<>'DELETE' then
  select student_id into student from erp.enrollments where id=NEW.enrollment_id;
  if student is not null then perform erp.firca_sync_attendance(student,NEW.session_id); end if;
 end if;
 return null;
end $$;
create trigger firca_attendance_changed after insert or update or delete on erp.attendance_records
 for each row execute function erp.firca_attendance_trigger();
create function erp.firca_session_trigger() returns trigger language plpgsql set search_path=pg_catalog,erp as $$
declare student uuid;
begin
 for student in select distinct e.student_id from erp.attendance_records r join erp.enrollments e on e.id=r.enrollment_id where r.session_id=NEW.id order by e.student_id loop
  perform erp.firca_sync_attendance(student,NEW.id);
 end loop;
 -- A cancelled lesson also reverses accepted homework awards.
 if NEW.status::text='CANCELLED' then
  for student in select student_id from erp.homework_submissions where session_id=NEW.id and status='accepted' order by student_id loop
   perform erp.firca_set_balance(student,'homework',NEW.id,0,'Dərs ləğv edildi');
  end loop;
 end if;
 return null;
end $$;
create trigger firca_session_changed after update of status on erp.slot_sessions
 for each row when (OLD.status is distinct from NEW.status) execute function erp.firca_session_trigger();

alter table erp.firca_settings enable row level security;
alter table erp.firca_exclusions enable row level security;
alter table erp.firca_awards enable row level security;
alter table erp.firca_ledger enable row level security;
alter table erp.homework_submissions enable row level security;
alter table erp.firca_comments enable row level security;
alter table erp.firca_comment_events enable row level security;
revoke all on erp.firca_settings,erp.firca_exclusions,erp.firca_awards,erp.firca_ledger,erp.homework_submissions,erp.firca_comments,erp.firca_comment_events from anon,authenticated;
revoke all on function erp.firca_set_balance(uuid,text,uuid,integer,text,uuid), erp.firca_student_eligible(uuid),erp.firca_sync_attendance(uuid,uuid),erp.firca_attendance_trigger(),erp.firca_session_trigger() from public,anon,authenticated;

-- Corrections append a compensating entry; existing ledger rows are immutable.
create function erp.firca_ledger_immutable() returns trigger language plpgsql as $$
begin
 raise exception 'FIRCA_LEDGER_IMMUTABLE: append a reversal instead';
end $$;
create trigger firca_ledger_immutable before update or delete on erp.firca_ledger
 for each row execute function erp.firca_ledger_immutable();
revoke all on function erp.firca_ledger_immutable() from public,anon,authenticated;
