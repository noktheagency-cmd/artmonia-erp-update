-- Artmonia ERP initial database blueprint.
-- This is not a generated Supabase migration yet.
-- Convert to a real migration after the Next.js/Prisma foundation is scaffolded.

create schema if not exists erp;

-- Extensions usually available in Supabase Postgres.
create extension if not exists pgcrypto;

create type erp.app_role as enum (
  'SUPER_ADMIN',
  'OWNER',
  'ADMIN',
  'SALES',
  'FINANCE',
  'TEACHER',
  'AUDITOR'
);

create type erp.lead_stage as enum (
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'TRIAL_LESSON',
  'TRIAL_CONSULTATION',
  'REGISTERED',
  'LOST',
  'NURTURE'
);

create type erp.student_lifecycle_status as enum (
  'GROUP_WAITING',
  'ACTIVE',
  'DEBT',
  'FROZEN',
  'STOPPED',
  'COMPLETED'
);

create type erp.enrollment_status as enum (
  'ACTIVE',
  'PAUSED',
  'COMPLETED',
  'CANCELLED'
);

create type erp.invoice_status as enum (
  'DRAFT',
  'OPEN',
  'PARTIAL',
  'PAID',
  'OVERDUE',
  'VOID'
);

create type erp.payment_method as enum (
  'CASH',
  'CARD',
  'BANK_TRANSFER',
  'ONLINE',
  'OTHER'
);

create type erp.task_status as enum (
  'OPEN',
  'IN_PROGRESS',
  'DONE',
  'CANCELLED'
);

create type erp.approval_status as enum (
  'DRAFT',
  'REQUESTED',
  'FINANCE_APPROVED',
  'OWNER_APPROVED',
  'APPROVED',
  'REJECTED',
  'PAID'
);

create table erp.users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  full_name text not null,
  email text unique not null,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table erp.roles (
  id uuid primary key default gen_random_uuid(),
  code erp.app_role unique not null,
  name text not null
);

