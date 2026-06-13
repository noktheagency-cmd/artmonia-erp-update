-- CRM and Dashboard performance indexes
-- These indexes match the batched /crm and /dashboard read paths.

-- CRM lead summaries, period filters, and main list ordering.
CREATE INDEX IF NOT EXISTS "leads_created_at_desc_idx"
ON "erp"."leads" ("created_at" DESC);

CREATE INDEX IF NOT EXISTS "leads_stage_created_at_desc_idx"
ON "erp"."leads" ("stage", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "leads_followup_created_at_idx"
ON "erp"."leads" ("next_follow_up_at" ASC, "created_at" DESC);

CREATE INDEX IF NOT EXISTS "leads_manager_followup_created_at_idx"
ON "erp"."leads" ("manager_id", "next_follow_up_at" ASC, "created_at" DESC)
WHERE "manager_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "leads_program_created_at_idx"
ON "erp"."leads" ("program_interest_id", "created_at" DESC)
WHERE "program_interest_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "leads_source_created_at_idx"
ON "erp"."leads" ("source", "created_at" DESC)
WHERE "source" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "leads_open_followup_idx"
ON "erp"."leads" ("next_follow_up_at" ASC)
WHERE "stage" IN (
  'NEW'::"erp"."LeadStage",
  'CONTACTED'::"erp"."LeadStage",
  'QUALIFIED'::"erp"."LeadStage",
  'TRIAL_CONSULTATION'::"erp"."LeadStage",
  'NURTURE'::"erp"."LeadStage"
);

-- Dashboard KPI, chart, and preview widgets.
CREATE INDEX IF NOT EXISTS "tasks_open_due_created_at_idx"
ON "erp"."tasks" ("due_at" ASC, "created_at" ASC)
WHERE "status" IN (
  'OPEN'::"erp"."TaskStatus",
  'IN_PROGRESS'::"erp"."TaskStatus"
);

CREATE INDEX IF NOT EXISTS "teacher_payouts_period_status_payout_idx"
ON "erp"."teacher_payouts" ("period_month", "status")
INCLUDE ("payout_amount");

CREATE INDEX IF NOT EXISTS "payments_payment_month_amount_idx"
ON "erp"."payments" ("payment_month")
INCLUDE ("amount");

CREATE INDEX IF NOT EXISTS "invoices_open_due_balance_idx"
ON "erp"."invoices" ("due_date" ASC)
INCLUDE ("balance_due")
WHERE "status" <> 'VOID'::"erp"."InvoiceStatus" AND "balance_due" > 0;

CREATE INDEX IF NOT EXISTS "enrollments_active_student_fee_idx"
ON "erp"."enrollments" ("student_id")
INCLUDE ("monthly_fee")
WHERE "status" = 'ACTIVE'::"erp"."EnrollmentStatus";

CREATE INDEX IF NOT EXISTS "students_active_id_idx"
ON "erp"."students" ("id")
WHERE "lifecycle_status" = 'ACTIVE'::"erp"."StudentLifecycleStatus";
