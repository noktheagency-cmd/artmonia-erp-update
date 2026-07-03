CREATE TYPE "erp"."WorkshopEventType" AS ENUM ('WORKSHOP', 'MASTERCLASS');
CREATE TYPE "erp"."WorkshopEventStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'COMPLETED', 'CANCELLED');

CREATE TABLE "erp"."workshop_events" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "event_type" "erp"."WorkshopEventType" NOT NULL DEFAULT 'WORKSHOP',
    "status" "erp"."WorkshopEventStatus" NOT NULL DEFAULT 'SCHEDULED',
    "event_date" DATE NOT NULL,
    "start_time" TEXT NOT NULL,
    "duration_minutes" INTEGER NOT NULL DEFAULT 120,
    "room" TEXT,
    "instructor" TEXT,
    "capacity" INTEGER,
    "entry_price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workshop_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "erp"."workshop_participants" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "student_id" UUID,
    "full_name" TEXT NOT NULL,
    "phone" TEXT,
    "payment_method" "erp"."PaymentMethod" NOT NULL DEFAULT 'CASH',
    "list_price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "amount_paid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "is_paid" BOOLEAN NOT NULL DEFAULT false,
    "is_discounted" BOOLEAN NOT NULL DEFAULT false,
    "is_gift" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "assigned_by_id" UUID,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workshop_participants_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "workshop_events_event_date_start_time_idx" ON "erp"."workshop_events"("event_date", "start_time");
CREATE INDEX "workshop_events_event_type_status_idx" ON "erp"."workshop_events"("event_type", "status");
CREATE INDEX "workshop_events_created_by_id_idx" ON "erp"."workshop_events"("created_by_id");

CREATE UNIQUE INDEX "workshop_participants_event_id_student_id_key" ON "erp"."workshop_participants"("event_id", "student_id");
CREATE INDEX "workshop_participants_event_id_is_paid_is_gift_idx" ON "erp"."workshop_participants"("event_id", "is_paid", "is_gift");
CREATE INDEX "workshop_participants_student_id_idx" ON "erp"."workshop_participants"("student_id");
CREATE INDEX "workshop_participants_assigned_by_id_idx" ON "erp"."workshop_participants"("assigned_by_id");

ALTER TABLE "erp"."workshop_events"
ADD CONSTRAINT "workshop_events_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "erp"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "erp"."workshop_participants"
ADD CONSTRAINT "workshop_participants_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "erp"."workshop_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "erp"."workshop_participants"
ADD CONSTRAINT "workshop_participants_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "erp"."students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "erp"."workshop_participants"
ADD CONSTRAINT "workshop_participants_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "erp"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
