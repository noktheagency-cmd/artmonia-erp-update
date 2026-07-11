create type "erp"."HrLookupKind" as enum ('DEPARTMENT', 'POSITION');

alter table "erp"."hr_employees"
  add column "user_id" uuid,
  add column "salary_mode" "erp"."FinanceSalaryMode" not null default 'STATIC',
  add column "salary_amount" decimal(12,2) not null default 0,
  add column "salary_percent" decimal(5,2);

create unique index "hr_employees_user_id_key" on "erp"."hr_employees"("user_id");
alter table "erp"."hr_employees"
  add constraint "hr_employees_user_id_fkey"
  foreign key ("user_id") references "erp"."users"("id") on delete set null on update cascade;

create table "erp"."hr_lookup_options" (
  "id" uuid not null default gen_random_uuid(),
  "kind" "erp"."HrLookupKind" not null,
  "name" text not null,
  "is_active" boolean not null default true,
  "created_at" timestamp(3) not null default current_timestamp,
  "updated_at" timestamp(3) not null,
  constraint "hr_lookup_options_pkey" primary key ("id")
);

create unique index "hr_lookup_options_kind_name_key" on "erp"."hr_lookup_options"("kind", "name");
create index "hr_lookup_options_kind_is_active_idx" on "erp"."hr_lookup_options"("kind", "is_active");

insert into "erp"."hr_lookup_options" ("kind", "name", "updated_at") values
  ('DEPARTMENT', 'İdarəetmə', current_timestamp),
  ('DEPARTMENT', 'Satış', current_timestamp),
  ('DEPARTMENT', 'Maliyyə', current_timestamp),
  ('DEPARTMENT', 'Marketing', current_timestamp),
  ('DEPARTMENT', 'Operasiya', current_timestamp),
  ('POSITION', 'Direktor', current_timestamp),
  ('POSITION', 'Satış təmsilçisi', current_timestamp),
  ('POSITION', 'Maliyyə mütəxəssisi', current_timestamp),
  ('POSITION', 'Marketing mütəxəssisi', current_timestamp),
  ('POSITION', 'Administrator', current_timestamp)
on conflict do nothing;

insert into "erp"."hr_employees" (
  "user_id", "full_name", "email", "phone", "department", "position",
  "hire_date", "status", "contract_type", "salary_mode", "salary_amount",
  "created_at", "updated_at"
)
select
  u.id,
  u.full_name,
  u.email,
  u.phone,
  case
    when bool_or(r.code::text = 'FINANCE') then 'Maliyyə'
    when bool_or(r.code::text = 'SALES') then 'Satış'
    else 'İdarəetmə'
  end,
  case
    when bool_or(r.code::text = 'OWNER') then 'Direktor'
    when bool_or(r.code::text = 'FINANCE') then 'Maliyyə mütəxəssisi'
    when bool_or(r.code::text = 'SALES') then 'Satış təmsilçisi'
    else 'Administrator'
  end,
  u.created_at::date,
  case when u.is_active then 'ACTIVE'::"erp"."HrEmployeeStatus" else 'INACTIVE'::"erp"."HrEmployeeStatus" end,
  'FULL_TIME', 'STATIC'::"erp"."FinanceSalaryMode", 0, u.created_at, u.updated_at
from "erp"."users" u
left join "erp"."user_roles" ur on ur.user_id = u.id
left join "erp"."roles" r on r.id = ur.role_id
where not exists (
  select 1 from "erp"."user_roles" tur
  join "erp"."roles" tr on tr.id = tur.role_id
  where tur.user_id = u.id and tr.code::text = 'TEACHER'
)
group by u.id
on conflict ("user_id") do nothing;
