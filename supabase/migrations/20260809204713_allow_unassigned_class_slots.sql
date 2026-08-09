SET lock_timeout = '5s';
SET statement_timeout = '30s';

ALTER TABLE "erp"."class_slots"
  ALTER COLUMN "teacher_id" DROP NOT NULL;

ALTER TABLE "erp"."class_slots"
  DROP CONSTRAINT "class_slots_teacher_id_fkey";

ALTER TABLE "erp"."class_slots"
  ADD CONSTRAINT "class_slots_teacher_id_fkey"
  FOREIGN KEY ("teacher_id") REFERENCES "erp"."teachers"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
