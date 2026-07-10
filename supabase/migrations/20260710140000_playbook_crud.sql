create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.is_active_erp_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from erp.users
    where auth_user_id = (select auth.uid())
      and is_active = true
  );
$$;

revoke all on function private.is_active_erp_user() from public;
grant execute on function private.is_active_erp_user() to authenticated;

create or replace function private.set_playbook_audit_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  new.updated_by = (select auth.uid());

  if tg_op = 'INSERT' then
    new.created_by = coalesce(new.created_by, (select auth.uid()));
  end if;

  return new;
end;
$$;

revoke all on function private.set_playbook_audit_fields() from public;

create table public.playbook_departments (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  color text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  soft_color text not null check (soft_color ~ '^#[0-9a-fA-F]{6}$'),
  icon text not null check (icon in ('marketing', 'sales', 'people', 'finance', 'briefcase', 'book', 'shield', 'support')),
  position smallint not null default 0 check (position >= 0),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index playbook_departments_name_ci_key
  on public.playbook_departments (lower(btrim(name)));

create index playbook_departments_position_idx
  on public.playbook_departments (position, created_at);

create index playbook_departments_created_by_idx
  on public.playbook_departments (created_by);

create index playbook_departments_updated_by_idx
  on public.playbook_departments (updated_by);

create table public.playbook_documents (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.playbook_departments(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 240),
  original_name text not null check (char_length(btrim(original_name)) between 1 and 255),
  storage_path text not null unique check (char_length(storage_path) between 3 and 500),
  extension text not null check (extension in ('PDF', 'DOC', 'DOCX', 'XLS', 'XLSX', 'PPT', 'PPTX')),
  mime_type text not null check (char_length(mime_type) between 3 and 150),
  size_bytes bigint not null check (size_bytes between 1 and 6291456),
  page_count integer check (page_count is null or page_count > 0),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index playbook_documents_department_created_idx
  on public.playbook_documents (department_id, created_at desc);

create index playbook_documents_name_ci_idx
  on public.playbook_documents (lower(name));

create index playbook_documents_created_by_idx
  on public.playbook_documents (created_by);

create index playbook_documents_updated_by_idx
  on public.playbook_documents (updated_by);

create trigger set_playbook_departments_audit_fields
before insert or update on public.playbook_departments
for each row execute function private.set_playbook_audit_fields();

create trigger set_playbook_documents_audit_fields
before insert or update on public.playbook_documents
for each row execute function private.set_playbook_audit_fields();

alter table public.playbook_departments enable row level security;
alter table public.playbook_documents enable row level security;

grant select, insert, update, delete on public.playbook_departments to authenticated;
grant select, insert, update, delete on public.playbook_documents to authenticated;
revoke all on public.playbook_departments from anon;
revoke all on public.playbook_documents from anon;

create policy "Active ERP users can read playbook departments"
on public.playbook_departments for select
to authenticated
using ((select private.is_active_erp_user()));

create policy "Active ERP users can create playbook departments"
on public.playbook_departments for insert
to authenticated
with check ((select private.is_active_erp_user()));

create policy "Active ERP users can update playbook departments"
on public.playbook_departments for update
to authenticated
using ((select private.is_active_erp_user()))
with check ((select private.is_active_erp_user()));

create policy "Active ERP users can delete playbook departments"
on public.playbook_departments for delete
to authenticated
using ((select private.is_active_erp_user()));

create policy "Active ERP users can read playbook documents"
on public.playbook_documents for select
to authenticated
using ((select private.is_active_erp_user()));

create policy "Active ERP users can create playbook documents"
on public.playbook_documents for insert
to authenticated
with check ((select private.is_active_erp_user()));

create policy "Active ERP users can update playbook documents"
on public.playbook_documents for update
to authenticated
using ((select private.is_active_erp_user()))
with check ((select private.is_active_erp_user()));

create policy "Active ERP users can delete playbook documents"
on public.playbook_documents for delete
to authenticated
using ((select private.is_active_erp_user()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'playbook-documents',
  'playbook-documents',
  false,
  6291456,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Active ERP users can read playbook files"
on storage.objects for select
to authenticated
using (
  bucket_id = 'playbook-documents'
  and (select private.is_active_erp_user())
);

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

create policy "Active ERP users can update playbook files"
on storage.objects for update
to authenticated
using (
  bucket_id = 'playbook-documents'
  and (select private.is_active_erp_user())
)
with check (
  bucket_id = 'playbook-documents'
  and (select private.is_active_erp_user())
);

create policy "Active ERP users can delete playbook files"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'playbook-documents'
  and (select private.is_active_erp_user())
);

insert into public.playbook_departments (name, slug, color, soft_color, icon, position)
values
  ('Marketing', 'marketing', '#146cff', '#eaf2ff', 'marketing', 10),
  ('Satış', 'satis', '#10b981', '#e8faf3', 'sales', 20),
  ('HR', 'hr', '#ff763b', '#fff0e9', 'people', 30),
  ('Maliyyə', 'maliyye', '#8057e8', '#f0ebff', 'finance', 40)
on conflict (slug) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'playbook_departments'
  ) then
    alter publication supabase_realtime add table public.playbook_departments;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'playbook_documents'
  ) then
    alter publication supabase_realtime add table public.playbook_documents;
  end if;
end
$$;
