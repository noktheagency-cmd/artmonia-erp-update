-- Separate academic lifecycle from financial state and introduce anchored billing cycles.

ALTER TABLE erp.students
  ADD COLUMN IF NOT EXISTS billing_anchor_date date;

WITH anchors AS (
  SELECT
    s.id AS student_id,
    min(e.first_lesson_at) FILTER (WHERE e.first_lesson_at IS NOT NULL) AS first_lesson_date
  FROM erp.students s
  LEFT JOIN erp.enrollments e ON e.student_id = s.id
  GROUP BY s.id
), changed AS (
  UPDATE erp.students s
  SET billing_anchor_date = anchors.first_lesson_date
  FROM anchors
  WHERE anchors.student_id = s.id
    AND s.billing_anchor_date IS DISTINCT FROM anchors.first_lesson_date
  RETURNING s.id, anchors.first_lesson_date
)
INSERT INTO erp.audit_logs (
  id,
  action,
  entity_type,
  entity_id,
  before_json,
  after_json,
  reason,
  created_at
)
SELECT
  gen_random_uuid(),
  'student.billing_anchor.backfill',
  'student',
  changed.id,
  jsonb_build_object('billingAnchorDate', NULL),
  jsonb_build_object('billingAnchorDate', changed.first_lesson_date),
  'Billing anchor first confirmed lesson date-dən backfill edildi',
  now()
FROM changed;

-- DEBT is not an academic lifecycle state. Existing rows are normalized before
-- replacing the enum so no application path can write DEBT again.
INSERT INTO erp.audit_logs (
  id,
  action,
  entity_type,
  entity_id,
  before_json,
  after_json,
  reason,
  created_at
)
SELECT
  gen_random_uuid(),
  'student.lifecycle.debt_migration',
  'student',
  s.id,
  jsonb_build_object('lifecycleStatus', 'DEBT'),
  jsonb_build_object('lifecycleStatus', 'ACTIVE'),
  'DEBT maliyyə göstəricisinə ayrıldığı üçün akademik status ACTIVE edildi',
  now()
FROM erp.students s
WHERE s.lifecycle_status::text = 'DEBT';

UPDATE erp.students
SET lifecycle_status = 'ACTIVE'::erp."StudentLifecycleStatus"
WHERE lifecycle_status::text = 'DEBT';

UPDATE erp.student_status_history
SET old_status = 'ACTIVE'::erp."StudentLifecycleStatus"
WHERE old_status::text = 'DEBT';

UPDATE erp.student_status_history
SET new_status = 'ACTIVE'::erp."StudentLifecycleStatus"
WHERE new_status::text = 'DEBT';

-- The partial index embeds an enum-typed ACTIVE literal. Recreate it after the
-- enum swap so PostgreSQL does not compare the legacy and replacement types.
DROP INDEX IF EXISTS erp.students_active_id_idx;

ALTER TYPE erp."StudentLifecycleStatus" RENAME TO "StudentLifecycleStatus_legacy";
CREATE TYPE erp."StudentLifecycleStatus" AS ENUM (
  'SLOT_WAITING',
  'ACTIVE',
  'FROZEN',
  'STOPPED',
  'DECLINED',
  'COMPLETED'
);

ALTER TABLE erp.students ALTER COLUMN lifecycle_status DROP DEFAULT;
ALTER TABLE erp.students
  ALTER COLUMN lifecycle_status TYPE erp."StudentLifecycleStatus"
  USING lifecycle_status::text::erp."StudentLifecycleStatus";
ALTER TABLE erp.students
  ALTER COLUMN lifecycle_status SET DEFAULT 'SLOT_WAITING'::erp."StudentLifecycleStatus";

ALTER TABLE erp.student_status_history
  ALTER COLUMN old_status TYPE erp."StudentLifecycleStatus"
  USING old_status::text::erp."StudentLifecycleStatus";
ALTER TABLE erp.student_status_history
  ALTER COLUMN new_status TYPE erp."StudentLifecycleStatus"
  USING new_status::text::erp."StudentLifecycleStatus";

DROP TYPE erp."StudentLifecycleStatus_legacy";

CREATE INDEX students_active_id_idx
  ON erp.students (id)
  WHERE lifecycle_status = 'ACTIVE'::erp."StudentLifecycleStatus";

CREATE OR REPLACE FUNCTION erp.billing_date_for_month(anchor_date date, target_month date)
RETURNS date
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
  SELECT make_date(
    extract(year FROM target_month)::int,
    extract(month FROM target_month)::int,
    least(
      extract(day FROM anchor_date)::int,
      extract(day FROM (date_trunc('month', target_month) + interval '1 month - 1 day'))::int
    )
  );
$$;

REVOKE ALL ON FUNCTION erp.billing_date_for_month(date, date) FROM PUBLIC, anon, authenticated;

