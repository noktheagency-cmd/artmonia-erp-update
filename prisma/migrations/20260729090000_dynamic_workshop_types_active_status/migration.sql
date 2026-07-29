ALTER TYPE "erp"."WorkshopEventStatus"
ADD VALUE IF NOT EXISTS 'ACTIVE' AFTER 'SCHEDULED';

ALTER TABLE "erp"."workshop_events"
ADD COLUMN "category" VARCHAR(80);

ALTER TABLE "erp"."workshop_events"
ADD CONSTRAINT "workshop_events_category_nonempty"
CHECK ("category" IS NULL OR char_length(btrim("category")) BETWEEN 2 AND 80);

CREATE INDEX "workshop_events_category_idx"
ON "erp"."workshop_events"("category");
