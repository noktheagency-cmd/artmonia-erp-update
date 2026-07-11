CREATE TYPE "erp"."MarketingReportOutcome" AS ENUM ('SUCCESSFUL', 'UNSUCCESSFUL');

ALTER TABLE "erp"."leads" ADD COLUMN "campaign_id" UUID;
ALTER TABLE "erp"."students" ADD COLUMN "campaign_id" UUID;

CREATE INDEX "leads_campaign_id_created_at_idx" ON "erp"."leads"("campaign_id", "created_at");
CREATE INDEX "students_campaign_id_registered_at_idx" ON "erp"."students"("campaign_id", "registered_at");

ALTER TABLE "erp"."leads"
  ADD CONSTRAINT "leads_campaign_id_fkey"
  FOREIGN KEY ("campaign_id") REFERENCES "erp"."marketing_campaigns"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "erp"."students"
  ADD CONSTRAINT "students_campaign_id_fkey"
  FOREIGN KEY ("campaign_id") REFERENCES "erp"."marketing_campaigns"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "erp"."marketing_campaign_reports" (
  "id" UUID NOT NULL,
  "campaign_id" UUID NOT NULL,
  "outcome" "erp"."MarketingReportOutcome" NOT NULL,
  "notes" TEXT,
  "created_by_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marketing_campaign_reports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "marketing_campaign_reports_campaign_id_created_at_idx"
  ON "erp"."marketing_campaign_reports"("campaign_id", "created_at");
ALTER TABLE "erp"."marketing_campaign_reports"
  ADD CONSTRAINT "marketing_campaign_reports_campaign_id_fkey"
  FOREIGN KEY ("campaign_id") REFERENCES "erp"."marketing_campaigns"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "erp"."marketing_campaign_reports"
  ADD CONSTRAINT "marketing_campaign_reports_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "erp"."users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