CREATE TABLE erp.student_billing_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES erp.students(id) ON DELETE CASCADE,
  enrollment_id uuid NOT NULL REFERENCES erp.enrollments(id) ON DELETE CASCADE,
  invoice_id uuid UNIQUE REFERENCES erp.invoices(id) ON DELETE SET NULL,
  payment_id uuid REFERENCES erp.payments(id) ON DELETE SET NULL,
  cycle_start date NOT NULL,
  cycle_end date NOT NULL,
  due_date date NOT NULL,
  amount numeric(12, 2) NOT NULL CHECK (amount >= 0),
  status erp."InvoiceStatus" NOT NULL DEFAULT 'OPEN'::erp."InvoiceStatus",
  paid_at date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_billing_cycles_period_check CHECK (cycle_end >= cycle_start),
  CONSTRAINT student_billing_cycles_enrollment_start_key UNIQUE (enrollment_id, cycle_start)
);

CREATE INDEX student_billing_cycles_student_status_due_idx
  ON erp.student_billing_cycles(student_id, status, due_date);
CREATE INDEX student_billing_cycles_payment_id_idx
  ON erp.student_billing_cycles(payment_id);

CREATE TABLE erp.student_billing_migration_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL UNIQUE REFERENCES erp.students(id) ON DELETE CASCADE,
  old_next_payment_at date,
  billing_anchor_date date,
  proposed_next_payment_at date,
  mismatch boolean NOT NULL DEFAULT false,
  issue_reason text,
  review_status text NOT NULL DEFAULT 'PENDING',
  reviewed_by_id uuid REFERENCES erp.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_billing_migration_review_status_check
    CHECK (review_status IN ('PENDING', 'APPROVED', 'APPLIED', 'REJECTED'))
);

CREATE INDEX student_billing_migration_reviews_mismatch_status_idx
  ON erp.student_billing_migration_reviews(mismatch, review_status);
CREATE INDEX student_billing_migration_reviews_reviewer_idx
  ON erp.student_billing_migration_reviews(reviewed_by_id);

-- Existing invoices are the source of truth for historic cycles.
INSERT INTO erp.student_billing_cycles (
  student_id,
  enrollment_id,
  invoice_id,
  payment_id,
  cycle_start,
  cycle_end,
  due_date,
  amount,
  status,
  paid_at
)
SELECT
  i.student_id,
  i.enrollment_id,
  i.id,
  paid.payment_id,
  i.due_date,
  erp.billing_date_for_month(i.due_date, (date_trunc('month', i.due_date) + interval '1 month')::date) - 1,
  i.due_date,
  i.amount,
  i.status,
  CASE WHEN i.status = 'PAID'::erp."InvoiceStatus" THEN paid.paid_at END
FROM erp.invoices i
LEFT JOIN LATERAL (
  SELECT p.id AS payment_id, p.paid_at
  FROM erp.payment_allocations pa
  JOIN erp.payments p ON p.id = pa.payment_id
  WHERE pa.invoice_id = i.id
  ORDER BY p.paid_at DESC, p.created_at DESC
  LIMIT 1
) paid ON true
WHERE i.enrollment_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Comparison report: the legacy manually persisted date is retained only as
-- evidence. New application reads must use the oldest open billing cycle.
WITH migration_rows AS (
  SELECT
    s.id AS student_id,
    s.billing_anchor_date,
    legacy.old_next_payment_at,
    coalesce(
      open_cycle.due_date,
      CASE
        WHEN s.billing_anchor_date IS NULL THEN NULL
        ELSE erp.billing_date_for_month(
          s.billing_anchor_date,
          (date_trunc('month', coalesce(last_payment.payment_month, current_date)) + interval '1 month')::date
        )
      END
    ) AS proposed_next_payment_at
  FROM erp.students s
  LEFT JOIN LATERAL (
    SELECT p.next_payment_at AS old_next_payment_at
    FROM erp.payments p
    WHERE p.student_id = s.id
      AND p.next_payment_at IS NOT NULL
    ORDER BY p.paid_at DESC, p.created_at DESC
    LIMIT 1
  ) legacy ON true
  LEFT JOIN LATERAL (
    SELECT min(c.due_date) AS due_date
    FROM erp.student_billing_cycles c
    WHERE c.student_id = s.id
      AND c.status IN (
        'DRAFT'::erp."InvoiceStatus",
        'OPEN'::erp."InvoiceStatus",
        'PARTIAL'::erp."InvoiceStatus",
        'OVERDUE'::erp."InvoiceStatus"
      )
  ) open_cycle ON true
  LEFT JOIN LATERAL (
    SELECT p.payment_month
    FROM erp.payments p
    WHERE p.student_id = s.id
      AND p.schedule_type = 'MONTHLY'::erp."PaymentScheduleType"
    ORDER BY p.payment_month DESC, p.paid_at DESC, p.created_at DESC
    LIMIT 1
  ) last_payment ON true
)
INSERT INTO erp.student_billing_migration_reviews (
  student_id,
  old_next_payment_at,
  billing_anchor_date,
  proposed_next_payment_at,
  mismatch,
  issue_reason,
  review_status
)
SELECT
  student_id,
  old_next_payment_at,
  billing_anchor_date,
  proposed_next_payment_at,
  old_next_payment_at IS DISTINCT FROM proposed_next_payment_at,
  CASE
    WHEN billing_anchor_date IS NULL THEN 'MISSING_FIRST_LESSON_DATE'
    WHEN old_next_payment_at IS DISTINCT FROM proposed_next_payment_at THEN 'LEGACY_DATE_MISMATCH'
    ELSE NULL
  END,
  CASE
    WHEN billing_anchor_date IS NULL OR old_next_payment_at IS DISTINCT FROM proposed_next_payment_at
      THEN 'PENDING'
    ELSE 'APPLIED'
  END
