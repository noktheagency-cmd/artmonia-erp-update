-- Repair technical combobox sentinels that were persisted as business data.
UPDATE "erp"."hr_employees"
SET "department" = CASE
  WHEN "staff_type" = 'TEACHER'::"erp"."HrStaffType" THEN 'Tədris'
  ELSE 'Ümumi'
END
WHERE "department" = '__new';

UPDATE "erp"."hr_employees"
SET "position" = CASE
  WHEN "staff_type" = 'TEACHER'::"erp"."HrStaffType" THEN 'Müəllim'
  ELSE 'Əməkdaş'
END
WHERE "position" = '__new';

DELETE FROM "erp"."hr_lookup_options"
WHERE "name" = '__new';

-- Keep the UI-only sentinel out of HR records even if another writer bypasses the app.
ALTER TABLE "erp"."hr_employees"
  ADD CONSTRAINT "hr_employees_no_reserved_lookup_values"
  CHECK ("department" <> '__new' AND "position" <> '__new');

ALTER TABLE "erp"."hr_lookup_options"
  ADD CONSTRAINT "hr_lookup_options_no_reserved_name"
  CHECK ("name" <> '__new');
