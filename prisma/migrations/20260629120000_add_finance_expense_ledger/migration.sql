CREATE TYPE "erp"."FinanceSalaryMode" AS ENUM ('NONE', 'STATIC', 'PERCENT');

ALTER TABLE "erp"."payments"
ADD COLUMN "payer_name" TEXT,
ADD COLUMN "receipt_file_name" TEXT,
ADD COLUMN "receipt_file_path" TEXT,
ADD COLUMN "receipt_reference" TEXT;

CREATE TABLE "erp"."finance_expense_categories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_expense_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "erp"."finance_expenses" (
    "id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "expense_date" DATE NOT NULL,
    "method" "erp"."PaymentMethod" NOT NULL DEFAULT 'CASH',
    "vendor" TEXT,
    "description" TEXT,
    "employee_user_id" UUID,
    "teacher_id" UUID,
    "salary_mode" "erp"."FinanceSalaryMode" NOT NULL DEFAULT 'NONE',
    "salary_percent" DECIMAL(5,2),
    "salary_base_amount" DECIMAL(12,2),
    "salary_calculated_amount" DECIMAL(12,2),
    "receipt_file_name" TEXT,
    "receipt_file_path" TEXT,
    "receipt_reference" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_expenses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "finance_expense_categories_name_key" ON "erp"."finance_expense_categories"("name");
CREATE INDEX "finance_expenses_category_id_expense_date_idx" ON "erp"."finance_expenses"("category_id", "expense_date");
CREATE INDEX "finance_expenses_employee_user_id_idx" ON "erp"."finance_expenses"("employee_user_id");
CREATE INDEX "finance_expenses_teacher_id_idx" ON "erp"."finance_expenses"("teacher_id");
CREATE INDEX "finance_expenses_created_by_id_idx" ON "erp"."finance_expenses"("created_by_id");
CREATE INDEX "finance_expenses_expense_date_idx" ON "erp"."finance_expenses"("expense_date");

ALTER TABLE "erp"."finance_expenses"
ADD CONSTRAINT "finance_expenses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "erp"."finance_expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "erp"."finance_expenses"
ADD CONSTRAINT "finance_expenses_employee_user_id_fkey" FOREIGN KEY ("employee_user_id") REFERENCES "erp"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "erp"."finance_expenses"
ADD CONSTRAINT "finance_expenses_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "erp"."teachers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "erp"."finance_expenses"
ADD CONSTRAINT "finance_expenses_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "erp"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "erp"."finance_expense_categories" ("id", "name", "description", "is_system", "created_at", "updated_at")
VALUES
  ('5f9a702d-024e-47ec-a91f-51a78aeb2101', 'Maas', 'Statik ve faizle hesablanan emekhaqqi xercleri', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cb4092bc-39bf-4c32-90f2-32b8b4e71b58', 'Icare', 'Studiya, filial ve otaq icareleri', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('0a5ebfbf-8ffc-4928-a3e0-db4b4c7c5c34', 'Kommunal', 'Isiq, su, internet ve gundelik ofis xercleri', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('950e41a2-5451-43c8-b64b-40d2754a7e6a', 'Marketing', 'Reklam, kontent ve satis kampaniyalari', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('d0eb1fc3-2b39-4ed1-b275-73a1db0605d9', 'Material', 'Ders materiallari ve inventar', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;
