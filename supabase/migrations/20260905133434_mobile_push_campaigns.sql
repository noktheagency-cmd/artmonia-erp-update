-- ERP owns content and recipient snapshots; mobile owns device tokens and delivery.
create table erp.mobile_push_campaigns (
  id uuid primary key default gen_random_uuid(),
  created_by_id uuid not null references erp.users(id),
  request_key uuid not null unique,
  request_hash text not null,
  title varchar(100) not null check (length(trim(title)) > 0),
  body varchar(1000) not null check (length(trim(body)) > 0),
  category varchar(40) not null,
  destination varchar(30) not null,
  link_url text,
  image_url text,
  priority varchar(10) not null check (priority in ('normal','high')),
  audience jsonb not null,
  scheduled_at timestamptz not null,
  expires_at timestamptz not null,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > scheduled_at)
);
create index mobile_push_campaigns_creator_idx on erp.mobile_push_campaigns(created_by_id);
create index mobile_push_campaigns_created_idx on erp.mobile_push_campaigns(created_at desc);
create table erp.mobile_push_deliveries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references erp.mobile_push_campaigns(id) on delete cascade,
  mobile_account_id uuid not null references erp.student_mobile_accounts(id) on delete cascade,
  state varchar(20) not null default 'pending'
    check (state in ('pending','processing','accepted','delivered','failed','skipped','cancelled')),
  attempts int not null default 0 check (attempts between 0 and 5),
  available_at timestamptz not null default now(),
  lease_token uuid,
  lease_until timestamptz,
  provider_reference varchar(300),
  result_code varchar(120),
  updated_at timestamptz not null default now(),
  unique(campaign_id, mobile_account_id)
);
create index mobile_push_deliveries_account_idx on erp.mobile_push_deliveries(mobile_account_id);
create index mobile_push_deliveries_queue_idx on erp.mobile_push_deliveries(state,available_at,lease_until);
alter table erp.mobile_push_campaigns enable row level security;
alter table erp.mobile_push_deliveries enable row level security;
revoke all on erp.mobile_push_campaigns, erp.mobile_push_deliveries from anon,authenticated;