create table erp.user_roles (
  user_id uuid not null references erp.users(id) on delete cascade,
  role_id uuid not null references erp.roles(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

create table erp.permissions (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  description text
);

create table erp.role_permissions (
  role_id uuid not null references erp.roles(id) on delete cascade,
  permission_id uuid not null references erp.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table erp.contacts (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone_display text,
  phone_normalized text,
  email text,
  source text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index contacts_phone_normalized_idx
  on erp.contacts (phone_normalized);

create table erp.teachers (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references erp.contacts(id),
  full_name text not null,
  phone text,
  capacity integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table erp.programs (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  code text unique,
  default_monthly_fee numeric(12,2) not null default 0,
  default_lessons_per_month integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table erp.program_pricing_versions (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references erp.programs(id) on delete cascade,
  monthly_fee numeric(12,2) not null,
  lessons_per_month integer,
  valid_from date not null,
  valid_to date,
  created_by uuid references erp.users(id),
  created_at timestamptz not null default now()
);

create table erp.leads (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references erp.contacts(id),
  stage erp.lead_stage not null default 'NEW',
  source text,
  manager_id uuid references erp.users(id),
  program_interest_id uuid references erp.programs(id),
  next_follow_up_at timestamptz,
  trial_lesson_count integer check (trial_lesson_count between 1 and 100),
  lost_reason text,
  converted_student_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index leads_stage_idx on erp.leads (stage);
create index leads_manager_stage_idx on erp.leads (manager_id, stage);
create index leads_follow_up_idx on erp.leads (next_follow_up_at) where next_follow_up_at is not null;

create table erp.students (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  contact_id uuid not null references erp.contacts(id),
  manager_id uuid references erp.users(id),
  lifecycle_status erp.student_lifecycle_status not null default 'GROUP_WAITING',
  education_level text,
  registered_at date not null,
  stopped_at date,
  completed_at date,
  freeze_return_at date,
  billing_paused boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index students_status_idx on erp.students (lifecycle_status);
create index students_manager_status_idx on erp.students (manager_id, lifecycle_status);
create index students_registered_at_idx on erp.students (registered_at);

create table erp.student_relationships (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references erp.students(id) on delete cascade,
  related_contact_id uuid not null references erp.contacts(id),
  relationship_type text not null,
  is_payer boolean not null default false,
  is_primary_contact boolean not null default false,
  created_at timestamptz not null default now()
);

create table erp.student_status_history (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references erp.students(id) on delete cascade,
  old_status erp.student_lifecycle_status,
  new_status erp.student_lifecycle_status not null,
  reason text not null,
  note text,
  effective_at date not null default current_date,
  changed_by uuid references erp.users(id),
  created_at timestamptz not null default now()
);

create index student_status_history_student_idx
  on erp.student_status_history (student_id, created_at desc);

create table erp.enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references erp.students(id) on delete cascade,
  program_id uuid not null references erp.programs(id),
  teacher_id uuid references erp.teachers(id),
  status erp.enrollment_status not null default 'ACTIVE',
  start_date date not null,
  first_lesson_at date,
  monthly_fee numeric(12,2) not null,
  lessons_per_month integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index enrollments_student_idx on erp.enrollments (student_id);
create index enrollments_teacher_status_idx on erp.enrollments (teacher_id, status);
create index enrollments_program_status_idx on erp.enrollments (program_id, status);

create table erp.teacher_assignment_history (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references erp.enrollments(id) on delete cascade,
  old_teacher_id uuid references erp.teachers(id),
  new_teacher_id uuid references erp.teachers(id),
  reason text,
  changed_by uuid references erp.users(id),
  created_at timestamptz not null default now()
);

create table erp.invoices (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references erp.students(id),
  enrollment_id uuid references erp.enrollments(id),
  period_month date not null,
  issue_date date not null default current_date,
  due_date date not null,
  amount numeric(12,2) not null,
  balance_due numeric(12,2) not null,
  status erp.invoice_status not null default 'OPEN',
  idempotency_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoices_amount_nonnegative check (amount >= 0),
  constraint invoices_balance_nonnegative check (balance_due >= 0)
);

create index invoices_student_period_idx on erp.invoices (student_id, period_month);
create index invoices_due_status_idx on erp.invoices (due_date, status);
create index invoices_balance_due_idx on erp.invoices (balance_due) where balance_due > 0;

create table erp.payments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references erp.students(id),
  amount numeric(12,2) not null,
  paid_at date not null,
  payment_month date not null,
  method erp.payment_method not null default 'CASH',
  note text,
  idempotency_key text unique,
  created_by uuid references erp.users(id),
  created_at timestamptz not null default now(),
  constraint payments_amount_positive check (amount > 0)
);

create index payments_student_paid_at_idx on erp.payments (student_id, paid_at desc);
create index payments_payment_month_idx on erp.payments (payment_month);

create table erp.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references erp.payments(id) on delete cascade,
  invoice_id uuid not null references erp.invoices(id) on delete cascade,
  amount_allocated numeric(12,2) not null,
  created_at timestamptz not null default now(),
  constraint payment_allocations_positive check (amount_allocated > 0)
);

create index payment_allocations_invoice_idx on erp.payment_allocations (invoice_id);
create index payment_allocations_payment_idx on erp.payment_allocations (payment_id);

create table erp.refund_adjustments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references erp.students(id),
  invoice_id uuid references erp.invoices(id),
  payment_id uuid references erp.payments(id),
  amount numeric(12,2) not null,
  reason text not null,
  status erp.approval_status not null default 'REQUESTED',
  requested_by uuid references erp.users(id),
  finance_approved_by uuid references erp.users(id),
  owner_approved_by uuid references erp.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table erp.teacher_contract_rules (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references erp.teachers(id) on delete cascade,
  salary_percent numeric(5,2) not null,
  teacher_brought_percent numeric(5,2),
  valid_from date not null,
  valid_to date,
  created_by uuid references erp.users(id),
  created_at timestamptz not null default now()
);

create index teacher_contract_rules_teacher_valid_idx
  on erp.teacher_contract_rules (teacher_id, valid_from desc);

create table erp.teacher_payouts (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references erp.teachers(id),
  period_month date not null,
  eligible_revenue numeric(12,2) not null default 0,
  adjustment_amount numeric(12,2) not null default 0,
  payout_amount numeric(12,2) not null default 0,
  status erp.approval_status not null default 'DRAFT',
  generated_by uuid references erp.users(id),
  approved_by uuid references erp.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (teacher_id, period_month)
);

create table erp.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  type text not null,
  entity_type text,
  entity_id uuid,
  owner_user_id uuid references erp.users(id),
  status erp.task_status not null default 'OPEN',
  due_at timestamptz,
  completed_at timestamptz,
  created_by uuid references erp.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tasks_owner_status_due_idx on erp.tasks (owner_user_id, status, due_at);
create index tasks_entity_idx on erp.tasks (entity_type, entity_id);

create table erp.targets (
  id uuid primary key default gen_random_uuid(),
  period_month date not null,
  target_amount numeric(12,2) not null,
  owner_user_id uuid references erp.users(id),
  program_id uuid references erp.programs(id),
  manager_id uuid references erp.users(id),
  created_at timestamptz not null default now()
);

create table erp.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references erp.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_json jsonb,
  after_json jsonb,
  reason text,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index audit_logs_entity_idx on erp.audit_logs (entity_type, entity_id, created_at desc);
create index audit_logs_actor_idx on erp.audit_logs (actor_user_id, created_at desc);

create table erp.job_runs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null,
  status text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  affected_rows integer not null default 0,
  error_message text
);

create table erp.exports (
  id uuid primary key default gen_random_uuid(),
  export_type text not null,
  filters_json jsonb,
  row_count integer,
  file_path text,
  requested_by uuid references erp.users(id),
  created_at timestamptz not null default now()
);

-- Dashboard view sketches.
create or replace view erp.debt_aging_v as
select
  i.id as invoice_id,
  i.student_id,
  i.due_date,
  i.balance_due,
  greatest((current_date - i.due_date), 0) as days_overdue,
  case
    when current_date <= i.due_date then 'CURRENT'
    when current_date - i.due_date between 1 and 3 then '0_3'
    when current_date - i.due_date between 4 and 7 then '4_7'
    when current_date - i.due_date between 8 and 14 then '8_14'
    when current_date - i.due_date between 15 and 30 then '15_30'
    else '30_PLUS'
  end as aging_bucket
from erp.invoices i
where i.balance_due > 0;

create or replace view erp.active_mrr_v as
select
  coalesce(sum(e.monthly_fee), 0) as active_mrr
from erp.enrollments e
join erp.students s on s.id = e.student_id
where e.status = 'ACTIVE'
  and s.lifecycle_status = 'ACTIVE';
