-- Group containers and soft-deleted slot versions are intentionally removed.
-- A class slot now exists only while it is usable; deleting it is a hard delete.

SET lock_timeout = '5s';
SET statement_timeout = '60s';

ALTER TYPE "erp"."StudentLifecycleStatus"
RENAME VALUE 'GROUP_WAITING' TO 'SLOT_WAITING';

DELETE FROM "erp"."audit_logs"
WHERE "action" LIKE 'group.%'
   OR "entity_type" IN ('group', 'group_membership', 'group_session');

-- No payment schedule may survive after the operational slot plan is reset.
UPDATE "erp"."payments"
SET "next_payment_at" = NULL
WHERE "next_payment_at" IS NOT NULL;

-- Teacher bonus cohorts remain useful, but no longer point at group memberships.
ALTER TABLE "erp"."hr_bonus_teacher_cohorts"
DROP CONSTRAINT IF EXISTS "hr_bonus_teacher_cohorts_membership_id_fkey";

ALTER TABLE "erp"."hr_bonus_teacher_cohorts"
DROP COLUMN IF EXISTS "membership_id";

-- Drop the old operational graph in dependency order. The user requested that
-- existing group/slot data is discarded rather than migrated.
DROP TABLE IF EXISTS "erp"."attendance_records";
DROP TABLE IF EXISTS "erp"."student_schedule_assignments";
DROP TABLE IF EXISTS "erp"."group_sessions";
DROP TABLE IF EXISTS "erp"."group_memberships";
DROP TABLE IF EXISTS "erp"."class_slots";
DROP TABLE IF EXISTS "erp"."group_schedules";
DROP TABLE IF EXISTS "erp"."groups";

CREATE TABLE "erp"."class_slots" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "teacher_id" UUID NOT NULL,
  "weekday" "erp"."GroupWeekday" NOT NULL,
  "shift" "erp"."ClassShift" NOT NULL,
  "start_time" TEXT NOT NULL,
  "end_time" TEXT NOT NULL,
  "room" TEXT,
  "capacity" INTEGER NOT NULL,
  "valid_from" DATE NOT NULL,
  "created_by_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "class_slots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "class_slots_capacity_check" CHECK ("capacity" BETWEEN 1 AND 100),
  CONSTRAINT "class_slots_start_time_check" CHECK ("start_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  CONSTRAINT "class_slots_end_time_check" CHECK ("end_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  CONSTRAINT "class_slots_time_order_check" CHECK ("start_time" < "end_time")
);

CREATE TABLE "erp"."student_schedule_assignments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "slot_id" UUID NOT NULL,
  "enrollment_id" UUID NOT NULL,
  "valid_from" DATE NOT NULL,
  "valid_to" DATE,
  "assigned_by_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "student_schedule_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "student_schedule_assignments_valid_period_check"
    CHECK ("valid_to" IS NULL OR "valid_to" >= "valid_from")
);

CREATE TABLE "erp"."slot_sessions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "slot_id" UUID NOT NULL,
  "session_date" DATE NOT NULL,
  "start_time" TEXT NOT NULL,
  "end_time" TEXT NOT NULL,
  "created_by_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "slot_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "slot_sessions_start_time_check" CHECK ("start_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  CONSTRAINT "slot_sessions_end_time_check" CHECK ("end_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  CONSTRAINT "slot_sessions_time_order_check" CHECK ("start_time" < "end_time")
);

CREATE TABLE "erp"."attendance_records" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "session_id" UUID NOT NULL,
  "enrollment_id" UUID NOT NULL,
  "teacher_id" UUID NOT NULL,
  "status" "erp"."AttendanceMark" NOT NULL,
  "note" TEXT,
  "marked_by_id" UUID,
  "marked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "class_slots_weekday_start_time_idx"
  ON "erp"."class_slots"("weekday", "start_time");
CREATE INDEX "class_slots_teacher_id_valid_from_idx"
  ON "erp"."class_slots"("teacher_id", "valid_from");
CREATE INDEX "class_slots_created_by_id_idx"
  ON "erp"."class_slots"("created_by_id");

