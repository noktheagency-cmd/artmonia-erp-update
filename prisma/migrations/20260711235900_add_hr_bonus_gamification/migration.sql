CREATE TYPE "erp"."HrBonusMetricKind" AS ENUM ('DEPARTMENT_COLLECTED_REVENUE', 'DEPARTMENT_SALES_COUNT', 'MANUAL_KPI');
CREATE TYPE "erp"."HrBonusDistributionMode" AS ENUM ('EQUAL', 'HR_APPROVAL');
CREATE TYPE "erp"."HrBonusCampaignStatus" AS ENUM ('SCHEDULED', 'ACTIVE', 'ACHIEVED', 'EXPIRED', 'CANCELLED');
CREATE TYPE "erp"."HrBonusAwardStatus" AS ENUM ('PENDING_HR', 'APPROVED', 'POSTED', 'VOIDED');

CREATE TABLE "erp"."hr_bonus_campaigns" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "department" TEXT NOT NULL,
  "starts_at" DATE NOT NULL,
  "ends_at" DATE NOT NULL,
  "metric_kind" "erp"."HrBonusMetricKind" NOT NULL,
  "distribution_mode" "erp"."HrBonusDistributionMode" NOT NULL DEFAULT 'EQUAL',
  "status" "erp"."HrBonusCampaignStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_by_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "hr_bonus_campaigns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "erp"."hr_bonus_stages" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "campaign_id" UUID NOT NULL,
  "sort_order" INTEGER NOT NULL,
  "threshold" DECIMAL(14,2) NOT NULL,
  "bonus_pool" DECIMAL(12,2) NOT NULL,
  "reached_at" TIMESTAMP(3),
  "reached_value" DECIMAL(14,2),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "hr_bonus_stages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "erp"."hr_bonus_participants" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "campaign_id" UUID NOT NULL,
  "employee_id" UUID,
  "employee_name" TEXT NOT NULL,
  "employee_email" TEXT,
  "is_eligible" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "hr_bonus_participants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "erp"."hr_bonus_progress_adjustments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "campaign_id" UUID NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "reason" TEXT NOT NULL,
  "created_by_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "hr_bonus_progress_adjustments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "erp"."hr_bonus_awards" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "stage_id" UUID NOT NULL,
  "participant_id" UUID NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "status" "erp"."HrBonusAwardStatus" NOT NULL DEFAULT 'PENDING_HR',
  "approved_by_id" UUID,
  "approved_at" TIMESTAMP(3),
  "posted_at" TIMESTAMP(3),
  "void_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "hr_bonus_awards_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "erp"."finance_expenses"
  ADD COLUMN "hr_employee_id" UUID,
  ADD COLUMN "bonus_award_id" UUID;

CREATE INDEX "hr_bonus_campaigns_department_starts_at_ends_at_idx" ON "erp"."hr_bonus_campaigns"("department", "starts_at", "ends_at");
CREATE INDEX "hr_bonus_campaigns_status_starts_at_ends_at_idx" ON "erp"."hr_bonus_campaigns"("status", "starts_at", "ends_at");
CREATE INDEX "hr_bonus_campaigns_created_by_id_idx" ON "erp"."hr_bonus_campaigns"("created_by_id");
CREATE UNIQUE INDEX "hr_bonus_stages_campaign_id_sort_order_key" ON "erp"."hr_bonus_stages"("campaign_id", "sort_order");
CREATE INDEX "hr_bonus_stages_campaign_id_threshold_idx" ON "erp"."hr_bonus_stages"("campaign_id", "threshold");
CREATE UNIQUE INDEX "hr_bonus_participants_campaign_id_employee_id_key" ON "erp"."hr_bonus_participants"("campaign_id", "employee_id");
CREATE INDEX "hr_bonus_participants_employee_id_idx" ON "erp"."hr_bonus_participants"("employee_id");
CREATE INDEX "hr_bonus_progress_adjustments_campaign_id_created_at_idx" ON "erp"."hr_bonus_progress_adjustments"("campaign_id", "created_at");
CREATE INDEX "hr_bonus_progress_adjustments_created_by_id_idx" ON "erp"."hr_bonus_progress_adjustments"("created_by_id");
CREATE UNIQUE INDEX "hr_bonus_awards_stage_id_participant_id_key" ON "erp"."hr_bonus_awards"("stage_id", "participant_id");
CREATE INDEX "hr_bonus_awards_participant_id_status_idx" ON "erp"."hr_bonus_awards"("participant_id", "status");
CREATE INDEX "hr_bonus_awards_approved_by_id_idx" ON "erp"."hr_bonus_awards"("approved_by_id");
CREATE UNIQUE INDEX "finance_expenses_bonus_award_id_key" ON "erp"."finance_expenses"("bonus_award_id");
CREATE INDEX "finance_expenses_hr_employee_id_idx" ON "erp"."finance_expenses"("hr_employee_id");

