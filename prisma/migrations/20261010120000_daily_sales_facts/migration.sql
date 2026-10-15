BEGIN;

-- AlterTable
ALTER TABLE "erp"."students" ADD COLUMN     "admission_tracking" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "erp"."payments" ADD COLUMN     "course_sale_id" UUID,
ADD COLUMN     "receipt_purpose" TEXT NOT NULL DEFAULT 'UNCLASSIFIED';

-- CreateTable
CREATE TABLE "erp"."lead_contact_events" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "channel" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "idempotency_key" UUID NOT NULL,

    CONSTRAINT "lead_contact_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."lead_work_items" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'PRIMARY',
    "planned_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),
    "completed_by_id" UUID,
    "cancelled_at" TIMESTAMPTZ(3),
    "result" TEXT,
    "is_legacy" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "lead_work_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."crm_appointments" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "teacher_id" UUID,
    "kind" TEXT NOT NULL,
    "outcome" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "planned_at" TIMESTAMPTZ(3) NOT NULL,
    "occurred_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "reason" TEXT,
    "previous_id" UUID,
    "reminder_work_id" UUID,
    "idempotency_key" TEXT NOT NULL,
    "is_legacy" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "crm_appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp"."course_sales" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "lead_id" UUID,
    "cycle_key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "qualified_at" DATE NOT NULL,
    "contract_confirmed_at" TIMESTAMPTZ(3) NOT NULL,
    "initial_fee" DECIMAL(12,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DEPOSIT',
    "cancelled_at" TIMESTAMPTZ(3),
    "cancellation_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "course_sales_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lead_contact_events_idempotency_key_key" ON "erp"."lead_contact_events"("idempotency_key");

-- CreateIndex
CREATE INDEX "lead_contact_events_occurred_at_actor_id_idx" ON "erp"."lead_contact_events"("occurred_at", "actor_id");

-- CreateIndex
CREATE INDEX "lead_contact_events_lead_id_occurred_at_idx" ON "erp"."lead_contact_events"("lead_id", "occurred_at");

-- CreateIndex
CREATE INDEX "lead_work_items_owner_id_planned_at_idx" ON "erp"."lead_work_items"("owner_id", "planned_at");

-- CreateIndex
CREATE INDEX "lead_work_items_lead_id_completed_at_cancelled_at_idx" ON "erp"."lead_work_items"("lead_id", "completed_at", "cancelled_at");

-- CreateIndex
CREATE UNIQUE INDEX "crm_appointments_previous_id_key" ON "erp"."crm_appointments"("previous_id");

-- CreateIndex
CREATE UNIQUE INDEX "crm_appointments_idempotency_key_key" ON "erp"."crm_appointments"("idempotency_key");

-- CreateIndex
CREATE INDEX "crm_appointments_planned_at_owner_id_idx" ON "erp"."crm_appointments"("planned_at", "owner_id");

-- CreateIndex
CREATE INDEX "crm_appointments_occurred_at_idx" ON "erp"."crm_appointments"("occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "course_sales_cycle_key_key" ON "erp"."course_sales"("cycle_key");

-- CreateIndex
CREATE INDEX "course_sales_qualified_at_owner_id_idx" ON "erp"."course_sales"("qualified_at", "owner_id");

-- AddForeignKey
ALTER TABLE "erp"."payments" ADD CONSTRAINT "payments_course_sale_id_fkey" FOREIGN KEY ("course_sale_id") REFERENCES "erp"."course_sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."lead_contact_events" ADD CONSTRAINT "lead_contact_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "erp"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."lead_contact_events" ADD CONSTRAINT "lead_contact_events_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "erp"."contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."lead_contact_events" ADD CONSTRAINT "lead_contact_events_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "erp"."leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."lead_work_items" ADD CONSTRAINT "lead_work_items_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "erp"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."lead_work_items" ADD CONSTRAINT "lead_work_items_completed_by_id_fkey" FOREIGN KEY ("completed_by_id") REFERENCES "erp"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."lead_work_items" ADD CONSTRAINT "lead_work_items_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "erp"."leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."crm_appointments" ADD CONSTRAINT "crm_appointments_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "erp"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."crm_appointments" ADD CONSTRAINT "crm_appointments_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "erp"."teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."crm_appointments" ADD CONSTRAINT "crm_appointments_previous_id_fkey" FOREIGN KEY ("previous_id") REFERENCES "erp"."crm_appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."crm_appointments" ADD CONSTRAINT "crm_appointments_reminder_work_id_fkey" FOREIGN KEY ("reminder_work_id") REFERENCES "erp"."lead_work_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."crm_appointments" ADD CONSTRAINT "crm_appointments_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "erp"."leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."course_sales" ADD CONSTRAINT "course_sales_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "erp"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."course_sales" ADD CONSTRAINT "course_sales_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "erp"."leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."course_sales" ADD CONSTRAINT "course_sales_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "erp"."enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp"."course_sales" ADD CONSTRAINT "course_sales_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "erp"."students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Bounded, factual cutover: no inferred conversations, signed contracts or historical sales.
ALTER TABLE erp.lead_contact_events ADD CONSTRAINT lead_contact_event_values CHECK (channel IN ('PHONE','WHATSAPP','IN_PERSON','OTHER') AND outcome IN ('TALKED','UNANSWERED'));
ALTER TABLE erp.lead_work_items ADD CONSTRAINT lead_work_closure CHECK (completed_at IS NULL OR cancelled_at IS NULL);
CREATE UNIQUE INDEX lead_work_primary_open_key ON erp.lead_work_items(lead_id) WHERE source='PRIMARY' AND completed_at IS NULL AND cancelled_at IS NULL;
ALTER TABLE erp.crm_appointments ADD CONSTRAINT crm_appointment_values CHECK (kind IN ('CONSULTATION','TRIAL') AND outcome IN ('SCHEDULED','ATTENDED','NO_SHOW','CANCELLED','RESCHEDULED'));
ALTER TABLE erp.crm_appointments ADD CONSTRAINT crm_appointment_actual CHECK (is_legacy OR (outcome IN ('ATTENDED','NO_SHOW') = (occurred_at IS NOT NULL)));
ALTER TABLE erp.course_sales ADD CONSTRAINT course_sale_values CHECK (kind IN ('NEW','RETURN') AND route IN ('CRM','DIRECT') AND status IN ('DEPOSIT','COMPLETE','CANCELLED') AND initial_fee > 0);
ALTER TABLE erp.course_sales ADD CONSTRAINT course_sale_cancellation CHECK ((status='CANCELLED') = (cancelled_at IS NOT NULL AND cancellation_reason IS NOT NULL));
ALTER TABLE erp.payments ADD CONSTRAINT payment_receipt_purpose CHECK (receipt_purpose IN ('ADMISSION','INITIAL_BALANCE','RENEWAL','ONE_OFF','OTHER','UNCLASSIFIED') AND ((receipt_purpose IN ('ADMISSION','INITIAL_BALANCE')) = (course_sale_id IS NOT NULL)) AND (receipt_purpose <> 'ADMISSION' OR amount >= 20));

INSERT INTO erp.lead_work_items(id,lead_id,owner_id,kind,source,planned_at,created_at,is_legacy)
SELECT gen_random_uuid(),l.id,l.manager_id,l.next_action_type::text,'PRIMARY',l.next_follow_up_at AT TIME ZONE 'UTC',CURRENT_TIMESTAMP,true
FROM erp.leads l WHERE l.manager_id IS NOT NULL AND l.next_follow_up_at IS NOT NULL AND l.next_action_type IS NOT NULL AND l.stage NOT IN ('REGISTERED','LOST');

INSERT INTO erp.lead_work_items(id,lead_id,owner_id,kind,source,planned_at,created_at,completed_at,completed_by_id,result,is_legacy)
SELECT t.id,l.id,coalesce(t.owner_user_id,l.manager_id,t.created_by_id),'FOLLOW_UP','LEGACY_TASK',coalesce(t.due_at,t.created_at) AT TIME ZONE 'UTC',t.created_at AT TIME ZONE 'UTC',t.completed_at AT TIME ZONE 'UTC',t.created_by_id,'DONE',true
FROM erp.tasks t JOIN erp.leads l ON l.id=t.entity_id
WHERE t.entity_type='lead' AND t.type='lead_follow_up' AND t.status='DONE' AND t.completed_at IS NOT NULL AND coalesce(t.owner_user_id,l.manager_id,t.created_by_id) IS NOT NULL;

INSERT INTO erp.crm_appointments(id,lead_id,owner_id,kind,outcome,planned_at,created_at,updated_at,idempotency_key,is_legacy)
SELECT t.id,l.id,coalesce(t.owner_user_id,l.manager_id,t.created_by_id),CASE WHEN t.description='TRIAL' THEN 'TRIAL' ELSE 'CONSULTATION' END,
CASE WHEN t.status='CANCELLED' THEN 'CANCELLED' WHEN t.completion_note IN ('ATTENDED','NO_SHOW','CANCELLED') THEN t.completion_note ELSE 'SCHEDULED' END,
t.due_at AT TIME ZONE 'UTC',t.created_at AT TIME ZONE 'UTC',CURRENT_TIMESTAMP,'legacy-task:'||t.id::text,true
FROM erp.tasks t JOIN erp.leads l ON l.id=t.entity_id
WHERE t.entity_type='lead' AND t.type='lead_appointment' AND t.due_at IS NOT NULL AND coalesce(t.owner_user_id,l.manager_id,t.created_by_id) IS NOT NULL;

-- Match existing private ERP posture. Missing Supabase roles are permitted in isolated dev.
ALTER TABLE erp.lead_contact_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp.lead_work_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp.crm_appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp.course_sales ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp.lead_contact_events,erp.lead_work_items,erp.crm_appointments,erp.course_sales FROM PUBLIC;
DO $private$
DECLARE role_name text;
BEGIN
 FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated') LOOP
  EXECUTE format('REVOKE ALL ON erp.lead_contact_events,erp.lead_work_items,erp.crm_appointments,erp.course_sales FROM %I',role_name);
 END LOOP;
END $private$;

-- Cash attached to an admission is retained. Prevent bypass through financial CRUD/refund.
CREATE FUNCTION erp.guard_course_sale_cash() RETURNS trigger LANGUAGE plpgsql SET search_path=erp,pg_catalog AS $cash$
BEGIN
 IF TG_TABLE_NAME='refund_adjustments' THEN
  IF EXISTS (SELECT 1 FROM erp.payments WHERE course_sale_id IS NOT NULL AND (id=NEW.payment_id OR student_id=NEW.student_id)) THEN
   RAISE EXCEPTION 'Admission sale cash cannot be refunded through this flow';
  END IF;
  RETURN NEW;
 END IF;
 IF OLD.course_sale_id IS NOT NULL THEN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Admission sale cash must be retained'; END IF;
  IF ROW(OLD.amount,OLD.paid_at,OLD.student_id,OLD.course_sale_id,OLD.receipt_purpose) IS DISTINCT FROM ROW(NEW.amount,NEW.paid_at,NEW.student_id,NEW.course_sale_id,NEW.receipt_purpose) THEN
   RAISE EXCEPTION 'Admission sale cash facts are immutable';
  END IF;
 END IF;
 RETURN NEW;
END $cash$;
CREATE TRIGGER course_sale_cash_guard BEFORE UPDATE OR DELETE ON erp.payments FOR EACH ROW EXECUTE FUNCTION erp.guard_course_sale_cash();
CREATE TRIGGER course_sale_refund_guard BEFORE INSERT OR UPDATE ON erp.refund_adjustments FOR EACH ROW EXECUTE FUNCTION erp.guard_course_sale_cash();

COMMIT;
