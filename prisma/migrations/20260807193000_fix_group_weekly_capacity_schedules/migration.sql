-- Restore the three missing/misclassified sessions in the generated weekly
-- capacity plan. Updating the Sunday row preserves its identity and any
-- references while moving it to the intended Friday slot.
UPDATE "erp"."group_schedules" schedule
SET
  "weekday" = 'FRIDAY',
  "updated_at" = CURRENT_TIMESTAMP
FROM "erp"."groups" student_group
WHERE schedule."group_id" = student_group."id"
  AND student_group."code" = 'HƏFTƏ-İÇİ-SƏHƏR-2.20'
  AND schedule."weekday" = 'SUNDAY'
  AND NOT EXISTS (
    SELECT 1
    FROM "erp"."group_schedules" friday_schedule
    WHERE friday_schedule."group_id" = student_group."id"
      AND friday_schedule."weekday" = 'FRIDAY'
  );

INSERT INTO "erp"."group_schedules" (
  "id",
  "group_id",
  "weekday",
  "start_time",
  "end_time",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid(),
  student_group."id",
  missing_schedule."weekday",
  schedule_time."start_time",
  schedule_time."end_time",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "erp"."groups" student_group
JOIN (
  VALUES
    ('HƏFTƏ-İÇİ-GÜNORTA-1.10', 'FRIDAY'::"erp"."GroupWeekday"),
    ('HƏFTƏ-İÇİ-GÜNORTA-2', 'MONDAY'::"erp"."GroupWeekday")
) AS missing_schedule("code", "weekday")
  ON missing_schedule."code" = student_group."code"
CROSS JOIN LATERAL (
  SELECT schedule."start_time", schedule."end_time"
  FROM "erp"."group_schedules" schedule
  WHERE schedule."group_id" = student_group."id"
  GROUP BY schedule."start_time", schedule."end_time"
  ORDER BY count(*) DESC, schedule."start_time", schedule."end_time"
  LIMIT 1
) schedule_time
WHERE NOT EXISTS (
  SELECT 1
  FROM "erp"."group_schedules" existing_schedule
  WHERE existing_schedule."group_id" = student_group."id"
    AND existing_schedule."weekday" = missing_schedule."weekday"
)
ON CONFLICT ("group_id", "weekday") DO NOTHING;
