CREATE TYPE "erp"."LessonStatus" AS ENUM ('RESERVED', 'ATTENDED', 'ABSENT', 'CANCELLED');

CREATE TABLE "erp"."lessons" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "teacher_id" UUID,
    "lesson_date" DATE NOT NULL,
    "start_time" TEXT NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "room" TEXT NOT NULL,
    "note" TEXT,
    "status" "erp"."LessonStatus" NOT NULL DEFAULT 'RESERVED',
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lessons_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "lessons_lesson_date_start_time_room_key" ON "erp"."lessons"("lesson_date", "start_time", "room");
CREATE INDEX "lessons_student_id_lesson_date_idx" ON "erp"."lessons"("student_id", "lesson_date");
CREATE INDEX "lessons_teacher_id_lesson_date_idx" ON "erp"."lessons"("teacher_id", "lesson_date");
CREATE INDEX "lessons_enrollment_id_idx" ON "erp"."lessons"("enrollment_id");
CREATE INDEX "lessons_status_lesson_date_idx" ON "erp"."lessons"("status", "lesson_date");

ALTER TABLE "erp"."lessons"
ADD CONSTRAINT "lessons_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "erp"."students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "erp"."lessons"
ADD CONSTRAINT "lessons_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "erp"."enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "erp"."lessons"
ADD CONSTRAINT "lessons_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "erp"."teachers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "erp"."lessons"
ADD CONSTRAINT "lessons_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "erp"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
