-- Percentage payroll reads invoices by month and assigns each attended lesson
-- to the teacher snapshot stored on the journal record.
CREATE INDEX IF NOT EXISTS "invoices_period_enrollment_idx"
ON "erp"."invoices" ("period_month", "enrollment_id");
