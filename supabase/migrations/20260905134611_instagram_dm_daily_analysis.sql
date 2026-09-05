CREATE TABLE "erp"."instagram_dm_daily_analyses" (
  "id" UUID NOT NULL,
  "period_from" DATE NOT NULL,
  "period_to" DATE NOT NULL,
  "snapshot_day" DATE NOT NULL,
  "status" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "analysis_version" TEXT NOT NULL,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMP(3),
  "data_cutoff_at" TIMESTAMP(3) NOT NULL,
  "result" JSONB,
  "metrics" JSONB NOT NULL,
  "classifications" JSONB,
  "error_code" TEXT,
  CONSTRAINT "instagram_dm_daily_analyses_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "instagram_dm_daily_analyses_period_check" CHECK ("period_from" <= "period_to"),
  CONSTRAINT "instagram_dm_daily_analyses_status_check" CHECK ("status" IN ('RUNNING', 'READY', 'FAILED', 'NO_DATA'))
);
CREATE UNIQUE INDEX "instagram_dm_daily_analyses_period_day_key"
ON "erp"."instagram_dm_daily_analyses" ("period_from", "period_to", "snapshot_day");
ALTER TABLE "erp"."instagram_dm_daily_analyses" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "erp"."instagram_dm_daily_analyses" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "erp"."instagram_dm_daily_analyses" TO service_role;
