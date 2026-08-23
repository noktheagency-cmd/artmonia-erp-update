-- P1 mobile student portal data model.
ALTER TYPE "erp"."AttendanceMark" ADD VALUE IF NOT EXISTS 'EXCUSED';

-- Student identity is resolved from the private ERP mapping; never expose ERP IDs in JWT metadata.
UPDATE auth.users
SET
  raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) - 'erp_student_id',
  raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) - 'erp_student_id'
WHERE
  COALESCE(raw_user_meta_data, '{}'::jsonb) ? 'erp_student_id'
  OR COALESCE(raw_app_meta_data, '{}'::jsonb) ? 'erp_student_id';

CREATE TYPE "erp"."SlotSessionStatus" AS ENUM (
  'SCHEDULED',
  'COMPLETED',
  'CANCELLED',
  'RESCHEDULED'
);

ALTER TABLE "erp"."student_mobile_accounts"
  ADD COLUMN "avatar_object_path" TEXT;

ALTER TABLE "erp"."class_slots"
  ADD COLUMN "display_name" TEXT;

ALTER TABLE "erp"."slot_sessions"
  ADD COLUMN "status" "erp"."SlotSessionStatus" NOT NULL DEFAULT 'SCHEDULED',
  ADD COLUMN "title" TEXT,
  ADD COLUMN "objective" TEXT;

CREATE TABLE "erp"."lesson_homeworks" (
  "id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "due_at" TIMESTAMP(3),
  "created_by_id" UUID,
  "updated_by_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "lesson_homeworks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "erp"."homework_completions" (
  "id" UUID NOT NULL,
  "homework_id" UUID NOT NULL,
  "enrollment_id" UUID NOT NULL,
  "completed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "homework_completions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "erp"."academy_announcements" (
  "id" UUID NOT NULL,
  "program_id" UUID,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3),
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_by_id" UUID,
  "updated_by_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "academy_announcements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "lesson_homeworks_session_id_key"
  ON "erp"."lesson_homeworks"("session_id");
CREATE INDEX "lesson_homeworks_due_at_idx"
  ON "erp"."lesson_homeworks"("due_at");
CREATE INDEX "lesson_homeworks_created_by_id_idx"
  ON "erp"."lesson_homeworks"("created_by_id");
CREATE INDEX "lesson_homeworks_updated_by_id_idx"
  ON "erp"."lesson_homeworks"("updated_by_id");

CREATE UNIQUE INDEX "homework_completions_homework_id_enrollment_id_key"
  ON "erp"."homework_completions"("homework_id", "enrollment_id");
CREATE INDEX "homework_completions_enrollment_id_completed_at_idx"
  ON "erp"."homework_completions"("enrollment_id", "completed_at" DESC);

CREATE INDEX "academy_announcements_active_published_idx"
  ON "erp"."academy_announcements"("published_at" DESC)
  WHERE "is_active" = true;
CREATE INDEX "academy_announcements_program_active_published_idx"
  ON "erp"."academy_announcements"("program_id", "published_at" DESC)
  WHERE "is_active" = true;
CREATE INDEX "academy_announcements_expires_at_idx"
  ON "erp"."academy_announcements"("expires_at");
CREATE INDEX "academy_announcements_created_by_id_idx"
  ON "erp"."academy_announcements"("created_by_id");
CREATE INDEX "academy_announcements_updated_by_id_idx"
  ON "erp"."academy_announcements"("updated_by_id");

CREATE INDEX "slot_sessions_status_session_date_idx"
  ON "erp"."slot_sessions"("status", "session_date", "start_time", "id");

ALTER TABLE "erp"."lesson_homeworks"
  ADD CONSTRAINT "lesson_homeworks_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "erp"."slot_sessions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "erp"."lesson_homeworks"
  ADD CONSTRAINT "lesson_homeworks_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "erp"."users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "erp"."lesson_homeworks"
  ADD CONSTRAINT "lesson_homeworks_updated_by_id_fkey"
  FOREIGN KEY ("updated_by_id") REFERENCES "erp"."users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "erp"."homework_completions"
  ADD CONSTRAINT "homework_completions_homework_id_fkey"
  FOREIGN KEY ("homework_id") REFERENCES "erp"."lesson_homeworks"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "erp"."homework_completions"
  ADD CONSTRAINT "homework_completions_enrollment_id_fkey"
  FOREIGN KEY ("enrollment_id") REFERENCES "erp"."enrollments"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "erp"."academy_announcements"
  ADD CONSTRAINT "academy_announcements_program_id_fkey"
  FOREIGN KEY ("program_id") REFERENCES "erp"."programs"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "erp"."academy_announcements"
  ADD CONSTRAINT "academy_announcements_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "erp"."users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "erp"."academy_announcements"
  ADD CONSTRAINT "academy_announcements_updated_by_id_fkey"
  FOREIGN KEY ("updated_by_id") REFERENCES "erp"."users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "erp"."lesson_homeworks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "erp"."homework_completions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "erp"."academy_announcements" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "erp"."lesson_homeworks" FROM anon, authenticated;
REVOKE ALL ON TABLE "erp"."homework_completions" FROM anon, authenticated;
REVOKE ALL ON TABLE "erp"."academy_announcements" FROM anon, authenticated;

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'student-avatars',
  'student-avatars',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "student_avatar_select_own"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'student-avatars'
  AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
);

CREATE POLICY "student_avatar_insert_own"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'student-avatars'
  AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
);

CREATE POLICY "student_avatar_update_own"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'student-avatars'
  AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
)
WITH CHECK (
  bucket_id = 'student-avatars'
  AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
);

CREATE POLICY "student_avatar_delete_own"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'student-avatars'
  AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
);
