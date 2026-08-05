ALTER TABLE "erp"."leads"
ADD COLUMN "trial_lesson_count" INTEGER;

ALTER TABLE "erp"."leads"
ADD CONSTRAINT "leads_trial_lesson_count_range_check"
CHECK (
  "trial_lesson_count" IS NULL
  OR "trial_lesson_count" BETWEEN 1 AND 100
);

ALTER TABLE "erp"."leads"
ADD CONSTRAINT "leads_trial_lesson_stage_count_check"
CHECK (
  "stage" <> 'TRIAL_LESSON'::"erp"."LeadStage"
  OR "trial_lesson_count" IS NOT NULL
);

DROP INDEX IF EXISTS "erp"."leads_open_followup_idx";

CREATE INDEX "leads_open_followup_idx"
ON "erp"."leads" ("next_follow_up_at" ASC)
WHERE "stage" IN (
  'NEW'::"erp"."LeadStage",
  'CONTACTED'::"erp"."LeadStage",
  'QUALIFIED'::"erp"."LeadStage",
  'TRIAL_LESSON'::"erp"."LeadStage",
  'TRIAL_CONSULTATION'::"erp"."LeadStage",
  'NURTURE'::"erp"."LeadStage"
);
