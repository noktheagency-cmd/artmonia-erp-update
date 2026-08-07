CREATE INDEX CONCURRENTLY IF NOT EXISTS "audit_logs_created_at_idx"
ON "erp"."audit_logs" ("created_at" DESC);
