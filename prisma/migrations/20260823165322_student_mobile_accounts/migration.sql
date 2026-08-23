create type "erp"."StudentMobileAccountStatus" as enum (
  'INVITED',
  'ACTIVE',
  'DISABLED'
);

create table "erp"."student_mobile_accounts" (
  "id" uuid primary key default gen_random_uuid(),
  "student_id" uuid not null,
  "auth_user_id" uuid not null,
  "login_email" text not null,
  "status" "erp"."StudentMobileAccountStatus" not null default 'INVITED',
  "invited_at" timestamptz not null default now(),
  "last_invite_sent_at" timestamptz not null default now(),
  "activated_at" timestamptz,
  "disabled_at" timestamptz,
  "created_by_id" uuid,
  "updated_by_id" uuid,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now(),
  constraint "student_mobile_accounts_student_id_key" unique ("student_id"),
  constraint "student_mobile_accounts_auth_user_id_key" unique ("auth_user_id"),
  constraint "student_mobile_accounts_login_email_key" unique ("login_email"),
  constraint "student_mobile_accounts_login_email_normalized_check"
    check ("login_email" = lower(btrim("login_email"))),
  constraint "student_mobile_accounts_student_id_fkey"
    foreign key ("student_id") references "erp"."students"("id") on delete cascade,
  constraint "student_mobile_accounts_auth_user_id_fkey"
    foreign key ("auth_user_id") references "auth"."users"("id") on delete cascade,
  constraint "student_mobile_accounts_created_by_id_fkey"
    foreign key ("created_by_id") references "erp"."users"("id") on delete set null,
  constraint "student_mobile_accounts_updated_by_id_fkey"
    foreign key ("updated_by_id") references "erp"."users"("id") on delete set null
);

create index "student_mobile_accounts_status_idx"
  on "erp"."student_mobile_accounts" ("status");

create index "student_mobile_accounts_created_by_id_idx"
  on "erp"."student_mobile_accounts" ("created_by_id");

alter table "erp"."student_mobile_accounts" enable row level security;

revoke all on table "erp"."student_mobile_accounts" from anon, authenticated;

comment on table "erp"."student_mobile_accounts" is
  'Server-managed one-to-one mapping between an ERP student and a Supabase Auth user.';
