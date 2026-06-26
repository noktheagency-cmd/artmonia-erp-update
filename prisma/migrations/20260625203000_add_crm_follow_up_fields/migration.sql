CREATE TYPE "erp"."LeadPriority" AS ENUM ('NORMAL', 'MEDIUM', 'CRITICAL');

CREATE TYPE "erp"."LeadNextActionType" AS ENUM ('CALL', 'CONSULTATION_REMINDER', 'PAYMENT_REMINDER', 'FOLLOW_UP');

ALTER TABLE "erp"."leads"
ADD COLUMN "next_action_type" "erp"."LeadNextActionType",
ADD COLUMN "priority" "erp"."LeadPriority" NOT NULL DEFAULT 'NORMAL';

CREATE INDEX "leads_priority_next_follow_up_at_idx" ON "erp"."leads"("priority", "next_follow_up_at");
