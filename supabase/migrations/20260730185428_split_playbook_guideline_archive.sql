alter table public.playbook_departments
  add column section text not null default 'GUIDELINE'
  check (section in ('GUIDELINE', 'ARCHIVE'));

drop index if exists public.playbook_departments_name_ci_key;

create unique index playbook_departments_section_name_ci_key
  on public.playbook_departments (section, lower(btrim(name)));

create index playbook_departments_section_position_idx
  on public.playbook_departments (section, position, created_at);

comment on column public.playbook_departments.section is
  'Playbook area: current company guidance or completed-work archive.';