ALTER TABLE "erp"."hr_bonus_campaigns" ADD CONSTRAINT "hr_bonus_campaigns_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "erp"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "erp"."hr_bonus_stages" ADD CONSTRAINT "hr_bonus_stages_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "erp"."hr_bonus_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "erp"."hr_bonus_participants" ADD CONSTRAINT "hr_bonus_participants_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "erp"."hr_bonus_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "erp"."hr_bonus_participants" ADD CONSTRAINT "hr_bonus_participants_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "erp"."hr_employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "erp"."hr_bonus_progress_adjustments" ADD CONSTRAINT "hr_bonus_progress_adjustments_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "erp"."hr_bonus_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "erp"."hr_bonus_progress_adjustments" ADD CONSTRAINT "hr_bonus_progress_adjustments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "erp"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "erp"."hr_bonus_awards" ADD CONSTRAINT "hr_bonus_awards_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "erp"."hr_bonus_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "erp"."hr_bonus_awards" ADD CONSTRAINT "hr_bonus_awards_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "erp"."hr_bonus_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "erp"."hr_bonus_awards" ADD CONSTRAINT "hr_bonus_awards_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "erp"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "erp"."finance_expenses" ADD CONSTRAINT "finance_expenses_hr_employee_id_fkey" FOREIGN KEY ("hr_employee_id") REFERENCES "erp"."hr_employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "erp"."finance_expenses" ADD CONSTRAINT "finance_expenses_bonus_award_id_fkey" FOREIGN KEY ("bonus_award_id") REFERENCES "erp"."hr_bonus_awards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "erp"."permissions" ("id", "code", "description") VALUES
  (gen_random_uuid(), 'hr.bonus.read', 'Read department bonus campaigns'),
  (gen_random_uuid(), 'hr.bonus.manage', 'Create and manage bonus campaigns'),
  (gen_random_uuid(), 'hr.bonus.approve', 'Approve employee bonus awards')
ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description";

INSERT INTO "erp"."role_permissions" ("role_id", "permission_id", "scope")
SELECT r.id, p.id, 'ALL'::"erp"."PermissionScope"
FROM "erp"."roles" r
JOIN "erp"."permissions" p ON p.code IN ('hr.bonus.read','hr.bonus.manage','hr.bonus.approve')
WHERE r.code IN ('SUPER_ADMIN','OWNER','ADMIN')
ON CONFLICT ("role_id", "permission_id") DO UPDATE SET "scope" = EXCLUDED."scope";

INSERT INTO "erp"."role_permissions" ("role_id", "permission_id", "scope")
SELECT r.id, p.id,
  CASE WHEN r.code = 'AUDITOR' THEN 'ALL'::"erp"."PermissionScope" ELSE 'ASSIGNED'::"erp"."PermissionScope" END
FROM "erp"."roles" r
JOIN "erp"."permissions" p ON p.code = 'hr.bonus.read'
WHERE r.code IN ('SALES','FINANCE','TEACHER','AUDITOR')
ON CONFLICT ("role_id", "permission_id") DO UPDATE SET "scope" = EXCLUDED."scope";

INSERT INTO "erp"."finance_expense_categories" ("id", "name", "description", "is_system", "created_at", "updated_at")
VALUES (gen_random_uuid(), 'Əməkdaş bonusu', 'HR bonus kampaniyalarından təsdiqlənmiş ödənişlər', true, now(), now())
ON CONFLICT ("name") DO UPDATE SET "description" = EXCLUDED."description", "is_system" = true;
