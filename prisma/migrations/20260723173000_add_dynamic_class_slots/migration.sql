CREATE TYPE "erp"."ClassShift" AS ENUM ('MORNING', 'AFTERNOON', 'EVENING');

CREATE TABLE "erp"."class_slots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "group_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "weekday" "erp"."GroupWeekday" NOT NULL,
    "shift" "erp"."ClassShift" NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "room" TEXT,
    "capacity" INTEGER NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_slots_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "class_slots_valid_range_check" CHECK ("valid_to" IS NULL OR "valid_to" >= "valid_from"),
    CONSTRAINT "class_slots_capacity_check" CHECK ("capacity" > 0),
    CONSTRAINT "class_slots_time_check" CHECK ("end_time" > "start_time")
);

CREATE TABLE "erp"."student_schedule_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slot_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "assigned_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_schedule_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "student_schedule_assignments_valid_range_check" CHECK ("valid_to" IS NULL OR "valid_to" >= "valid_from")
);

CREATE UNIQUE INDEX "class_slots_group_id_weekday_start_time_teacher_id_valid_from_key"
ON "erp"."class_slots"("group_id", "weekday", "start_time", "teacher_id", "valid_from");
CREATE INDEX "class_slots_weekday_start_time_is_active_idx"
ON "erp"."class_slots"("weekday", "start_time", "is_active");
CREATE INDEX "class_slots_teacher_id_is_active_idx"
ON "erp"."class_slots"("teacher_id", "is_active");
CREATE INDEX "class_slots_group_id_is_active_idx"
ON "erp"."class_slots"("group_id", "is_active");
CREATE INDEX "class_slots_created_by_id_idx"
ON "erp"."class_slots"("created_by_id");

CREATE UNIQUE INDEX "student_schedule_assignments_slot_id_membership_id_valid_from_key"
ON "erp"."student_schedule_assignments"("slot_id", "membership_id", "valid_from");
CREATE INDEX "student_schedule_assignments_slot_id_valid_from_valid_to_idx"
ON "erp"."student_schedule_assignments"("slot_id", "valid_from", "valid_to");
CREATE INDEX "student_schedule_assignments_membership_id_valid_from_valid_to_idx"
ON "erp"."student_schedule_assignments"("membership_id", "valid_from", "valid_to");
CREATE INDEX "student_schedule_assignments_assigned_by_id_idx"
ON "erp"."student_schedule_assignments"("assigned_by_id");

ALTER TABLE "erp"."class_slots"
ADD CONSTRAINT "class_slots_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "erp"."groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "erp"."class_slots"
ADD CONSTRAINT "class_slots_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "erp"."teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "erp"."class_slots"
ADD CONSTRAINT "class_slots_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "erp"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "erp"."student_schedule_assignments"
ADD CONSTRAINT "student_schedule_assignments_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "erp"."class_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "erp"."student_schedule_assignments"
ADD CONSTRAINT "student_schedule_assignments_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "erp"."group_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "erp"."student_schedule_assignments"
ADD CONSTRAINT "student_schedule_assignments_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "erp"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "erp"."class_slots" (
    "group_id", "teacher_id", "weekday", "shift", "start_time", "end_time",
    "room", "capacity", "valid_from", "created_by_id", "updated_at"
)
SELECT DISTINCT
    schedule."group_id",
    membership."teacher_id",
    schedule."weekday",
    CASE
      WHEN schedule."start_time" < '12:00' THEN 'MORNING'::"erp"."ClassShift"
      WHEN schedule."start_time" < '17:00' THEN 'AFTERNOON'::"erp"."ClassShift"
      ELSE 'EVENING'::"erp"."ClassShift"
    END,
    schedule."start_time",
    schedule."end_time",
    NULL,
    student_group."capacity",
    LEAST(CURRENT_DATE, membership."joined_at"),
    student_group."created_by_id",
    CURRENT_TIMESTAMP
FROM "erp"."group_schedules" schedule
JOIN "erp"."groups" student_group ON student_group."id" = schedule."group_id"
JOIN "erp"."group_memberships" membership
  ON membership."group_id" = student_group."id"
 AND membership."ended_at" IS NULL
WHERE student_group."is_active" = true
ON CONFLICT DO NOTHING;

INSERT INTO "erp"."student_schedule_assignments" (
    "slot_id", "membership_id", "valid_from", "assigned_by_id", "updated_at"
)
SELECT
    slot."id",
    membership."id",
    GREATEST(slot."valid_from", membership."joined_at"),
    membership."assigned_by_id",
    CURRENT_TIMESTAMP
FROM "erp"."class_slots" slot
JOIN "erp"."group_memberships" membership
  ON membership."group_id" = slot."group_id"
 AND membership."teacher_id" = slot."teacher_id"
 AND membership."ended_at" IS NULL
ON CONFLICT DO NOTHING;
