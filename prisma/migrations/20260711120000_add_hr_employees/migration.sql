CREATE TYPE "erp"."HrEmployeeStatus" AS ENUM ('ACTIVE', 'PROBATION', 'ON_LEAVE', 'INACTIVE');

CREATE TABLE "erp"."hr_employees" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "full_name" TEXT NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "department" TEXT NOT NULL,
  "position" TEXT NOT NULL,
  "hire_date" DATE NOT NULL,
  "status" "erp"."HrEmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
  "contract_type" TEXT NOT NULL DEFAULT 'FULL_TIME',
  "note" TEXT,
  "created_by_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "hr_employees_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "hr_employees_status_idx" ON "erp"."hr_employees"("status");
CREATE INDEX "hr_employees_department_idx" ON "erp"."hr_employees"("department");
