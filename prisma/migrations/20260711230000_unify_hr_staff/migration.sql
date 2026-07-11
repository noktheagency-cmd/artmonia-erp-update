CREATE TYPE "erp"."HrStaffType" AS ENUM ('EMPLOYEE', 'TEACHER');

ALTER TABLE "erp"."hr_employees"
  ADD COLUMN "teacher_id" UUID,
  ADD COLUMN "staff_type" "erp"."HrStaffType" NOT NULL DEFAULT 'EMPLOYEE';

CREATE UNIQUE INDEX "hr_employees_teacher_id_key" ON "erp"."hr_employees"("teacher_id");

ALTER TABLE "erp"."hr_employees"
  ADD CONSTRAINT "hr_employees_teacher_id_fkey"
  FOREIGN KEY ("teacher_id") REFERENCES "erp"."teachers"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "erp"."hr_employees" he
SET "staff_type" = 'TEACHER',
    "teacher_id" = t.id
FROM "erp"."teachers" t
WHERE (he.user_id IS NOT NULL AND he.user_id = t.user_id)
   OR lower(he.full_name) = lower(t.full_name);

INSERT INTO "erp"."hr_employees" (
  "user_id", "teacher_id", "staff_type", "full_name", "email", "phone",
  "department", "position", "hire_date", "status", "contract_type",
  "salary_mode", "salary_amount", "salary_percent", "created_at", "updated_at"
)
SELECT
  t.user_id,
  t.id,
  'TEACHER'::"erp"."HrStaffType",
  t.full_name,
  u.email,
  t.phone,
  'Tədris',
  'Müəllim',
  t.created_at::date,
  CASE WHEN t.is_active THEN 'ACTIVE'::"erp"."HrEmployeeStatus" ELSE 'INACTIVE'::"erp"."HrEmployeeStatus" END,
  'PART_TIME',
  'PERCENT'::"erp"."FinanceSalaryMode",
  0,
  coalesce(rule.salary_percent, 0),
  t.created_at,
  t.updated_at
FROM "erp"."teachers" t
LEFT JOIN "erp"."users" u ON u.id = t.user_id
LEFT JOIN LATERAL (
  SELECT salary_percent
  FROM "erp"."teacher_contract_rules"
  WHERE teacher_id = t.id
  ORDER BY valid_from DESC
  LIMIT 1
) rule ON true
WHERE NOT EXISTS (
  SELECT 1 FROM "erp"."hr_employees" he WHERE he.teacher_id = t.id
);
