create table erp.student_mobile_notification_reads (
  id uuid primary key default gen_random_uuid(),
  mobile_account_id uuid not null references erp.student_mobile_accounts(id) on delete cascade,
  notification_key varchar(180) not null,
  read_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_mobile_notification_reads_account_key_unique
    unique (mobile_account_id, notification_key)
);

create index student_mobile_notification_reads_account_read_updated_idx
  on erp.student_mobile_notification_reads(mobile_account_id, read_at, updated_at desc);

alter table erp.student_mobile_notification_reads enable row level security;
revoke all on table erp.student_mobile_notification_reads from anon, authenticated;
