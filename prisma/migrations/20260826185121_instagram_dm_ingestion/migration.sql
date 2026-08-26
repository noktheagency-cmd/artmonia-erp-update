CREATE TYPE "erp"."InstagramDmDirection" AS ENUM ('INBOUND', 'OUTBOUND');
CREATE TYPE "erp"."InstagramDmMessageKind" AS ENUM ('TEXT', 'MEDIA', 'QUICK_REPLY', 'POSTBACK', 'UNSUPPORTED');
CREATE TYPE "erp"."InstagramDmProcessingStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED');
CREATE TYPE "erp"."InstagramDmAnalysisStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

CREATE TABLE "erp"."instagram_dm_accounts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "meta_account_id" TEXT NOT NULL,
  "username" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_webhook_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "instagram_dm_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "erp"."instagram_dm_participants" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "account_id" UUID NOT NULL,
  "scoped_user_id" TEXT NOT NULL,
  "username" TEXT,
  "display_name" TEXT,
  "first_seen_at" TIMESTAMP(3) NOT NULL,
  "last_seen_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "instagram_dm_participants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "erp"."instagram_dm_conversations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "account_id" UUID NOT NULL,
  "participant_id" UUID NOT NULL,
  "first_message_at" TIMESTAMP(3) NOT NULL,
  "last_message_at" TIMESTAMP(3) NOT NULL,
  "last_inbound_at" TIMESTAMP(3),
  "last_outbound_at" TIMESTAMP(3),
  "message_count" INTEGER NOT NULL DEFAULT 0,
  "inbound_count" INTEGER NOT NULL DEFAULT 0,
  "outbound_count" INTEGER NOT NULL DEFAULT 0,
  "analysis_status" "erp"."InstagramDmAnalysisStatus" NOT NULL DEFAULT 'PENDING',
  "analysis_dirty_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "instagram_dm_conversations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "instagram_dm_conversations_nonnegative_counts"
    CHECK ("message_count" >= 0 AND "inbound_count" >= 0 AND "outbound_count" >= 0)
);

CREATE TABLE "erp"."instagram_dm_webhook_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "payload_hash" VARCHAR(64) NOT NULL,
  "object_type" VARCHAR(40) NOT NULL,
  "entry_count" INTEGER NOT NULL DEFAULT 0,
  "payload" JSONB NOT NULL,
  "status" "erp"."InstagramDmProcessingStatus" NOT NULL DEFAULT 'RECEIVED',
  "error_message" VARCHAR(800),
  "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMP(3),
  CONSTRAINT "instagram_dm_webhook_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "instagram_dm_webhook_events_entry_count_nonnegative" CHECK ("entry_count" >= 0)
);

CREATE TABLE "erp"."instagram_dm_messages" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "conversation_id" UUID NOT NULL,
  "webhook_event_id" UUID,
  "meta_message_id" TEXT NOT NULL,
  "direction" "erp"."InstagramDmDirection" NOT NULL,
  "kind" "erp"."InstagramDmMessageKind" NOT NULL,
  "text" TEXT,
  "sent_at" TIMESTAMP(3) NOT NULL,
  "is_echo" BOOLEAN NOT NULL DEFAULT false,
  "is_self" BOOLEAN NOT NULL DEFAULT false,
  "is_deleted" BOOLEAN NOT NULL DEFAULT false,
  "is_unsupported" BOOLEAN NOT NULL DEFAULT false,
  "reply_to_meta_message_id" TEXT,
  "quick_reply_payload" TEXT,
  "edit_count" INTEGER NOT NULL DEFAULT 0,
  "attachments" JSONB,
  "referral" JSONB,
  "raw_metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "instagram_dm_messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "instagram_dm_messages_edit_count_nonnegative" CHECK ("edit_count" >= 0)
);

CREATE UNIQUE INDEX "instagram_dm_accounts_meta_account_id_key"
  ON "erp"."instagram_dm_accounts"("meta_account_id");
CREATE INDEX "instagram_dm_accounts_is_active_last_webhook_at_idx"
  ON "erp"."instagram_dm_accounts"("is_active", "last_webhook_at");

CREATE UNIQUE INDEX "instagram_dm_participants_account_id_scoped_user_id_key"
  ON "erp"."instagram_dm_participants"("account_id", "scoped_user_id");
CREATE INDEX "instagram_dm_participants_account_id_last_seen_at_idx"
  ON "erp"."instagram_dm_participants"("account_id", "last_seen_at");

CREATE UNIQUE INDEX "instagram_dm_conversations_account_id_participant_id_key"
  ON "erp"."instagram_dm_conversations"("account_id", "participant_id");
CREATE INDEX "instagram_dm_conversations_account_id_last_message_at_idx"
  ON "erp"."instagram_dm_conversations"("account_id", "last_message_at");
CREATE INDEX "instagram_dm_conversations_analysis_status_analysis_dirty_at_idx"
  ON "erp"."instagram_dm_conversations"("analysis_status", "analysis_dirty_at");
CREATE INDEX "instagram_dm_conversations_participant_id_idx"
  ON "erp"."instagram_dm_conversations"("participant_id");

CREATE UNIQUE INDEX "instagram_dm_webhook_events_payload_hash_key"
  ON "erp"."instagram_dm_webhook_events"("payload_hash");
CREATE INDEX "instagram_dm_webhook_events_status_received_at_idx"
  ON "erp"."instagram_dm_webhook_events"("status", "received_at");

CREATE UNIQUE INDEX "instagram_dm_messages_meta_message_id_key"
  ON "erp"."instagram_dm_messages"("meta_message_id");
CREATE INDEX "instagram_dm_messages_conversation_id_sent_at_idx"
  ON "erp"."instagram_dm_messages"("conversation_id", "sent_at");
CREATE INDEX "instagram_dm_messages_direction_sent_at_idx"
  ON "erp"."instagram_dm_messages"("direction", "sent_at");
CREATE INDEX "instagram_dm_messages_webhook_event_id_idx"
  ON "erp"."instagram_dm_messages"("webhook_event_id");

ALTER TABLE "erp"."instagram_dm_participants"
  ADD CONSTRAINT "instagram_dm_participants_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "erp"."instagram_dm_accounts"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "erp"."instagram_dm_conversations"
  ADD CONSTRAINT "instagram_dm_conversations_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "erp"."instagram_dm_accounts"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "erp"."instagram_dm_conversations"
  ADD CONSTRAINT "instagram_dm_conversations_participant_id_fkey"
  FOREIGN KEY ("participant_id") REFERENCES "erp"."instagram_dm_participants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "erp"."instagram_dm_messages"
  ADD CONSTRAINT "instagram_dm_messages_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "erp"."instagram_dm_conversations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "erp"."instagram_dm_messages"
  ADD CONSTRAINT "instagram_dm_messages_webhook_event_id_fkey"
  FOREIGN KEY ("webhook_event_id") REFERENCES "erp"."instagram_dm_webhook_events"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "erp"."instagram_dm_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "erp"."instagram_dm_participants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "erp"."instagram_dm_conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "erp"."instagram_dm_webhook_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "erp"."instagram_dm_messages" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  "erp"."instagram_dm_accounts",
  "erp"."instagram_dm_participants",
  "erp"."instagram_dm_conversations",
  "erp"."instagram_dm_webhook_events",
  "erp"."instagram_dm_messages"
FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  "erp"."instagram_dm_accounts",
  "erp"."instagram_dm_participants",
  "erp"."instagram_dm_conversations",
  "erp"."instagram_dm_webhook_events",
  "erp"."instagram_dm_messages"
TO service_role;

