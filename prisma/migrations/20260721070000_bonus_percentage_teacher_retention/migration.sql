ALTER TYPE "erp"."HrBonusMetricKind" ADD VALUE IF NOT EXISTS 'TEACHER_RETENTION_RATE';

ALTER TABLE "erp"."hr_bonus_campaigns"
  ADD COLUMN "teacher_min_cohort_size" INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN "teacher_min_tenure_days" INTEGER NOT NULL DEFAULT 14,
  ADD COLUMN "teacher_reference_student_count" INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN "teacher_max_load_multiplier" DECIMAL(4,2) NOT NULL DEFAULT 1.25;

ALTER TABLE "erp"."hr_bonus_stages"
  ALTER COLUMN "bonus_pool" SET DEFAULT 0,
  ADD COLUMN "bonus_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN "fixed_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;

ALTER TABLE "erp"."hr_bonus_awards"
  ADD COLUMN "base_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "percent_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "fixed_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "workload_multiplier" DECIMAL(4,2) NOT NULL DEFAULT 1,
  ADD COLUMN "metric_value" DECIMAL(7,2),
  ADD COLUMN "calculation_note" TEXT;

CREATE TABLE "erp"."hr_bonus_teacher_cohorts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "campaign_id" UUID NOT NULL,
  "participant_id" UUID NOT NULL,
  "teacher_id" UUID NOT NULL,
  "membership_id" UUID NOT NULL,
  "enrollment_id" UUID NOT NULL,
  "student_id" UUID NOT NULL,
  "assigned_at" DATE NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "hr_bonus_teacher_cohorts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "hr_bonus_teacher_cohorts_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "erp"."hr_bonus_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "hr_bonus_teacher_cohorts_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "erp"."hr_bonus_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "hr_bonus_teacher_cohorts_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "erp"."teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "hr_bonus_teacher_cohorts_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "erp"."group_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "hr_bonus_teacher_cohorts_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "erp"."enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "hr_bonus_teacher_cohorts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "erp"."students"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "hr_bonus_teacher_cohorts_campaign_id_student_id_key"
  ON "erp"."hr_bonus_teacher_cohorts"("campaign_id", "student_id");
CREATE INDEX "hr_bonus_teacher_cohorts_participant_id_idx"
  ON "erp"."hr_bonus_teacher_cohorts"("participant_id");
CREATE INDEX "hr_bonus_teacher_cohorts_teacher_id_campaign_id_idx"
  ON "erp"."hr_bonus_teacher_cohorts"("teacher_id", "campaign_id");
CREATE INDEX "student_status_history_student_id_effective_at_idx"
  ON "erp"."student_status_history"("student_id", "effective_at");

ALTER TABLE "erp"."hr_bonus_teacher_cohorts" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "erp"."hr_bonus_teacher_cohorts" FROM anon, authenticated;
