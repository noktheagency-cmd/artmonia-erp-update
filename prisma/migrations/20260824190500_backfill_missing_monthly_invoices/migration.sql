WITH current_enrollment AS (
  SELECT DISTINCT ON (e.student_id)
    e.student_id,
    e.id AS enrollment_id,
    e.start_date,
    COALESCE(e.first_lesson_at, e.start_date) AS billing_anchor,
    e.monthly_fee
  FROM "erp"."enrollments" e
  JOIN "erp"."students" s ON s.id = e.student_id
  WHERE e.status IN (
      'ACTIVE'::"erp"."EnrollmentStatus",
      'PAUSED'::"erp"."EnrollmentStatus"
    )
    AND s.lifecycle_status IN (
      'ACTIVE'::"erp"."StudentLifecycleStatus",
      'DEBT'::"erp"."StudentLifecycleStatus"
    )
    AND s.billing_paused = false
  ORDER BY e.student_id, e.start_date DESC, e.created_at DESC
), evidence AS (
  SELECT
    ce.*,
    GREATEST(
      date_trunc('month', ce.start_date)::date,
      LEAST(
        COALESCE((
          SELECT min(i.period_month)
          FROM "erp"."invoices" i
          WHERE i.student_id = ce.student_id
            AND i.status <> 'VOID'::"erp"."InvoiceStatus"
        ), (date_trunc('month', current_date) + interval '1 month')::date),
        COALESCE((
          SELECT min(p.payment_month)
          FROM "erp"."payments" p
          WHERE p.student_id = ce.student_id
            AND p.schedule_type = 'MONTHLY'::"erp"."PaymentScheduleType"
        ), (date_trunc('month', current_date) + interval '1 month')::date)
      )
    ) AS first_billing_month
  FROM current_enrollment ce
), gaps AS (
  SELECT
    e.student_id,
    e.enrollment_id,
    s.code AS student_code,
    billing_month.period_month::date AS period_month,
    (
      billing_month.period_month
      + (
        LEAST(
          extract(day FROM e.billing_anchor)::int,
          extract(day FROM (billing_month.period_month + interval '1 month' - interval '1 day'))::int
        ) - 1
      ) * interval '1 day'
    )::date AS due_date,
    e.monthly_fee AS amount,
    GREATEST(e.monthly_fee - COALESCE((
      SELECT sum(p.amount)
      FROM "erp"."payments" p
      WHERE p.student_id = e.student_id
        AND p.schedule_type = 'MONTHLY'::"erp"."PaymentScheduleType"
        AND date_trunc('month', p.payment_month) = billing_month.period_month
    ), 0), 0) AS balance_due
  FROM evidence e
  JOIN "erp"."students" s ON s.id = e.student_id
  CROSS JOIN LATERAL generate_series(
    e.first_billing_month,
    date_trunc('month', current_date)::date,
    interval '1 month'
  ) AS billing_month(period_month)
  WHERE NOT EXISTS (
    SELECT 1
    FROM "erp"."invoices" i
    WHERE i.student_id = e.student_id
      AND i.status <> 'VOID'::"erp"."InvoiceStatus"
      AND date_trunc('month', i.period_month) = billing_month.period_month
  )
)
INSERT INTO "erp"."invoices" (
  "id",
  "student_id",
  "enrollment_id",
  "period_month",
  "issue_date",
  "due_date",
  "amount",
  "balance_due",
  "status",
  "idempotency_key",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid(),
  g.student_id,
  g.enrollment_id,
  g.period_month,
  g.due_date,
  g.due_date,
  g.amount,
  g.balance_due,
  CASE
    WHEN g.due_date < current_date THEN 'OVERDUE'::"erp"."InvoiceStatus"
    WHEN g.balance_due < g.amount THEN 'PARTIAL'::"erp"."InvoiceStatus"
    ELSE 'OPEN'::"erp"."InvoiceStatus"
  END,
  'student-gap-' || g.student_code || '-' || to_char(g.period_month, 'YYYY-MM-DD'),
  now(),
  now()
FROM gaps g
WHERE g.balance_due > 0
ON CONFLICT ("idempotency_key") DO NOTHING;
