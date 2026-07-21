CREATE TYPE "erp"."HrNotificationCategory" AS ENUM (
  'RULE_VIOLATION',
  'PERFORMANCE_WARNING',
  'INFORMATION',
  'APPRECIATION',
  'MANUAL'
);

CREATE TYPE "erp"."HrNotificationPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
CREATE TYPE "erp"."HrNotificationStatus" AS ENUM ('SENT', 'READ', 'ACKNOWLEDGED', 'RESOLVED');

CREATE TABLE "erp"."hr_staff_notifications" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "employee_id" UUID NOT NULL,
  "creator_user_id" UUID NOT NULL,
  "category" "erp"."HrNotificationCategory" NOT NULL,
  "priority" "erp"."HrNotificationPriority" NOT NULL DEFAULT 'NORMAL',
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "status" "erp"."HrNotificationStatus" NOT NULL DEFAULT 'SENT',
  "sent_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "read_at" TIMESTAMPTZ,
  "acknowledged_at" TIMESTAMPTZ,
  "resolved_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "hr_staff_notifications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "hr_staff_notifications_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "erp"."hr_employees"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "hr_staff_notifications_creator_user_id_fkey" FOREIGN KEY ("creator_user_id") REFERENCES "erp"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "hr_staff_notifications_employee_id_created_at_idx" ON "erp"."hr_staff_notifications"("employee_id", "created_at");
CREATE INDEX "hr_staff_notifications_employee_id_status_idx" ON "erp"."hr_staff_notifications"("employee_id", "status");
CREATE INDEX "hr_staff_notifications_creator_user_id_created_at_idx" ON "erp"."hr_staff_notifications"("creator_user_id", "created_at");

ALTER TABLE "erp"."hr_staff_notifications" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "erp"."hr_staff_notifications" FROM anon, authenticated;