CREATE UNIQUE INDEX "student_schedule_assignments_slot_id_enrollment_id_valid_from_key"
  ON "erp"."student_schedule_assignments"("slot_id", "enrollment_id", "valid_from");
CREATE INDEX "student_schedule_assignments_slot_id_valid_from_valid_to_idx"
  ON "erp"."student_schedule_assignments"("slot_id", "valid_from", "valid_to");
CREATE INDEX "student_schedule_assignments_enrollment_id_valid_from_valid_to_idx"
  ON "erp"."student_schedule_assignments"("enrollment_id", "valid_from", "valid_to");
CREATE INDEX "student_schedule_assignments_assigned_by_id_idx"
  ON "erp"."student_schedule_assignments"("assigned_by_id");

CREATE UNIQUE INDEX "slot_sessions_slot_id_session_date_key"
  ON "erp"."slot_sessions"("slot_id", "session_date");
CREATE INDEX "slot_sessions_session_date_idx"
  ON "erp"."slot_sessions"("session_date");
CREATE INDEX "slot_sessions_created_by_id_idx"
  ON "erp"."slot_sessions"("created_by_id");

CREATE UNIQUE INDEX "attendance_records_session_id_enrollment_id_key"
  ON "erp"."attendance_records"("session_id", "enrollment_id");
CREATE INDEX "attendance_records_enrollment_id_idx"
  ON "erp"."attendance_records"("enrollment_id");
CREATE INDEX "attendance_records_teacher_id_status_idx"
  ON "erp"."attendance_records"("teacher_id", "status");
CREATE INDEX "attendance_records_marked_by_id_idx"
  ON "erp"."attendance_records"("marked_by_id");

ALTER TABLE "erp"."class_slots"
  ADD CONSTRAINT "class_slots_teacher_id_fkey"
  FOREIGN KEY ("teacher_id") REFERENCES "erp"."teachers"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "erp"."class_slots"
  ADD CONSTRAINT "class_slots_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "erp"."users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "erp"."student_schedule_assignments"
  ADD CONSTRAINT "student_schedule_assignments_slot_id_fkey"
  FOREIGN KEY ("slot_id") REFERENCES "erp"."class_slots"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "erp"."student_schedule_assignments"
  ADD CONSTRAINT "student_schedule_assignments_enrollment_id_fkey"
  FOREIGN KEY ("enrollment_id") REFERENCES "erp"."enrollments"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "erp"."student_schedule_assignments"
  ADD CONSTRAINT "student_schedule_assignments_assigned_by_id_fkey"
  FOREIGN KEY ("assigned_by_id") REFERENCES "erp"."users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "erp"."slot_sessions"
  ADD CONSTRAINT "slot_sessions_slot_id_fkey"
  FOREIGN KEY ("slot_id") REFERENCES "erp"."class_slots"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "erp"."slot_sessions"
  ADD CONSTRAINT "slot_sessions_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "erp"."users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "erp"."attendance_records"
  ADD CONSTRAINT "attendance_records_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "erp"."slot_sessions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "erp"."attendance_records"
  ADD CONSTRAINT "attendance_records_enrollment_id_fkey"
  FOREIGN KEY ("enrollment_id") REFERENCES "erp"."enrollments"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "erp"."attendance_records"
  ADD CONSTRAINT "attendance_records_teacher_id_fkey"
  FOREIGN KEY ("teacher_id") REFERENCES "erp"."teachers"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "erp"."attendance_records"
  ADD CONSTRAINT "attendance_records_marked_by_id_fkey"
  FOREIGN KEY ("marked_by_id") REFERENCES "erp"."users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

ALTER TABLE "erp"."class_slots"
ADD CONSTRAINT "class_slots_teacher_schedule_no_overlap"
EXCLUDE USING gist (
  "teacher_id" WITH =,
  "weekday" WITH =,
  daterange("valid_from", 'infinity'::date, '[)') WITH &&,
  int4range(
    split_part("start_time", ':', 1)::integer * 60
      + split_part("start_time", ':', 2)::integer,
    split_part("end_time", ':', 1)::integer * 60
      + split_part("end_time", ':', 2)::integer,
    '[)'
  ) WITH &&
);
