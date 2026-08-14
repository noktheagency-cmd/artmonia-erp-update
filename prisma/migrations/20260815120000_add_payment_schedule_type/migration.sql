CREATE TYPE "erp"."PaymentScheduleType" AS ENUM ('MONTHLY', 'ONE_TIME');

ALTER TABLE "erp"."payments"
ADD COLUMN "schedule_type" "erp"."PaymentScheduleType" NOT NULL DEFAULT 'MONTHLY';
