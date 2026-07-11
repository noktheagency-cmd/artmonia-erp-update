create or replace function private.has_erp_permission(permission_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from erp.users u
    join erp.user_roles ur on ur.user_id = u.id
    join erp.roles r on r.id = ur.role_id
    left join erp.role_permissions rp on rp.role_id = r.id
    left join erp.permissions p on p.id = rp.permission_id
    where u.auth_user_id = (select auth.uid())
      and u.is_active = true
      and (
        r.code::text = 'SUPER_ADMIN'
        or p.code = permission_code
      )
  );
$$;

revoke all on function private.has_erp_permission(text) from public;
grant execute on function private.has_erp_permission(text) to authenticated;

drop policy if exists "Active ERP users can read playbook departments" on public.playbook_departments;
drop policy if exists "Active ERP users can create playbook departments" on public.playbook_departments;
drop policy if exists "Active ERP users can update playbook departments" on public.playbook_departments;
drop policy if exists "Active ERP users can delete playbook departments" on public.playbook_departments;
drop policy if exists "Active ERP users can read playbook documents" on public.playbook_documents;
drop policy if exists "Active ERP users can create playbook documents" on public.playbook_documents;
drop policy if exists "Active ERP users can update playbook documents" on public.playbook_documents;
drop policy if exists "Active ERP users can delete playbook documents" on public.playbook_documents;

create policy "Permitted ERP users can read playbook departments"
on public.playbook_departments for select to authenticated
using ((select private.has_erp_permission('playbook.read')));

create policy "Permitted ERP users can create playbook departments"
on public.playbook_departments for insert to authenticated
with check ((select private.has_erp_permission('playbook.manage')));

create policy "Permitted ERP users can update playbook departments"
on public.playbook_departments for update to authenticated
using ((select private.has_erp_permission('playbook.manage')))
with check ((select private.has_erp_permission('playbook.manage')));

create policy "Permitted ERP users can delete playbook departments"
on public.playbook_departments for delete to authenticated
using ((select private.has_erp_permission('playbook.manage')));

create policy "Permitted ERP users can read playbook documents"
on public.playbook_documents for select to authenticated
using ((select private.has_erp_permission('playbook.read')));

create policy "Permitted ERP users can create playbook documents"
on public.playbook_documents for insert to authenticated
with check ((select private.has_erp_permission('playbook.manage')));

create policy "Permitted ERP users can update playbook documents"
on public.playbook_documents for update to authenticated
using ((select private.has_erp_permission('playbook.manage')))
with check ((select private.has_erp_permission('playbook.manage')));

create policy "Permitted ERP users can delete playbook documents"
on public.playbook_documents for delete to authenticated
using ((select private.has_erp_permission('playbook.manage')));

drop policy if exists "Active ERP users can read playbook files" on storage.objects;
drop policy if exists "Active ERP users can upload playbook files" on storage.objects;
drop policy if exists "Active ERP users can update playbook files" on storage.objects;
drop policy if exists "Active ERP users can delete playbook files" on storage.objects;

create policy "Permitted ERP users can read playbook files"
on storage.objects for select to authenticated
using (bucket_id = 'playbook-documents' and (select private.has_erp_permission('playbook.read')));

create policy "Permitted ERP users can upload playbook files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'playbook-documents'
  and (select private.has_erp_permission('playbook.manage'))
  and exists (
    select 1 from public.playbook_departments
    where id::text = (storage.foldername(storage.objects.name))[1]
  )
);

create policy "Permitted ERP users can update playbook files"
on storage.objects for update to authenticated
using (bucket_id = 'playbook-documents' and (select private.has_erp_permission('playbook.manage')))
with check (bucket_id = 'playbook-documents' and (select private.has_erp_permission('playbook.manage')));

create policy "Permitted ERP users can delete playbook files"
on storage.objects for delete to authenticated
using (bucket_id = 'playbook-documents' and (select private.has_erp_permission('playbook.manage')));
