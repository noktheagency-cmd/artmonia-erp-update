CREATE TYPE "erp"."TaskPriority" AS ENUM ('URGENT', 'NORMAL', 'LOW');

ALTER TABLE "erp"."tasks"
ADD COLUMN "priority" "erp"."TaskPriority" NOT NULL DEFAULT 'NORMAL';
