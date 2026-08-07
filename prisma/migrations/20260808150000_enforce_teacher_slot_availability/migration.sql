-- Active slots belonging to archived groups must never reserve teacher time.
UPDATE "erp"."class_slots" AS slot
SET
  "is_active" = FALSE,
  "updated_at" = CURRENT_TIMESTAMP
FROM "erp"."groups" AS student_group
WHERE student_group."id" = slot."group_id"
  AND student_group."is_active" = FALSE
  AND slot."is_active" = TRUE;

-- GiST equality support lets PostgreSQL enforce the scheduling invariant even
-- when two application requests attempt to create overlapping slots at once.
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'class_slots_teacher_schedule_no_overlap'
      AND conrelid = 'erp.class_slots'::regclass
  ) THEN
    ALTER TABLE "erp"."class_slots"
    ADD CONSTRAINT "class_slots_teacher_schedule_no_overlap"
    EXCLUDE USING gist (
      "teacher_id" WITH =,
      "weekday" WITH =,
      daterange(
        "valid_from",
        COALESCE("valid_to", 'infinity'::date),
        '[]'
      ) WITH &&,
      int4range(
        split_part("start_time", ':', 1)::integer * 60
          + split_part("start_time", ':', 2)::integer,
        split_part("end_time", ':', 1)::integer * 60
          + split_part("end_time", ':', 2)::integer,
        '[)'
      ) WITH &&
    )
    WHERE ("is_active" = TRUE);
  END IF;
END $$;
