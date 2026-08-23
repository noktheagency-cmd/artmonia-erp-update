CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";

CREATE TYPE "erp"."AttendanceCaptureSource" AS ENUM ('MANUAL', 'MOBILE_QR', 'AUTOMATIC');

ALTER TABLE "erp"."attendance_records"
  ADD COLUMN "source" "erp"."AttendanceCaptureSource" NOT NULL DEFAULT 'MANUAL';

ALTER TABLE "erp"."slot_sessions"
  ADD COLUMN "attendance_finalized_at" TIMESTAMP(3);

UPDATE "erp"."slot_sessions"
SET "attendance_finalized_at" = COALESCE("updated_at", "created_at")
WHERE "session_date" < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Baku')::date;

CREATE INDEX "slot_sessions_attendance_finalized_at_session_date_idx"
  ON "erp"."slot_sessions"("attendance_finalized_at", "session_date");

CREATE TABLE "erp"."attendance_qr_challenges" (
  "id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "revoked_at" TIMESTAMP(3),
  "created_by_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "attendance_qr_challenges_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "attendance_qr_challenges_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "erp"."slot_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "attendance_qr_challenges_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "erp"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "attendance_qr_challenges_token_hash_key"
  ON "erp"."attendance_qr_challenges"("token_hash");
CREATE INDEX "attendance_qr_challenges_session_id_expires_at_idx"
  ON "erp"."attendance_qr_challenges"("session_id", "expires_at");
CREATE INDEX "attendance_qr_challenges_expires_at_idx"
  ON "erp"."attendance_qr_challenges"("expires_at");
CREATE INDEX "attendance_qr_challenges_created_by_id_idx"
  ON "erp"."attendance_qr_challenges"("created_by_id");

CREATE TABLE "erp"."mobile_attendance_check_ins" (
  "id" UUID NOT NULL,
  "idempotency_key" UUID NOT NULL,
  "client_event_id" UUID NOT NULL,
  "request_id" UUID NOT NULL,
  "request_hash" CHAR(64) NOT NULL,
  "erp_student_id" UUID NOT NULL,
  "qr_token_fingerprint" CHAR(16) NOT NULL,
  "scanned_at" TIMESTAMP(3) NOT NULL,
  "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  "http_status" INTEGER,
  "result_code" TEXT NOT NULL DEFAULT 'PENDING',
  "response_json" JSONB,
  "student_id" UUID,
  "enrollment_id" UUID,
  "session_id" UUID,
  "challenge_id" UUID,
  "attendance_record_id" UUID,
  CONSTRAINT "mobile_attendance_check_ins_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "mobile_attendance_check_ins_http_status_check"
    CHECK ("http_status" IS NULL OR "http_status" BETWEEN 100 AND 599),
  CONSTRAINT "mobile_attendance_check_ins_student_id_fkey"
    FOREIGN KEY ("student_id") REFERENCES "erp"."students"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "mobile_attendance_check_ins_enrollment_id_fkey"
    FOREIGN KEY ("enrollment_id") REFERENCES "erp"."enrollments"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "mobile_attendance_check_ins_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "erp"."slot_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "mobile_attendance_check_ins_challenge_id_fkey"
    FOREIGN KEY ("challenge_id") REFERENCES "erp"."attendance_qr_challenges"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "mobile_attendance_check_ins_attendance_record_id_fkey"
    FOREIGN KEY ("attendance_record_id") REFERENCES "erp"."attendance_records"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "mobile_attendance_check_ins_idempotency_key_key"
  ON "erp"."mobile_attendance_check_ins"("idempotency_key");
CREATE UNIQUE INDEX "mobile_attendance_check_ins_client_event_id_key"
  ON "erp"."mobile_attendance_check_ins"("client_event_id");
CREATE UNIQUE INDEX "mobile_attendance_check_ins_request_id_key"
  ON "erp"."mobile_attendance_check_ins"("request_id");
CREATE INDEX "mobile_attendance_check_ins_erp_student_id_received_at_idx"
  ON "erp"."mobile_attendance_check_ins"("erp_student_id", "received_at" DESC);
CREATE INDEX "mobile_attendance_check_ins_session_id_received_at_idx"
  ON "erp"."mobile_attendance_check_ins"("session_id", "received_at" DESC);
CREATE INDEX "mobile_attendance_check_ins_result_code_received_at_idx"
  ON "erp"."mobile_attendance_check_ins"("result_code", "received_at" DESC);
CREATE INDEX "mobile_attendance_check_ins_student_id_idx"
  ON "erp"."mobile_attendance_check_ins"("student_id");
CREATE INDEX "mobile_attendance_check_ins_enrollment_id_idx"
  ON "erp"."mobile_attendance_check_ins"("enrollment_id");
CREATE INDEX "mobile_attendance_check_ins_challenge_id_idx"
  ON "erp"."mobile_attendance_check_ins"("challenge_id");
CREATE INDEX "mobile_attendance_check_ins_attendance_record_id_idx"
  ON "erp"."mobile_attendance_check_ins"("attendance_record_id");

ALTER TABLE "erp"."attendance_qr_challenges" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "erp"."mobile_attendance_check_ins" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "erp"."attendance_qr_challenges" FROM anon, authenticated;
REVOKE ALL ON TABLE "erp"."mobile_attendance_check_ins" FROM anon, authenticated;
