DO $$
BEGIN
  CREATE TYPE "erp"."MarketingContentStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'REVISION_REQUIRED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "erp"."MarketingContentAction" AS ENUM ('CREATED', 'UPDATED', 'SUBMITTED', 'APPROVED', 'REVISION_REQUESTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "erp"."marketing_content_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "title" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "format" TEXT NOT NULL,
  "scheduled_at" TIMESTAMPTZ NOT NULL,
  "responsible_user_id" UUID,
  "campaign_id" UUID,
  "caption" TEXT,
  "notes" TEXT,
  "media_url" TEXT,
  "status" "erp"."MarketingContentStatus" NOT NULL DEFAULT 'DRAFT',
  "created_by_id" UUID,
  "submitted_at" TIMESTAMPTZ,
  "approved_by_id" UUID,
  "approved_at" TIMESTAMPTZ,
  "revision_note" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marketing_content_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "marketing_content_items_responsible_user_id_fkey" FOREIGN KEY ("responsible_user_id") REFERENCES "erp"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "marketing_content_items_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "erp"."marketing_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "marketing_content_items_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "erp"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "marketing_content_items_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "erp"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "erp"."marketing_content_activities" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "content_id" UUID NOT NULL,
  "action" "erp"."MarketingContentAction" NOT NULL,
  "actor_user_id" UUID,
  "note" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marketing_content_activities_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "marketing_content_activities_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "erp"."marketing_content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "marketing_content_activities_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "erp"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "marketing_content_items_scheduled_at_idx" ON "erp"."marketing_content_items"("scheduled_at");
CREATE INDEX IF NOT EXISTS "marketing_content_items_status_scheduled_at_idx" ON "erp"."marketing_content_items"("status", "scheduled_at");
CREATE INDEX IF NOT EXISTS "marketing_content_items_responsible_user_id_scheduled_at_idx" ON "erp"."marketing_content_items"("responsible_user_id", "scheduled_at");
CREATE INDEX IF NOT EXISTS "marketing_content_items_campaign_id_idx" ON "erp"."marketing_content_items"("campaign_id");
CREATE INDEX IF NOT EXISTS "marketing_content_activities_content_id_created_at_idx" ON "erp"."marketing_content_activities"("content_id", "created_at");
CREATE INDEX IF NOT EXISTS "marketing_content_activities_actor_user_id_created_at_idx" ON "erp"."marketing_content_activities"("actor_user_id", "created_at");

REVOKE ALL ON TABLE "erp"."marketing_content_items" FROM anon, authenticated;
REVOKE ALL ON TABLE "erp"."marketing_content_activities" FROM anon, authenticated;

INSERT INTO "erp"."permissions" ("id", "code", "description")
VALUES (gen_random_uuid(), 'marketing.content.approve', 'CEO təsdiqi gözləyən content-i aktiv etmək və ya düzəlişə qaytarmaq')
ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description";

INSERT INTO "erp"."role_permissions" ("role_id", "permission_id", "scope")
SELECT r."id", p."id", 'ALL'::"erp"."PermissionScope"
FROM "erp"."roles" r
JOIN "erp"."permissions" p ON p."code" = 'marketing.content.approve'
WHERE r."code" IN ('SUPER_ADMIN', 'OWNER')
ON CONFLICT ("role_id", "permission_id") DO UPDATE SET "scope" = EXCLUDED."scope";
