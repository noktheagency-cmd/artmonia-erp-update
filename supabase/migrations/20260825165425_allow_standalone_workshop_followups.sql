ALTER TABLE "erp"."workshop_participant_follow_ups"
  ALTER COLUMN "participant_id" DROP NOT NULL,
  ADD COLUMN "full_name" TEXT,
  ADD COLUMN "phone" VARCHAR(40),
  ADD COLUMN "email" VARCHAR(180);

UPDATE "erp"."workshop_participant_follow_ups" wf
SET "full_name" = wp."full_name",
    "phone" = wp."phone",
    "email" = wp."email"
FROM "erp"."workshop_participants" wp
WHERE wp."id" = wf."participant_id";

ALTER TABLE "erp"."workshop_participant_follow_ups"
  ALTER COLUMN "full_name" SET NOT NULL;

CREATE INDEX "workshop_participant_follow_ups_contact_search_idx"
ON "erp"."workshop_participant_follow_ups"("full_name", "phone");

CREATE OR REPLACE FUNCTION "erp"."create_workshop_participant_follow_up"()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO "erp"."workshop_participant_follow_ups" (
    "participant_id", "target_event_id", "full_name", "phone", "email", "status", "next_action"
  )
  VALUES (
    NEW."id", NEW."event_id", NEW."full_name", NEW."phone", NEW."email", 'PENDING', 'CALL'
  )
  ON CONFLICT ("participant_id", "target_event_id") DO NOTHING;
  RETURN NEW;
END;
$$;
