-- Match Prisma's client-side UUID defaults and keep identifiers below
-- PostgreSQL's 63-byte name limit.
SET lock_timeout = '5s';
SET statement_timeout = '30s';

ALTER TABLE "erp"."class_slots" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "erp"."student_schedule_assignments" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "erp"."slot_sessions" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "erp"."attendance_records" ALTER COLUMN "id" DROP DEFAULT;

ALTER INDEX "erp"."student_schedule_assignments_slot_id_enrollment_id_valid_from_k"
  RENAME TO "ssa_slot_enrollment_start_key";
ALTER INDEX "erp"."student_schedule_assignments_slot_id_valid_from_valid_to_idx"
  RENAME TO "ssa_slot_period_idx";
ALTER INDEX "erp"."student_schedule_assignments_enrollment_id_valid_from_valid_to_"
  RENAME TO "ssa_enrollment_period_idx";
ALTER INDEX "erp"."student_schedule_assignments_assigned_by_id_idx"
  RENAME TO "ssa_assigned_by_idx";
