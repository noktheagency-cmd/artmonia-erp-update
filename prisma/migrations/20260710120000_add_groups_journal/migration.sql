CREATE TYPE "erp"."GroupWeekday" AS ENUM (
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY'
);

CREATE TYPE "erp"."AttendanceMark" AS ENUM ('PRESENT', 'ABSENT');

ALTER TABLE "erp"."teachers" ADD COLUMN "user_id" UUID;
CREATE UNIQUE INDEX "teachers_user_id_key" ON "erp"."teachers"("user_id");
ALTER TABLE "erp"."teachers"
  ADD CONSTRAINT "teachers_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "erp"."users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "erp"."groups" (
  "id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "capacity" INTEGER NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "archived_at" TIMESTAMP(3),
  "created_by_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "groups_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "groups_capacity_check" CHECK ("capacity" > 0),
  CONSTRAINT "groups_code_check" CHECK (length(btrim("code")) > 0 AND "code" = upper("code"))
);

CREATE TABLE "erp"."group_schedules" (
  "id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "weekday" "erp"."GroupWeekday" NOT NULL,
  "start_time" TEXT NOT NULL,
  "end_time" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "group_schedules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "group_schedules_time_check" CHECK (
    "start_time" ~ '^[0-2][0-9]:[0-5][0-9]$'
    AND "end_time" ~ '^[0-2][0-9]:[0-5][0-9]$'
    AND "end_time" > "start_time"
  )
);

CREATE TABLE "erp"."group_memberships" (
  "id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "enrollment_id" UUID NOT NULL,
  "teacher_id" UUID NOT NULL,
  "joined_at" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ended_at" DATE,
  "assigned_by_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "group_memberships_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "group_memberships_dates_check" CHECK ("ended_at" IS NULL OR "ended_at" >= "joined_at")
);

CREATE TABLE "erp"."group_sessions" (
  "id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "schedule_id" UUID,
  "session_date" DATE NOT NULL,
  "start_time" TEXT NOT NULL,
  "end_time" TEXT NOT NULL,
  "created_by_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "group_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "erp"."attendance_records" (
  "id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "membership_id" UUID NOT NULL,
  "teacher_id" UUID NOT NULL,
  "status" "erp"."AttendanceMark" NOT NULL,
  "note" TEXT,
  "marked_by_id" UUID,
  "marked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "groups_code_key" ON "erp"."groups"("code");
CREATE INDEX "groups_is_active_code_idx" ON "erp"."groups"("is_active", "code");
CREATE INDEX "groups_created_by_id_idx" ON "erp"."groups"("created_by_id");

CREATE UNIQUE INDEX "group_schedules_group_id_weekday_key"
  ON "erp"."group_schedules"("group_id", "weekday");
CREATE INDEX "group_schedules_weekday_idx" ON "erp"."group_schedules"("weekday");

CREATE INDEX "group_memberships_group_id_ended_at_idx"
  ON "erp"."group_memberships"("group_id", "ended_at");
CREATE INDEX "group_memberships_enrollment_id_ended_at_idx"
  ON "erp"."group_memberships"("enrollment_id", "ended_at");
CREATE INDEX "group_memberships_teacher_id_ended_at_idx"
  ON "erp"."group_memberships"("teacher_id", "ended_at");
CREATE INDEX "group_memberships_assigned_by_id_idx"
  ON "erp"."group_memberships"("assigned_by_id");
CREATE UNIQUE INDEX "group_memberships_one_active_enrollment_key"
  ON "erp"."group_memberships"("enrollment_id") WHERE "ended_at" IS NULL;

CREATE UNIQUE INDEX "group_sessions_group_id_session_date_key"
  ON "erp"."group_sessions"("group_id", "session_date");
CREATE INDEX "group_sessions_session_date_idx" ON "erp"."group_sessions"("session_date");
CREATE INDEX "group_sessions_schedule_id_idx" ON "erp"."group_sessions"("schedule_id");
CREATE INDEX "group_sessions_created_by_id_idx" ON "erp"."group_sessions"("created_by_id");

CREATE UNIQUE INDEX "attendance_records_session_id_membership_id_key"
  ON "erp"."attendance_records"("session_id", "membership_id");
CREATE INDEX "attendance_records_membership_id_idx"
  ON "erp"."attendance_records"("membership_id");
CREATE INDEX "attendance_records_teacher_id_status_idx"
  ON "erp"."attendance_records"("teacher_id", "status");
CREATE INDEX "attendance_records_marked_by_id_idx"
  ON "erp"."attendance_records"("marked_by_id");

ALTER TABLE "erp"."groups"
  ADD CONSTRAINT "groups_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "erp"."users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "erp"."group_schedules"
  ADD CONSTRAINT "group_schedules_group_id_fkey"
  FOREIGN KEY ("group_id") REFERENCES "erp"."groups"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "erp"."group_memberships"
  ADD CONSTRAINT "group_memberships_group_id_fkey"
  FOREIGN KEY ("group_id") REFERENCES "erp"."groups"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "erp"."group_memberships"
  ADD CONSTRAINT "group_memberships_enrollment_id_fkey"
  FOREIGN KEY ("enrollment_id") REFERENCES "erp"."enrollments"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "erp"."group_memberships"
  ADD CONSTRAINT "group_memberships_teacher_id_fkey"
  FOREIGN KEY ("teacher_id") REFERENCES "erp"."teachers"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "erp"."group_memberships"
  ADD CONSTRAINT "group_memberships_assigned_by_id_fkey"
  FOREIGN KEY ("assigned_by_id") REFERENCES "erp"."users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "erp"."group_sessions"
  ADD CONSTRAINT "group_sessions_group_id_fkey"
  FOREIGN KEY ("group_id") REFERENCES "erp"."groups"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "erp"."group_sessions"
  ADD CONSTRAINT "group_sessions_schedule_id_fkey"
  FOREIGN KEY ("schedule_id") REFERENCES "erp"."group_schedules"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "erp"."group_sessions"
  ADD CONSTRAINT "group_sessions_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "erp"."users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "erp"."attendance_records"
  ADD CONSTRAINT "attendance_records_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "erp"."group_sessions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "erp"."attendance_records"
  ADD CONSTRAINT "attendance_records_membership_id_fkey"
  FOREIGN KEY ("membership_id") REFERENCES "erp"."group_memberships"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "erp"."attendance_records"
  ADD CONSTRAINT "attendance_records_teacher_id_fkey"
  FOREIGN KEY ("teacher_id") REFERENCES "erp"."teachers"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "erp"."attendance_records"
  ADD CONSTRAINT "attendance_records_marked_by_id_fkey"
  FOREIGN KEY ("marked_by_id") REFERENCES "erp"."users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
