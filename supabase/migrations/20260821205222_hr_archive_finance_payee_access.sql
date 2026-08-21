ALTER TABLE "erp"."hr_employees"
  ADD COLUMN "employment_ended_at" DATE,
  ADD COLUMN "exit_reason" VARCHAR(500),
  ADD COLUMN "archived_at" TIMESTAMPTZ,
  ADD COLUMN "archived_by_id" UUID;

ALTER TABLE "erp"."hr_employees"
  ADD CONSTRAINT "hr_employees_archived_by_id_fkey"
  FOREIGN KEY ("archived_by_id") REFERENCES "erp"."users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "erp"."hr_employees"
  ADD CONSTRAINT "hr_employees_archive_consistency_check"
  CHECK (
    "archived_at" IS NULL
    OR (
      "status" = 'INACTIVE'::"erp"."HrEmployeeStatus"
      AND "employment_ended_at" IS NOT NULL
      AND length(btrim(coalesce("exit_reason", ''))) >= 3
    )
  );

CREATE INDEX "hr_employees_archived_at_idx"
  ON "erp"."hr_employees"("archived_at");
CREATE INDEX "hr_employees_employment_ended_at_idx"
  ON "erp"."hr_employees"("employment_ended_at");
CREATE INDEX "hr_employees_archived_by_id_idx"
  ON "erp"."hr_employees"("archived_by_id");

ALTER TABLE "erp"."finance_expenses"
  ADD COLUMN "corporate_customer_id" UUID;

ALTER TABLE "erp"."finance_expenses"
  ADD CONSTRAINT "finance_expenses_corporate_customer_id_fkey"
  FOREIGN KEY ("corporate_customer_id") REFERENCES "erp"."hr_corporate_customers"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "finance_expenses_corporate_customer_id_expense_date_idx"
  ON "erp"."finance_expenses"("corporate_customer_id", "expense_date");

INSERT INTO "erp"."permissions" ("id", "code", "description")
VALUES (
  gen_random_uuid(),
  'billing.entry.create',
  'Ödəniş və xərc əlavə etmək; maliyyə göstəricilərini və əməliyyat siyahılarını görmədən məhdud giriş'
)
ON CONFLICT ("code") DO UPDATE
SET "description" = EXCLUDED."description";
