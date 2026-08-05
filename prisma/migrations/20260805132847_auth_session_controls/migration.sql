create table if not exists erp.auth_session_records (
  id uuid primary key,
  user_id uuid not null references erp.users(id) on delete cascade,
  user_agent text,
  client_hints jsonb,
  ip_address text,
  city text,
  country text,
  device_type text not null default 'UNKNOWN',
  device_name text not null default 'Naməlum cihaz',
  browser_name text not null default 'Naməlum brauzer',
  browser_version text,
  os_name text not null default 'Naməlum sistem',
  os_version text,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by_id uuid references erp.users(id) on delete set null,
  revoke_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint auth_session_records_device_type_check
    check (device_type in ('DESKTOP', 'MOBILE', 'TABLET', 'UNKNOWN')),
  constraint auth_session_records_ip_length_check
    check (ip_address is null or char_length(ip_address) <= 64),
  constraint auth_session_records_revoke_reason_length_check
    check (revoke_reason is null or char_length(revoke_reason) <= 300)
);

create index if not exists auth_session_records_user_active_idx
  on erp.auth_session_records (user_id, revoked_at, last_seen_at desc);
create index if not exists auth_session_records_revoker_idx
  on erp.auth_session_records (revoked_by_id, revoked_at desc);
create index if not exists auth_session_records_last_seen_idx
  on erp.auth_session_records (last_seen_at desc);

comment on table erp.auth_session_records is
  'ERP-side metadata and immediate revocation controls for Supabase Auth sessions.';
comment on column erp.auth_session_records.id is
  'Matches the verified session_id claim in a Supabase Auth access token.';

alter table erp.auth_session_records enable row level security;
revoke all on table erp.auth_session_records from anon, authenticated;
grant select, insert, update, delete on table erp.auth_session_records to service_role;
