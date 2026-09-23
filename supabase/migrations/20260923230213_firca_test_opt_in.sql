-- Explicit Fırça opt-in for synthetic students. Other ERP test-data rules stay intact.
create table erp.firca_test_opt_ins (
  student_id uuid primary key references erp.students(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp()
);

alter table erp.firca_test_opt_ins enable row level security;
revoke all on erp.firca_test_opt_ins from anon, authenticated;

create or replace function erp.firca_student_eligible(p_student uuid)
returns boolean language sql stable set search_path=pg_catalog,erp as $$
  select exists (
    select 1
    from erp.students s
    join erp.student_mobile_accounts a on a.student_id=s.id
    where s.id=p_student
      and s.lifecycle_status::text='ACTIVE'
      and a.status::text='ACTIVE'
      and (
        not s.is_test_data
        or exists (select 1 from erp.firca_test_opt_ins i where i.student_id=s.id)
      )
      and not exists (select 1 from erp.firca_exclusions x where x.student_id=s.id)
  );
$$;

revoke all on function erp.firca_student_eligible(uuid) from public, anon, authenticated;
