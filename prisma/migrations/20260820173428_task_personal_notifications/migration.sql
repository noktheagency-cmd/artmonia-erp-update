CREATE TYPE "erp"."PersonalNotificationType" AS ENUM (
  'TASK_ASSIGNED', 'TASK_DUE_SOON', 'TASK_OVERDUE', 'DOCUMENT', 'SYSTEM'
);

CREATE TABLE "erp"."personal_notifications" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "recipient_user_id" UUID NOT NULL,
  "type" "erp"."PersonalNotificationType" NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "href" TEXT,
  "related_entity_type" TEXT,
  "related_entity_id" UUID,
  "task_id" UUID,
  "metadata" JSONB,
  "dedupe_key" TEXT NOT NULL,
  "read_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "personal_notifications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "personal_notifications_recipient_user_id_fkey"
    FOREIGN KEY ("recipient_user_id") REFERENCES "erp"."users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "personal_notifications_task_id_fkey"
    FOREIGN KEY ("task_id") REFERENCES "erp"."tasks"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "personal_notifications_dedupe_key_key"
  ON "erp"."personal_notifications"("dedupe_key");
CREATE INDEX "personal_notifications_recipient_user_id_read_at_created_at_idx"
  ON "erp"."personal_notifications"("recipient_user_id", "read_at", "created_at" DESC);
CREATE INDEX "personal_notifications_recipient_user_id_type_read_at_idx"
  ON "erp"."personal_notifications"("recipient_user_id", "type", "read_at");
CREATE INDEX "personal_notifications_task_id_created_at_idx"
  ON "erp"."personal_notifications"("task_id", "created_at");

ALTER TABLE "erp"."personal_notifications" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "erp"."personal_notifications" FROM anon, authenticated;

CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION "erp"."generate_task_deadline_notifications"(
  "p_now" TIMESTAMPTZ DEFAULT now()
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, erp
AS $$
DECLARE
  inserted_count INTEGER := 0;
  batch_count INTEGER := 0;
BEGIN
  INSERT INTO "erp"."personal_notifications" (
    "recipient_user_id", "type", "title", "message", "href",
    "related_entity_type", "related_entity_id", "task_id", "metadata", "dedupe_key"
  )
  SELECT
    task."owner_user_id",
    'TASK_DUE_SOON'::"erp"."PersonalNotificationType",
    'Task deadline-ı yaxınlaşır',
    task."title" || ' · Deadline: ' ||
      to_char(task."due_at" AT TIME ZONE 'Asia/Baku', 'DD.MM.YYYY HH24:MI') ||
      ' · Status: ' || task."status"::text,
    '/tasks?task=' || task."id"::text,
    'task', task."id", task."id",
    jsonb_build_object(
      'taskTitle', task."title", 'deadline', task."due_at",
      'status', task."status"::text, 'stage', 'due-soon'
    ),
    'task:' || task."id"::text || ':deadline:' ||
      to_char(task."due_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') || ':due-soon'
  FROM "erp"."tasks" task
  WHERE task."owner_user_id" IS NOT NULL
    AND task."due_at" > "p_now"
    AND task."due_at" <= "p_now" + INTERVAL '24 hours'
    AND task."status" IN ('OPEN'::"erp"."TaskStatus", 'IN_PROGRESS'::"erp"."TaskStatus")
  ON CONFLICT ("dedupe_key") DO NOTHING;

  GET DIAGNOSTICS batch_count = ROW_COUNT;
  inserted_count := inserted_count + batch_count;

  INSERT INTO "erp"."personal_notifications" (
    "recipient_user_id", "type", "title", "message", "href",
    "related_entity_type", "related_entity_id", "task_id", "metadata", "dedupe_key"
  )
  SELECT
    task."owner_user_id",
    'TASK_OVERDUE'::"erp"."PersonalNotificationType",
    'Task gecikib',
    task."title" || ' · Deadline: ' ||
      to_char(task."due_at" AT TIME ZONE 'Asia/Baku', 'DD.MM.YYYY HH24:MI') ||
      ' · Status: ' || task."status"::text,
    '/tasks?task=' || task."id"::text,
    'task', task."id", task."id",
    jsonb_build_object(
      'taskTitle', task."title", 'deadline', task."due_at",
      'status', task."status"::text, 'stage', 'overdue'
    ),
    'task:' || task."id"::text || ':deadline:' ||
      to_char(task."due_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') || ':overdue'
  FROM "erp"."tasks" task
  WHERE task."owner_user_id" IS NOT NULL
    AND task."due_at" <= "p_now"
    AND task."status" IN ('OPEN'::"erp"."TaskStatus", 'IN_PROGRESS'::"erp"."TaskStatus")
  ON CONFLICT ("dedupe_key") DO NOTHING;

  GET DIAGNOSTICS batch_count = ROW_COUNT;
  RETURN inserted_count + batch_count;
END;
$$;

REVOKE ALL ON FUNCTION "erp"."generate_task_deadline_notifications"(TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      EXECUTE 'select cron.schedule(''artmonia-task-deadline-notifications'', ''*/5 * * * *'', ''select erp.generate_task_deadline_notifications()'')';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Task deadline cron job was not scheduled: %', SQLERRM;
    END;
  END IF;
END
$$;

WITH operation_head_roles AS (
  SELECT "id"
  FROM "erp"."roles"
  WHERE lower(trim("name")) = 'operation head'
     OR "key" LIKE 'custom.operation-head.%'
), resolved_grants AS (
  SELECT role."id" AS role_id, permission."id" AS permission_id
  FROM operation_head_roles role
  CROSS JOIN "erp"."permissions" permission
  WHERE permission."code" IN ('task.read', 'task.manage')
)
INSERT INTO "erp"."role_permissions" ("role_id", "permission_id", "scope")
SELECT role_id, permission_id, 'ALL'::"erp"."PermissionScope"
FROM resolved_grants
ON CONFLICT ("role_id", "permission_id")
DO UPDATE SET "scope" = EXCLUDED."scope";
