drop policy if exists "Active ERP users can upload playbook files" on storage.objects;

create policy "Active ERP users can upload playbook files"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'playbook-documents'
  and (select private.is_active_erp_user())
  and exists (
    select 1
    from public.playbook_departments
    where id::text = (storage.foldername(storage.objects.name))[1]
  )
);
