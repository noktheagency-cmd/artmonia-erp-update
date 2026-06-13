-- Student & Finance List performance indexes
-- These indexes match the /students list, create-modal options, and search access patterns.

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- Main student list ordering.
CREATE INDEX IF NOT EXISTS "students_registered_created_idx"
ON "erp"."students" ("registered_at" DESC, "created_at" DESC);

-- Latest active enrollment per student.
CREATE INDEX IF NOT EXISTS "enrollments_active_student_start_idx"
ON "erp"."enrollments" ("student_id", "start_date" DESC, "created_at" DESC)
WHERE "status" IN ('ACTIVE'::"erp"."EnrollmentStatus", 'PAUSED'::"erp"."EnrollmentStatus");

-- Open invoice balance and next due date lookups.
CREATE INDEX IF NOT EXISTS "invoices_open_student_due_idx"
ON "erp"."invoices" ("student_id", "due_date" ASC, "created_at" ASC)
WHERE "status" <> 'VOID'::"erp"."InvoiceStatus" AND "balance_due" > 0;

-- Invoice history in student detail modal.
CREATE INDEX IF NOT EXISTS "invoices_non_void_student_due_idx"
ON "erp"."invoices" ("student_id", "due_date" ASC, "created_at" ASC)
WHERE "status" <> 'VOID'::"erp"."InvoiceStatus";

-- Latest payment and status history per student.
CREATE INDEX IF NOT EXISTS "payments_student_paid_created_idx"
ON "erp"."payments" ("student_id", "paid_at" DESC, "created_at" DESC);

CREATE INDEX IF NOT EXISTS "student_status_history_student_effective_created_idx"
ON "erp"."student_status_history" ("student_id", "effective_at" DESC, "created_at" DESC);

-- Lead picker in the student-create modal.
CREATE INDEX IF NOT EXISTS "leads_convertible_updated_created_idx"
ON "erp"."leads" ("updated_at" DESC, "created_at" DESC)
WHERE "converted_student_id" IS NULL AND "stage" <> 'REGISTERED'::"erp"."LeadStage";

CREATE INDEX IF NOT EXISTS "lead_stage_history_lead_created_desc_idx"
ON "erp"."lead_stage_history" ("lead_id", "created_at" DESC);

-- Active manager list ordering.
CREATE INDEX IF NOT EXISTS "users_active_full_name_idx"
ON "erp"."users" ("full_name")
WHERE "is_active" = true;

-- Global student search with contains/ILIKE matching.
CREATE INDEX IF NOT EXISTS "students_code_trgm_idx"
ON "erp"."students" USING gin ("code" extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "contacts_full_name_trgm_idx"
ON "erp"."contacts" USING gin ("full_name" extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "contacts_phone_display_trgm_idx"
ON "erp"."contacts" USING gin ("phone_display" extensions.gin_trgm_ops)
WHERE "phone_display" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "contacts_phone_normalized_trgm_idx"
ON "erp"."contacts" USING gin ("phone_normalized" extensions.gin_trgm_ops)
WHERE "phone_normalized" IS NOT NULL;
