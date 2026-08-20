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
    task."title" || ' · Deadline: ' || to_char(task."due_at", 'DD.MM.YYYY') ||
      ' · Status: ' || task."status"::text,
    '/tasks?task=' || task."id"::text,
    'task', task."id", task."id",
    jsonb_build_object(
      'taskTitle', task."title",
      'deadline', to_char(task."due_at", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'status', task."status"::text,
      'stage', 'due-soon'
    ),
    'task:' || task."id"::text || ':deadline:' ||
      to_char(task."due_at", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') || ':due-soon'
  FROM "erp"."tasks" task
  WHERE task."owner_user_id" IS NOT NULL
    AND task."due_at" > ("p_now" AT TIME ZONE 'UTC')
    AND task."due_at" <= (("p_now" + INTERVAL '24 hours') AT TIME ZONE 'UTC')
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
    task."title" || ' · Deadline: ' || to_char(task."due_at", 'DD.MM.YYYY') ||
      ' · Status: ' || task."status"::text,
    '/tasks?task=' || task."id"::text,
    'task', task."id", task."id",
    jsonb_build_object(
      'taskTitle', task."title",
      'deadline', to_char(task."due_at", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'status', task."status"::text,
      'stage', 'overdue'
    ),
    'task:' || task."id"::text || ':deadline:' ||
      to_char(task."due_at", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') || ':overdue'
  FROM "erp"."tasks" task
  WHERE task."owner_user_id" IS NOT NULL
    AND task."due_at" <= ("p_now" AT TIME ZONE 'UTC')
    AND task."status" IN ('OPEN'::"erp"."TaskStatus", 'IN_PROGRESS'::"erp"."TaskStatus")
  ON CONFLICT ("dedupe_key") DO NOTHING;

  GET DIAGNOSTICS batch_count = ROW_COUNT;
  RETURN inserted_count + batch_count;
END;
$$;

REVOKE ALL ON FUNCTION "erp"."generate_task_deadline_notifications"(TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;

UPDATE "erp"."personal_notifications" notification
SET
  "message" = task."title" || ' · Deadline: ' || to_char(task."due_at", 'DD.MM.YYYY') ||
    ' · Status: ' || task."status"::text,
  "metadata" = jsonb_set(
    coalesce(notification."metadata", '{}'::jsonb),
    '{deadline}',
    to_jsonb(to_char(task."due_at", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
    true
  ),
  "updated_at" = now()
FROM "erp"."tasks" task
WHERE notification."task_id" = task."id"
  AND notification."type" IN (
    'TASK_DUE_SOON'::"erp"."PersonalNotificationType",
    'TASK_OVERDUE'::"erp"."PersonalNotificationType"
  );
