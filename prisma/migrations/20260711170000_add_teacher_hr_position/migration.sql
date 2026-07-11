insert into "erp"."hr_lookup_options" ("kind", "name", "updated_at")
values ('POSITION', 'Müəllim', current_timestamp)
on conflict ("kind", "name") do update set "is_active" = true, "updated_at" = current_timestamp;
