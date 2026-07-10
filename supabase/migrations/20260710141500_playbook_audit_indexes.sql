create index if not exists playbook_departments_created_by_idx
  on public.playbook_departments (created_by);

create index if not exists playbook_departments_updated_by_idx
  on public.playbook_departments (updated_by);

create index if not exists playbook_documents_created_by_idx
  on public.playbook_documents (created_by);

create index if not exists playbook_documents_updated_by_idx
  on public.playbook_documents (updated_by);
