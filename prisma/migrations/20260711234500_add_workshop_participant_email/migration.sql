ALTER TABLE "erp"."workshop_participants"
ADD COLUMN IF NOT EXISTS "email" TEXT;

CREATE INDEX IF NOT EXISTS "workshop_participants_email_idx"
ON "erp"."workshop_participants" ("email");
