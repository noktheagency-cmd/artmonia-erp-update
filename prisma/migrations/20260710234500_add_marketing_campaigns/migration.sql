CREATE TYPE "erp"."MarketingCampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED');

CREATE TABLE "erp"."marketing_campaigns" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "owner" TEXT,
    "objective" TEXT,
    "notes" TEXT,
    "status" "erp"."MarketingCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "budget" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "starts_at" DATE NOT NULL,
    "ends_at" DATE,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketing_campaigns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "erp"."marketing_campaign_stats" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "recorded_on" DATE NOT NULL,
    "spend" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "revenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "leads" INTEGER NOT NULL DEFAULT 0,
    "conversions" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketing_campaign_stats_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "marketing_campaign_stats_campaign_id_recorded_on_key"
ON "erp"."marketing_campaign_stats"("campaign_id", "recorded_on");
CREATE INDEX "marketing_campaigns_status_starts_at_idx"
ON "erp"."marketing_campaigns"("status", "starts_at");
CREATE INDEX "marketing_campaigns_channel_starts_at_idx"
ON "erp"."marketing_campaigns"("channel", "starts_at");
CREATE INDEX "marketing_campaign_stats_recorded_on_idx"
ON "erp"."marketing_campaign_stats"("recorded_on");

ALTER TABLE "erp"."marketing_campaigns"
ADD CONSTRAINT "marketing_campaigns_created_by_id_fkey"
FOREIGN KEY ("created_by_id") REFERENCES "erp"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "erp"."marketing_campaign_stats"
ADD CONSTRAINT "marketing_campaign_stats_campaign_id_fkey"
FOREIGN KEY ("campaign_id") REFERENCES "erp"."marketing_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "erp"."permissions" ("id", "code", "description")
VALUES
  (gen_random_uuid(), 'marketing.read', 'Marketing kampaniyalarını və performansını görmək'),
  (gen_random_uuid(), 'marketing.manage', 'Marketing kampaniyalarını idarə etmək')
ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description";

INSERT INTO "erp"."role_permissions" ("role_id", "permission_id")
SELECT role."id", permission."id"
FROM "erp"."roles" role
JOIN "erp"."permissions" permission ON permission."code" IN ('marketing.read', 'marketing.manage')
WHERE role."code" IN ('SUPER_ADMIN'::"erp"."AppRole", 'OWNER'::"erp"."AppRole", 'ADMIN'::"erp"."AppRole", 'SALES'::"erp"."AppRole")
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

INSERT INTO "erp"."role_permissions" ("role_id", "permission_id")
SELECT role."id", permission."id"
FROM "erp"."roles" role
JOIN "erp"."permissions" permission ON permission."code" = 'marketing.read'
WHERE role."code" IN ('FINANCE'::"erp"."AppRole", 'AUDITOR'::"erp"."AppRole")
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
