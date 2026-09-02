ALTER TABLE "erp"."hr_bonus_campaigns"
  ADD COLUMN "required_threshold" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "per_unit_bonus_percent" DECIMAL(7,2) NOT NULL DEFAULT 0,
  ADD COLUMN "per_unit_bonus_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;

ALTER TABLE "erp"."hr_bonus_stages"
  ADD COLUMN "is_incremental" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "erp"."knowledge_category_audiences" (
  "category_id" UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "knowledge_category_audiences_pkey" PRIMARY KEY ("category_id", "employee_id"),
  CONSTRAINT "knowledge_category_audiences_category_id_fkey"
    FOREIGN KEY ("category_id") REFERENCES "erp"."knowledge_categories"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "knowledge_category_audiences_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "erp"."hr_employees"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "knowledge_category_audiences_employee_id_category_id_idx"
  ON "erp"."knowledge_category_audiences"("employee_id", "category_id");

ALTER TABLE "erp"."knowledge_category_audiences" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "erp"."knowledge_category_audiences" FROM anon, authenticated;

CREATE TABLE "erp"."company_kpi_plans" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(120) NOT NULL,
  "start_month" DATE NOT NULL,
  "end_month" DATE NOT NULL,
  "duration_months" INTEGER NOT NULL,
  "active_students_target" INTEGER NOT NULL,
  "new_sales_target" INTEGER NOT NULL,
  "churn_max_target" INTEGER NOT NULL,
  "lead_target" INTEGER NOT NULL,
  "conversion_target" DECIMAL(8,2) NOT NULL,
  "revenue_target" DECIMAL(16,2) NOT NULL,
  "created_by_id" UUID,
  "updated_by_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "company_kpi_plans_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "company_kpi_plans_duration_check" CHECK ("duration_months" IN (6, 12)),
  CONSTRAINT "company_kpi_plans_month_check" CHECK (
    extract(day from "start_month") = 1
    AND extract(day from "end_month") = 1
  ),
  CONSTRAINT "company_kpi_plans_range_check" CHECK ("end_month" >= "start_month"),
  CONSTRAINT "company_kpi_plans_values_check" CHECK (
    "active_students_target" >= 0
    AND "new_sales_target" >= 0
    AND "churn_max_target" >= 0
    AND "lead_target" >= 0
    AND "conversion_target" >= 0
    AND "revenue_target" >= 0
  ),
  CONSTRAINT "company_kpi_plans_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "erp"."users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "company_kpi_plans_updated_by_id_fkey"
    FOREIGN KEY ("updated_by_id") REFERENCES "erp"."users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "company_kpi_plans_start_month_key"
  ON "erp"."company_kpi_plans"("start_month");
CREATE INDEX "company_kpi_plans_start_month_end_month_idx"
  ON "erp"."company_kpi_plans"("start_month", "end_month");
CREATE INDEX "company_kpi_plans_created_by_id_idx"
  ON "erp"."company_kpi_plans"("created_by_id");
CREATE INDEX "company_kpi_plans_updated_by_id_idx"
  ON "erp"."company_kpi_plans"("updated_by_id");

ALTER TABLE "erp"."company_kpi_plans" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "erp"."company_kpi_plans" FROM anon, authenticated;

ALTER TABLE "erp"."company_monthly_targets"
  ADD COLUMN "plan_id" UUID;

ALTER TABLE "erp"."company_monthly_targets"
  ADD CONSTRAINT "company_monthly_targets_plan_id_fkey"
  FOREIGN KEY ("plan_id") REFERENCES "erp"."company_kpi_plans"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "company_monthly_targets_plan_id_period_month_idx"
  ON "erp"."company_monthly_targets"("plan_id", "period_month");

UPDATE "erp"."knowledge_sections"
SET "name" = 'Qaydalar', "updated_at" = CURRENT_TIMESTAMP
WHERE "key" = 'company';

UPDATE "erp"."about_profiles"
SET "title" = 'Qaydalar', "updated_at" = CURRENT_TIMESTAMP
WHERE lower(trim("title")) IN ('biz kimik', 'bizik');

DO $$
DECLARE
  selected_employee RECORD;
  campaign_uuid UUID;
  actor_uuid UUID;
BEGIN
  SELECT employee.id, employee.full_name, employee.email, employee.department
  INTO selected_employee
  FROM "erp"."hr_employees" employee
  WHERE employee.archived_at IS NULL
    AND employee.status IN ('ACTIVE'::"erp"."HrEmployeeStatus", 'PROBATION'::"erp"."HrEmployeeStatus")
    AND (
      employee.full_name ILIKE '%Ayşən%'
      OR employee.full_name ILIKE '%Aysən%'
      OR employee.full_name ILIKE '%Ayshen%'
      OR employee.full_name ILIKE '%Aysen%'
    )
  ORDER BY employee.created_at ASC
  LIMIT 1;

  IF selected_employee.id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM "erp"."hr_bonus_campaigns" campaign
    WHERE campaign.name = 'Ayşən · Sentyabr satış bonusu'
      AND campaign.starts_at = DATE '2026-09-01'
      AND campaign.ends_at = DATE '2026-09-30'
  ) THEN
    SELECT "id" INTO actor_uuid
    FROM "erp"."users"
    WHERE "is_active" = true
    ORDER BY "created_at" ASC
    LIMIT 1;

    campaign_uuid := gen_random_uuid();
    INSERT INTO "erp"."hr_bonus_campaigns" (
      "id", "name", "department", "starts_at", "ends_at", "metric_kind",
      "distribution_mode", "status", "required_threshold", "per_unit_bonus_percent",
      "per_unit_bonus_amount", "created_by_id", "created_at", "updated_at"
    ) VALUES (
      campaign_uuid,
      'Ayşən · Sentyabr satış bonusu',
      selected_employee.department,
      DATE '2026-09-01',
      DATE '2026-09-30',
      'DEPARTMENT_SALES_COUNT'::"erp"."HrBonusMetricKind",
      'HR_APPROVAL'::"erp"."HrBonusDistributionMode",
      CASE
        WHEN CURRENT_DATE < DATE '2026-09-01' THEN 'SCHEDULED'::"erp"."HrBonusCampaignStatus"
        WHEN CURRENT_DATE > DATE '2026-09-30' THEN 'EXPIRED'::"erp"."HrBonusCampaignStatus"
        ELSE 'ACTIVE'::"erp"."HrBonusCampaignStatus"
      END,
      20,
      10,
      0,
      actor_uuid,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    );

    INSERT INTO "erp"."hr_bonus_participants" (
      "campaign_id", "employee_id", "employee_name", "employee_email", "is_eligible"
    ) VALUES (
      campaign_uuid, selected_employee.id, selected_employee.full_name, selected_employee.email, true
    );

    INSERT INTO "erp"."hr_bonus_stages" (
      "campaign_id", "sort_order", "threshold", "bonus_pool", "bonus_percent",
      "fixed_amount", "is_incremental"
    ) VALUES
      (campaign_uuid, 0, 21, 0, 0, 0, true),
      (campaign_uuid, 1, 50, 0, 0, 50, false),
      (campaign_uuid, 2, 70, 0, 0, 70, false),
      (campaign_uuid, 3, 100, 0, 0, 100, false);
  END IF;
END $$;
