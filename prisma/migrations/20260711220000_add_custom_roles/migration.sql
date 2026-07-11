ALTER TABLE "erp"."roles"
  ADD COLUMN "key" TEXT,
  ADD COLUMN "description" TEXT,
  ADD COLUMN "is_system" BOOLEAN NOT NULL DEFAULT false;

UPDATE "erp"."roles"
SET "key" = lower("code"::text), "is_system" = true
WHERE "code" IS NOT NULL;

ALTER TABLE "erp"."roles"
  ALTER COLUMN "key" SET NOT NULL,
  ALTER COLUMN "code" DROP NOT NULL;

CREATE UNIQUE INDEX "roles_key_key" ON "erp"."roles"("key");