FROM migration_rows;

CREATE OR REPLACE FUNCTION erp.sync_student_billing_cycle_from_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  latest_payment_id uuid;
  latest_paid_at date;
BEGIN
  IF NEW.enrollment_id IS NULL OR NEW.status = 'VOID'::erp."InvoiceStatus" THEN
    IF NEW.status = 'VOID'::erp."InvoiceStatus" THEN
      DELETE FROM erp.student_billing_cycles WHERE invoice_id = NEW.id;
    END IF;
    RETURN NEW;
  END IF;

  SELECT p.id, p.paid_at
  INTO latest_payment_id, latest_paid_at
  FROM erp.payment_allocations pa
  JOIN erp.payments p ON p.id = pa.payment_id
  WHERE pa.invoice_id = NEW.id
  ORDER BY p.paid_at DESC, p.created_at DESC
  LIMIT 1;

  INSERT INTO erp.student_billing_cycles (
    student_id,
    enrollment_id,
    invoice_id,
    payment_id,
    cycle_start,
    cycle_end,
    due_date,
    amount,
    status,
    paid_at
  ) VALUES (
    NEW.student_id,
    NEW.enrollment_id,
    NEW.id,
    latest_payment_id,
    NEW.due_date,
    erp.billing_date_for_month(NEW.due_date, (date_trunc('month', NEW.due_date) + interval '1 month')::date) - 1,
    NEW.due_date,
    NEW.amount,
    NEW.status,
    CASE WHEN NEW.status = 'PAID'::erp."InvoiceStatus" THEN latest_paid_at END
  )
  ON CONFLICT (invoice_id) DO UPDATE SET
    payment_id = EXCLUDED.payment_id,
    cycle_start = EXCLUDED.cycle_start,
    cycle_end = EXCLUDED.cycle_end,
    due_date = EXCLUDED.due_date,
    amount = EXCLUDED.amount,
    status = EXCLUDED.status,
    paid_at = EXCLUDED.paid_at,
    updated_at = now();

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION erp.sync_student_billing_cycle_from_invoice() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER sync_student_billing_cycle_from_invoice_trigger
AFTER INSERT OR UPDATE OF amount, balance_due, due_date, status
ON erp.invoices
FOR EACH ROW
EXECUTE FUNCTION erp.sync_student_billing_cycle_from_invoice();

CREATE OR REPLACE FUNCTION erp.audit_student_billing_anchor_date()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  actor_id uuid;
BEGIN
  IF OLD.billing_anchor_date IS NOT NULL
     AND NEW.billing_anchor_date IS DISTINCT FROM OLD.billing_anchor_date
     AND coalesce(current_setting('app.allow_billing_anchor_update', true), 'off') <> 'on' THEN
    RAISE EXCEPTION 'billing_anchor_date is protected; use the approved billing migration workflow';
  END IF;

  IF NEW.billing_anchor_date IS DISTINCT FROM OLD.billing_anchor_date THEN
    actor_id := nullif(current_setting('app.actor_user_id', true), '')::uuid;
    INSERT INTO erp.audit_logs (
      id,
      actor_user_id,
      action,
      entity_type,
      entity_id,
      before_json,
      after_json,
      reason,
      created_at
    ) VALUES (
      gen_random_uuid(),
      actor_id,
      'student.billing_anchor.update',
      'student',
      NEW.id,
      jsonb_build_object('billingAnchorDate', OLD.billing_anchor_date),
      jsonb_build_object('billingAnchorDate', NEW.billing_anchor_date),
      'Protected billing anchor date changed',
      now()
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION erp.audit_student_billing_anchor_date() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER audit_student_billing_anchor_date_trigger
BEFORE UPDATE OF billing_anchor_date
ON erp.students
FOR EACH ROW
EXECUTE FUNCTION erp.audit_student_billing_anchor_date();

ALTER TABLE erp.student_billing_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp.student_billing_migration_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE erp.student_billing_cycles FROM anon, authenticated;
REVOKE ALL ON TABLE erp.student_billing_migration_reviews FROM anon, authenticated;
