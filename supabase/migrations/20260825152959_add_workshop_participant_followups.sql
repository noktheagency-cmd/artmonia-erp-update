CREATE TYPE "erp"."WorkshopFollowUpStatus" AS ENUM (
  'PENDING',
  'CONTACTED',
  'NO_ANSWER',
  'INTERESTED',
  'CONVERTED',
  'NOT_INTERESTED'
);

CREATE TABLE "erp"."workshop_participant_follow_ups" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "participant_id" UUID NOT NULL,
  "status" "erp"."WorkshopFollowUpStatus" NOT NULL DEFAULT 'PENDING',
  "next_follow_up_at" TIMESTAMP(3),
  "last_contacted_at" TIMESTAMP(3),
  "note" TEXT,
  "assigned_to_id" UUID,
  "created_by_id" UUID,
  "updated_by_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "workshop_participant_follow_ups_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workshop_participant_follow_ups_participant_id_key"
ON "erp"."workshop_participant_follow_ups"("participant_id");

CREATE INDEX "workshop_participant_follow_ups_status_next_follow_up_at_idx"
ON "erp"."workshop_participant_follow_ups"("status", "next_follow_up_at");

CREATE INDEX "workshop_participant_follow_ups_assigned_to_id_status_idx"
ON "erp"."workshop_participant_follow_ups"("assigned_to_id", "status");

ALTER TABLE "erp"."workshop_participant_follow_ups"
ADD CONSTRAINT "workshop_participant_follow_ups_participant_id_fkey"
FOREIGN KEY ("participant_id") REFERENCES "erp"."workshop_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "erp"."workshop_participant_follow_ups"
ADD CONSTRAINT "workshop_participant_follow_ups_assigned_to_id_fkey"
FOREIGN KEY ("assigned_to_id") REFERENCES "erp"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "erp"."workshop_participant_follow_ups"
ADD CONSTRAINT "workshop_participant_follow_ups_created_by_id_fkey"
FOREIGN KEY ("created_by_id") REFERENCES "erp"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "erp"."workshop_participant_follow_ups"
ADD CONSTRAINT "workshop_participant_follow_ups_updated_by_id_fkey"
FOREIGN KEY ("updated_by_id") REFERENCES "erp"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "erp"."workshop_participant_follow_ups" ("participant_id")
SELECT wp."id"
FROM "erp"."workshop_participants" wp
WHERE wp."cancelled_at" IS NULL
ON CONFLICT ("participant_id") DO NOTHING;

CREATE FUNCTION "erp"."create_workshop_participant_follow_up"()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO "erp"."workshop_participant_follow_ups" ("participant_id")
  VALUES (NEW."id")
  ON CONFLICT ("participant_id") DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "workshop_participant_create_follow_up"
AFTER INSERT ON "erp"."workshop_participants"
FOR EACH ROW
EXECUTE FUNCTION "erp"."create_workshop_participant_follow_up"();

ALTER TABLE "erp"."workshop_participant_follow_ups" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "erp"."workshop_participant_follow_ups" FROM anon, authenticated;
REVOKE ALL ON FUNCTION "erp"."create_workshop_participant_follow_up"() FROM PUBLIC, anon, authenticated;
