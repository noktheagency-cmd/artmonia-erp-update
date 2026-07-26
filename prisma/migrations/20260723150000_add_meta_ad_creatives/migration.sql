CREATE TABLE "erp"."marketing_ad_sets" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "campaign_id" UUID NOT NULL,
  "meta_ad_set_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "optimization_goal" TEXT,
  "starts_at" TIMESTAMP(3),
  "ends_at" TIMESTAMP(3),
  "meta_synced_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marketing_ad_sets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "erp"."marketing_ads" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "campaign_id" UUID NOT NULL,
  "ad_set_id" UUID NOT NULL,
  "meta_ad_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "meta_creative_id" TEXT,
  "creative_name" TEXT,
  "creative_title" TEXT,
  "creative_body" TEXT,
  "call_to_action_type" TEXT,
  "thumbnail_url" TEXT,
  "instagram_permalink_url" TEXT,
  "effective_object_story_id" TEXT,
  "meta_synced_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marketing_ads_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "erp"."marketing_ad_stats" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "ad_id" UUID NOT NULL,
  "recorded_on" DATE NOT NULL,
  "spend" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "impressions" INTEGER NOT NULL DEFAULT 0,
  "reach" INTEGER NOT NULL DEFAULT 0,
  "clicks" INTEGER NOT NULL DEFAULT 0,
  "conversations" INTEGER NOT NULL DEFAULT 0,
  "cost_per_conversation" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "cpc" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "cpm" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "ctr" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "frequency" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'AZN',
  "synced_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marketing_ad_stats_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "marketing_ad_sets_meta_ad_set_id_key" ON "erp"."marketing_ad_sets"("meta_ad_set_id");
CREATE INDEX "marketing_ad_sets_campaign_id_status_idx" ON "erp"."marketing_ad_sets"("campaign_id", "status");
CREATE UNIQUE INDEX "marketing_ads_meta_ad_id_key" ON "erp"."marketing_ads"("meta_ad_id");
CREATE INDEX "marketing_ads_campaign_id_status_idx" ON "erp"."marketing_ads"("campaign_id", "status");
CREATE INDEX "marketing_ads_ad_set_id_status_idx" ON "erp"."marketing_ads"("ad_set_id", "status");
CREATE UNIQUE INDEX "marketing_ad_stats_ad_id_recorded_on_key" ON "erp"."marketing_ad_stats"("ad_id", "recorded_on");
CREATE INDEX "marketing_ad_stats_recorded_on_idx" ON "erp"."marketing_ad_stats"("recorded_on");

ALTER TABLE "erp"."marketing_ad_sets"
  ADD CONSTRAINT "marketing_ad_sets_campaign_id_fkey"
  FOREIGN KEY ("campaign_id") REFERENCES "erp"."marketing_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "erp"."marketing_ads"
  ADD CONSTRAINT "marketing_ads_campaign_id_fkey"
  FOREIGN KEY ("campaign_id") REFERENCES "erp"."marketing_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "erp"."marketing_ads"
  ADD CONSTRAINT "marketing_ads_ad_set_id_fkey"
  FOREIGN KEY ("ad_set_id") REFERENCES "erp"."marketing_ad_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "erp"."marketing_ad_stats"
  ADD CONSTRAINT "marketing_ad_stats_ad_id_fkey"
  FOREIGN KEY ("ad_id") REFERENCES "erp"."marketing_ads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "erp"."marketing_ad_stats"
  ADD CONSTRAINT "marketing_ad_stats_non_negative_check"
  CHECK (
    "spend" >= 0 AND "impressions" >= 0 AND "reach" >= 0 AND
    "clicks" >= 0 AND "conversations" >= 0 AND
    "cost_per_conversation" >= 0 AND "cpc" >= 0 AND "cpm" >= 0 AND
    "ctr" >= 0 AND "frequency" >= 0
  );
