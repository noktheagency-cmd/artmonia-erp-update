-- CreateTable
CREATE TABLE "erp"."single_lessons" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "program_id" UUID NOT NULL,
    "lesson_date" DATE NOT NULL,
    "start_time" TEXT NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "room" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "status" "erp"."LessonStatus" NOT NULL DEFAULT 'RESERVED',
    "payment_id" UUID,
    "invoice_id" UUID,
    "request_hash" CHAR(64) NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "single_lessons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "single_lessons_payment_id_key" ON "erp"."single_lessons"("payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "single_lessons_invoice_id_key" ON "erp"."single_lessons"("invoice_id");

-- CreateIndex
CREATE INDEX "single_lessons_student_id_lesson_date_idx" ON "erp"."single_lessons"("student_id", "lesson_date");

-- CreateIndex
CREATE INDEX "single_lessons_teacher_id_lesson_date_idx" ON "erp"."single_lessons"("teacher_id", "lesson_date");

-- CreateIndex
CREATE INDEX "single_lessons_lesson_date_status_idx" ON "erp"."single_lessons"("lesson_date", "status");

-- AddForeignKey
ALTER TABLE "erp"."single_lessons" ADD CONSTRAINT "single_lessons_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "erp"."students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."single_lessons" ADD CONSTRAINT "single_lessons_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "erp"."teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."single_lessons" ADD CONSTRAINT "single_lessons_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "erp"."programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."single_lessons" ADD CONSTRAINT "single_lessons_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "erp"."payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."single_lessons" ADD CONSTRAINT "single_lessons_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "erp"."invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."single_lessons" ADD CONSTRAINT "single_lessons_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "erp"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE erp.single_lessons ADD CONSTRAINT single_lessons_price_positive CHECK (price > 0);
ALTER TABLE erp.single_lessons ADD CONSTRAINT single_lessons_duration_valid CHECK (duration_minutes BETWEEN 15 AND 480);
ALTER TABLE erp.single_lessons ADD CONSTRAINT single_lessons_time_valid CHECK (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
ALTER TABLE erp.single_lessons ADD CONSTRAINT single_lessons_payment_invoice CHECK (payment_id IS NULL OR invoice_id IS NOT NULL);
ALTER TABLE erp.single_lessons ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp.single_lessons FROM PUBLIC, anon, authenticated;
