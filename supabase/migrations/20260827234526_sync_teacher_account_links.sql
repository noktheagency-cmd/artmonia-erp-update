set local lock_timeout = '5s';
set local statement_timeout = '60s';

select pg_advisory_xact_lock(hashtextextended('erp.teacher-account-link-sync', 0));

create temp table _teacher_account_link_candidates on commit drop as
select
  teacher.id as teacher_id,
  employee.user_id,
  teacher.user_id as previous_user_id
from erp.hr_employees employee
join erp.teachers teacher on teacher.id = employee.teacher_id
join erp.users app_user on app_user.id = employee.user_id
where employee.user_id is not null
  and exists (
    select 1
    from erp.user_roles user_role
    join erp.roles role on role.id = user_role.role_id
    where user_role.user_id = employee.user_id
      and role.code = 'TEACHER'::erp."AppRole"
  );

do $$
begin
  if exists (
    select 1
    from _teacher_account_link_candidates candidate
    where candidate.previous_user_id is not null
      and candidate.previous_user_id <> candidate.user_id
  ) then
    raise exception 'A teacher profile is already linked to a different ERP account';
  end if;

  if exists (
    select 1
    from _teacher_account_link_candidates candidate
    join erp.teachers other_teacher
      on other_teacher.user_id = candidate.user_id
     and other_teacher.id <> candidate.teacher_id
  ) then
    raise exception 'An ERP account is already linked to a different teacher profile';
  end if;
end;
$$;

create temp table _teacher_account_links_changed on commit drop as
select teacher_id, user_id, previous_user_id
from _teacher_account_link_candidates
where previous_user_id is distinct from user_id;

update erp.teachers teacher
set
  user_id = changed.user_id,
  updated_at = now()
from _teacher_account_links_changed changed
where teacher.id = changed.teacher_id;

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
  'teacher.account.link.backfill',
  'teacher',
  changed.teacher_id,
  jsonb_build_object('userId', changed.previous_user_id),
  jsonb_build_object('userId', changed.user_id, 'source', 'hr_employee_teacher_role'),
  'Müəllim HR profili TEACHER roluna malik ERP hesabı ilə avtomatik əlaqələndirildi',
  now()
from _teacher_account_links_changed changed;

with inserted_permission as (
  insert into erp.role_permissions (role_id, permission_id, scope)
  select role.id, permission.id, 'ALL'::erp."PermissionScope"
  from erp.roles role
  join erp.permissions permission on permission.code = 'playbook.read'
  where role.code = 'TEACHER'::erp."AppRole"
  on conflict (role_id, permission_id) do nothing
  returning role_id
)
insert into erp.audit_logs (
  id,
  action,
  entity_type,
  entity_id,
  after_json,
  reason,
  created_at
)
select
  gen_random_uuid(),
  'role.permission.reconcile',
  'role',
  inserted.role_id,
  jsonb_build_object('permission', 'playbook.read', 'scope', 'ALL'),
  'Müəllim rolunun kanonik Playbook oxuma icazəsi bərpa edildi',
  now()
from inserted_permission inserted;

do $$
begin
  if exists (
    select 1
    from erp.hr_employees employee
    join erp.teachers teacher on teacher.id = employee.teacher_id
    where employee.user_id is not null
      and exists (
        select 1
        from erp.user_roles user_role
        join erp.roles role on role.id = user_role.role_id
        where user_role.user_id = employee.user_id
          and role.code = 'TEACHER'::erp."AppRole"
      )
      and teacher.user_id is distinct from employee.user_id
  ) then
    raise exception 'Teacher account link reconciliation did not converge';
  end if;
end;
$$;
