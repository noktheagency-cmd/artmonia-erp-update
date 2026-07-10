ALTER TABLE "erp"."workshop_participants"
ADD COLUMN "cancelled_at" TIMESTAMP(3),
ADD COLUMN "cancelled_by_id" UUID,
ADD COLUMN "cancel_reason" TEXT;

CREATE TABLE "erp"."workshop_payments" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "participant_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paid_at" DATE NOT NULL,
    "method" "erp"."PaymentMethod" NOT NULL DEFAULT 'CASH',
    "payer_name" TEXT,
    "receipt_file_name" TEXT,
    "receipt_file_path" TEXT,
    "receipt_reference" TEXT,
    "note" TEXT,
    "idempotency_key" TEXT,
    "created_by_id" UUID,
    "voided_at" TIMESTAMP(3),
    "voided_by_id" UUID,
    "void_reason" TEXT,
    "replaces_payment_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workshop_payments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "workshop_payments_amount_positive" CHECK ("amount" > 0)
);

CREATE UNIQUE INDEX "workshop_payments_idempotency_key_key"
ON "erp"."workshop_payments"("idempotency_key");
CREATE UNIQUE INDEX "workshop_payments_replaces_payment_id_key"
ON "erp"."workshop_payments"("replaces_payment_id");
CREATE INDEX "workshop_payments_event_id_paid_at_idx"
ON "erp"."workshop_payments"("event_id", "paid_at");
CREATE INDEX "workshop_payments_participant_id_paid_at_idx"
ON "erp"."workshop_payments"("participant_id", "paid_at");
CREATE INDEX "workshop_payments_voided_at_idx"
ON "erp"."workshop_payments"("voided_at");
CREATE INDEX "workshop_payments_created_by_id_idx"
ON "erp"."workshop_payments"("created_by_id");
CREATE INDEX "workshop_payments_voided_by_id_idx"
ON "erp"."workshop_payments"("voided_by_id");

ALTER TABLE "erp"."workshop_participants"
ADD CONSTRAINT "workshop_participants_cancelled_by_id_fkey"
FOREIGN KEY ("cancelled_by_id") REFERENCES "erp"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "erp"."workshop_payments"
ADD CONSTRAINT "workshop_payments_event_id_fkey"
FOREIGN KEY ("event_id") REFERENCES "erp"."workshop_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "erp"."workshop_payments"
ADD CONSTRAINT "workshop_payments_participant_id_fkey"
FOREIGN KEY ("participant_id") REFERENCES "erp"."workshop_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "erp"."workshop_payments"
ADD CONSTRAINT "workshop_payments_created_by_id_fkey"
FOREIGN KEY ("created_by_id") REFERENCES "erp"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "erp"."workshop_payments"
ADD CONSTRAINT "workshop_payments_voided_by_id_fkey"
FOREIGN KEY ("voided_by_id") REFERENCES "erp"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "erp"."workshop_payments"
ADD CONSTRAINT "workshop_payments_replaces_payment_id_fkey"
FOREIGN KEY ("replaces_payment_id") REFERENCES "erp"."workshop_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "workshop_participants_event_id_cancelled_at_idx"
ON "erp"."workshop_participants"("event_id", "cancelled_at");
CREATE INDEX "workshop_participants_cancelled_by_id_idx"
ON "erp"."workshop_participants"("cancelled_by_id");

ALTER TABLE "erp"."finance_expenses"
ADD COLUMN "workshop_event_id" UUID,
ADD COLUMN "voided_at" TIMESTAMP(3),
ADD COLUMN "voided_by_id" UUID,
ADD COLUMN "void_reason" TEXT,
ADD COLUMN "replaces_expense_id" UUID;

CREATE UNIQUE INDEX "finance_expenses_replaces_expense_id_key"
ON "erp"."finance_expenses"("replaces_expense_id");
CREATE INDEX "finance_expenses_workshop_event_id_expense_date_idx"
ON "erp"."finance_expenses"("workshop_event_id", "expense_date");
CREATE INDEX "finance_expenses_voided_at_idx"
ON "erp"."finance_expenses"("voided_at");
CREATE INDEX "finance_expenses_voided_by_id_idx"
ON "erp"."finance_expenses"("voided_by_id");

ALTER TABLE "erp"."finance_expenses"
ADD CONSTRAINT "finance_expenses_workshop_event_id_fkey"
FOREIGN KEY ("workshop_event_id") REFERENCES "erp"."workshop_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "erp"."finance_expenses"
ADD CONSTRAINT "finance_expenses_voided_by_id_fkey"
FOREIGN KEY ("voided_by_id") REFERENCES "erp"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "erp"."finance_expenses"
ADD CONSTRAINT "finance_expenses_replaces_expense_id_fkey"
FOREIGN KEY ("replaces_expense_id") REFERENCES "erp"."finance_expenses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "erp"."workshop_payments" (
    "id",
    "event_id",
    "participant_id",
    "amount",
    "paid_at",
    "method",
    "payer_name",
    "note",
    "idempotency_key",
    "created_by_id",
    "created_at",
    "updated_at"
)
SELECT
    gen_random_uuid(),
    wp."event_id",
    wp."id",
    wp."amount_paid",
    wp."assigned_at"::date,
    wp."payment_method",
    wp."full_name",
    'Legacy workshop payment backfill',
    'legacy-workshop-participant:' || wp."id"::text,
    wp."assigned_by_id",
    wp."assigned_at",
    wp."updated_at"
FROM "erp"."workshop_participants" wp
WHERE wp."amount_paid" > 0
  AND wp."is_gift" = false
ON CONFLICT ("idempotency_key") DO NOTHING;

DO $$
DECLARE
    legacy_total NUMERIC(18,2);
    ledger_total NUMERIC(18,2);
BEGIN
    SELECT COALESCE(SUM("amount_paid"), 0)
      INTO legacy_total
      FROM "erp"."workshop_participants"
     WHERE "amount_paid" > 0 AND "is_gift" = false;

    SELECT COALESCE(SUM("amount"), 0)
      INTO ledger_total
      FROM "erp"."workshop_payments"
     WHERE "idempotency_key" LIKE 'legacy-workshop-participant:%'
       AND "voided_at" IS NULL;

    IF legacy_total <> ledger_total THEN
        RAISE EXCEPTION 'Workshop payment reconciliation failed: legacy %, ledger %', legacy_total, ledger_total;
    END IF;
END $$;

INSERT INTO "erp"."permissions" ("id", "code", "description")
VALUES
    (gen_random_uuid(), 'workshop.finance.read', 'Workshop və masterclass maliyyəsini görmək'),
    (gen_random_uuid(), 'workshop.finance.manage', 'Workshop və masterclass maliyyə əməliyyatlarını idarə etmək')
ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description";

INSERT INTO "erp"."role_permissions" ("role_id", "permission_id")
SELECT role."id", permission."id"
FROM "erp"."roles" role
JOIN "erp"."permissions" permission
  ON permission."code" IN ('workshop.finance.read', 'workshop.finance.manage')
WHERE role."code" IN ('SUPER_ADMIN'::"erp"."AppRole", 'OWNER'::"erp"."AppRole", 'FINANCE'::"erp"."AppRole")
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

INSERT INTO "erp"."role_permissions" ("role_id", "permission_id")
SELECT role."id", permission."id"
FROM "erp"."roles" role
JOIN "erp"."permissions" permission ON permission."code" = 'workshop.finance.read'
WHERE role."code" IN ('ADMIN'::"erp"."AppRole", 'AUDITOR'::"erp"."AppRole")
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
