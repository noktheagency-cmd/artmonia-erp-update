CREATE TYPE "erp"."WorkshopFollowUpAction" AS ENUM ('NONE', 'CALL', 'WHATSAPP', 'SEND_DETAILS', 'SEND_OFFER', 'RESERVE_PLACE', 'WAIT_RESPONSE', 'OTHER');
CREATE TYPE "erp"."WorkshopFollowUpOutcome" AS ENUM ('NONE', 'POSITIVE_RESPONSE', 'NO_RESPONSE', 'CALLBACK_REQUESTED', 'DECLINED', 'REGISTERED');
CREATE TYPE "erp"."WorkshopContactChannel" AS ENUM ('NOT_SET', 'PHONE', 'WHATSAPP', 'SMS', 'EMAIL', 'OTHER');
CREATE TYPE "erp"."WorkshopFollowUpPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

ALTER TABLE "erp"."workshop_participant_follow_ups"
  ADD COLUMN "target_event_id" UUID,
  ADD COLUMN "next_action" "erp"."WorkshopFollowUpAction" NOT NULL DEFAULT 'CALL',
  ADD COLUMN "outcome" "erp"."WorkshopFollowUpOutcome" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "contact_channel" "erp"."WorkshopContactChannel" NOT NULL DEFAULT 'NOT_SET',
  ADD COLUMN "priority" "erp"."WorkshopFollowUpPriority" NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN "completed_at" TIMESTAMP(3);

UPDATE "erp"."workshop_participant_follow_ups" wf
SET "target_event_id" = wp."event_id",
    "outcome" = CASE wf."status"
      WHEN 'NO_ANSWER'::"erp"."WorkshopFollowUpStatus" THEN 'NO_RESPONSE'::"erp"."WorkshopFollowUpOutcome"
      WHEN 'CONVERTED'::"erp"."WorkshopFollowUpStatus" THEN 'REGISTERED'::"erp"."WorkshopFollowUpOutcome"
      WHEN 'NOT_INTERESTED'::"erp"."WorkshopFollowUpStatus" THEN 'DECLINED'::"erp"."WorkshopFollowUpOutcome"
      ELSE 'NONE'::"erp"."WorkshopFollowUpOutcome" END,
    "next_action" = CASE WHEN wf."status" IN ('CONVERTED'::"erp"."WorkshopFollowUpStatus", 'NOT_INTERESTED'::"erp"."WorkshopFollowUpStatus")
      THEN 'NONE'::"erp"."WorkshopFollowUpAction" ELSE 'CALL'::"erp"."WorkshopFollowUpAction" END,
    "completed_at" = CASE WHEN wf."status" IN ('CONVERTED'::"erp"."WorkshopFollowUpStatus", 'NOT_INTERESTED'::"erp"."WorkshopFollowUpStatus")
      THEN wf."updated_at" ELSE NULL END
FROM "erp"."workshop_participants" wp
WHERE wp."id" = wf."participant_id";

ALTER TABLE "erp"."workshop_participant_follow_ups" ALTER COLUMN "target_event_id" SET NOT NULL;
DROP INDEX "erp"."workshop_participant_follow_ups_participant_id_key";
CREATE UNIQUE INDEX "workshop_participant_follow_ups_participant_target_key" ON "erp"."workshop_participant_follow_ups"("participant_id", "target_event_id");
CREATE INDEX "workshop_participant_follow_ups_target_event_status_idx" ON "erp"."workshop_participant_follow_ups"("target_event_id", "status");
CREATE INDEX "workshop_participant_follow_ups_priority_next_idx" ON "erp"."workshop_participant_follow_ups"("priority", "next_follow_up_at");

ALTER TABLE "erp"."workshop_participant_follow_ups"
ADD CONSTRAINT "workshop_participant_follow_ups_target_event_id_fkey"
FOREIGN KEY ("target_event_id") REFERENCES "erp"."workshop_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "erp"."workshop_follow_up_activities" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "follow_up_id" UUID NOT NULL,
  "activity_type" VARCHAR(40) NOT NULL,
  "status" "erp"."WorkshopFollowUpStatus" NOT NULL,
  "next_action" "erp"."WorkshopFollowUpAction" NOT NULL,
  "outcome" "erp"."WorkshopFollowUpOutcome" NOT NULL,
  "contact_channel" "erp"."WorkshopContactChannel" NOT NULL,
  "next_follow_up_at" TIMESTAMP(3),
  "note" TEXT,
  "actor_user_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workshop_follow_up_activities_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "workshop_follow_up_activities_follow_up_created_idx" ON "erp"."workshop_follow_up_activities"("follow_up_id", "created_at" DESC);
ALTER TABLE "erp"."workshop_follow_up_activities" ADD CONSTRAINT "workshop_follow_up_activities_follow_up_id_fkey" FOREIGN KEY ("follow_up_id") REFERENCES "erp"."workshop_participant_follow_ups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "erp"."workshop_follow_up_activities" ADD CONSTRAINT "workshop_follow_up_activities_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "erp"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "erp"."workshop_follow_up_activities" ("follow_up_id", "activity_type", "status", "next_action", "outcome", "contact_channel", "next_follow_up_at", "note", "actor_user_id", "created_at")
SELECT wf."id", 'MIGRATED', wf."status", wf."next_action", wf."outcome", wf."contact_channel", wf."next_follow_up_at", wf."note", wf."updated_by_id", wf."updated_at"
FROM "erp"."workshop_participant_follow_ups" wf;

CREATE OR REPLACE FUNCTION "erp"."create_workshop_participant_follow_up"()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  INSERT INTO "erp"."workshop_participant_follow_ups" ("participant_id", "target_event_id", "status", "next_action")
  VALUES (NEW."id", NEW."event_id", 'PENDING', 'CALL')
  ON CONFLICT ("participant_id", "target_event_id") DO NOTHING;
  RETURN NEW;
END;
$$;

ALTER TABLE "erp"."workshop_follow_up_activities" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "erp"."workshop_follow_up_activities" FROM anon, authenticated;
