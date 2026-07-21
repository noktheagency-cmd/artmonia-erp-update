ALTER TABLE "erp"."hr_bonus_campaigns"
  ADD COLUMN "recurs_monthly" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "recurrence_group_id" UUID;

ALTER TABLE "erp"."hr_bonus_campaigns"
  ADD CONSTRAINT "hr_bonus_campaigns_recurrence_check"
  CHECK (("recurs_monthly" = false AND "recurrence_group_id" IS NULL) OR ("recurs_monthly" = true AND "recurrence_group_id" IS NOT NULL));

CREATE UNIQUE INDEX "hr_bonus_campaigns_recurrence_group_id_starts_at_key"
  ON "erp"."hr_bonus_campaigns"("recurrence_group_id", "starts_at");

CREATE TABLE "erp"."hr_bonus_teacher_churn_rules" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "stage_id" UUID NOT NULL,
  "sort_order" INTEGER NOT NULL,
  "churn_threshold" INTEGER NOT NULL,
  "deduction_amount" DECIMAL(12,2) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "hr_bonus_teacher_churn_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "hr_bonus_teacher_churn_rules_values_check" CHECK ("churn_threshold" > 0 AND "deduction_amount" >= 0),
  CONSTRAINT "hr_bonus_teacher_churn_rules_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "erp"."hr_bonus_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "hr_bonus_teacher_churn_rules_stage_id_sort_order_key"
  ON "erp"."hr_bonus_teacher_churn_rules"("stage_id", "sort_order");

CREATE UNIQUE INDEX "hr_bonus_teacher_churn_rules_stage_id_churn_threshold_key"
  ON "erp"."hr_bonus_teacher_churn_rules"("stage_id", "churn_threshold");

ALTER TABLE "erp"."hr_bonus_teacher_churn_rules" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "erp"."hr_bonus_teacher_churn_rules" FROM anon, authenticated;
