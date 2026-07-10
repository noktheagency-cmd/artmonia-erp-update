create or replace function public.delete_playbook_department(target_department_id uuid)
returns table (storage_path text)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not (select private.is_active_erp_user()) then
    raise exception 'Unauthorized playbook mutation';
  end if;

  return query
    delete from public.playbook_documents
    where department_id = target_department_id
    returning playbook_documents.storage_path;

  delete from public.playbook_departments
  where id = target_department_id;
end;
$$;

revoke all on function public.delete_playbook_department(uuid) from public;
revoke all on function public.delete_playbook_department(uuid) from anon;
grant execute on function public.delete_playbook_department(uuid) to authenticated;
