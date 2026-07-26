ALTER TABLE "erp"."marketing_campaigns"
  ADD COLUMN "meta_ad_account_id" TEXT,
  ADD COLUMN "meta_campaign_id" TEXT,
  ADD COLUMN "meta_synced_at" TIMESTAMP(3);

ALTER TABLE "erp"."marketing_campaign_stats"
  ADD COLUMN "impressions" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "reach" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "clicks" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "conversations" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "cost_per_conversation" DECIMAL(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN "cpc" DECIMAL(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN "cpm" DECIMAL(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN "ctr" DECIMAL(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN "frequency" DECIMAL(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'AZN',
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "synced_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "marketing_campaigns_meta_ad_account_id_meta_campaign_id_key"
  ON "erp"."marketing_campaigns"("meta_ad_account_id", "meta_campaign_id");

ALTER TABLE "erp"."marketing_campaign_stats"
  ADD CONSTRAINT "marketing_campaign_stats_non_negative_check"
  CHECK (
    "spend" >= 0 AND "impressions" >= 0 AND "reach" >= 0 AND
    "clicks" >= 0 AND "conversations" >= 0 AND
    "cost_per_conversation" >= 0 AND "cpc" >= 0 AND "cpm" >= 0 AND
    "ctr" >= 0 AND "frequency" >= 0
  );
