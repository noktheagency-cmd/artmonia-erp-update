ALTER TABLE "erp"."students"
ADD COLUMN "creation_idempotency_key" UUID;

ALTER TABLE "erp"."finance_expenses"
ADD COLUMN "idempotency_key" UUID;

CREATE UNIQUE INDEX "students_creation_idempotency_key_key"
ON "erp"."students"("creation_idempotency_key");

CREATE UNIQUE INDEX "finance_expenses_idempotency_key_key"
ON "erp"."finance_expenses"("idempotency_key");
