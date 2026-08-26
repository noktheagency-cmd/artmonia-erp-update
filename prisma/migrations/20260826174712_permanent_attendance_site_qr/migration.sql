create table erp.attendance_sites (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  token varchar(64) not null unique,
  location_label text,
  is_active boolean not null default true,
  rotated_at timestamptz not null default now(),
  created_by_id uuid references erp.users(id) on delete set null,
  updated_by_id uuid references erp.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_sites_token_length_check check (char_length(token) between 16 and 64)
);

create index attendance_sites_is_active_idx on erp.attendance_sites(is_active);
create index attendance_sites_created_by_id_idx on erp.attendance_sites(created_by_id);
create index attendance_sites_updated_by_id_idx on erp.attendance_sites(updated_by_id);

alter table erp.student_mobile_accounts
  add column device_installation_id uuid unique,
  add column device_bound_at timestamptz;

alter table erp.mobile_attendance_check_ins
  add column attendance_site_id uuid references erp.attendance_sites(id) on delete set null;

create index mobile_attendance_check_ins_attendance_site_id_idx
  on erp.mobile_attendance_check_ins(attendance_site_id);

insert into erp.attendance_sites (name, token, location_label)
values (
  'Artmonia Academy — Ümumi davamiyyət QR-ı',
  replace(gen_random_uuid()::text, '-', ''),
  'Artmonia Academy'
);

revoke all on table erp.attendance_sites from anon, authenticated;
revoke all on table erp.student_mobile_accounts from anon, authenticated;
revoke all on table erp.mobile_attendance_check_ins from anon, authenticated;
