-- Remove duplicate current-month invoices created when a fully paid student was
-- activated by being added to a group after the payment had already been recorded.
DELETE FROM "erp"."invoices" AS duplicate_invoice
WHERE duplicate_invoice."period_month" = date_trunc('month', current_date)::date
  AND duplicate_invoice."balance_due" > 0
  AND EXISTS (
    SELECT 1
    FROM "erp"."invoices" AS paid_invoice
    WHERE paid_invoice."student_id" = duplicate_invoice."student_id"
      AND paid_invoice."period_month" = duplicate_invoice."period_month"
      AND paid_invoice."id" <> duplicate_invoice."id"
      AND paid_invoice."status" <> 'VOID'::"erp"."InvoiceStatus"
      AND paid_invoice."balance_due" = 0
  );

-- Reconcile any remaining current-month invoice with payments recorded for that
-- same month. This repairs data created before invoice activation was idempotent.
WITH monthly_payments AS (
  SELECT
    payment."student_id",
    date_trunc('month', payment."paid_at")::date AS "period_month",
    SUM(payment."amount") AS "paid_amount"
  FROM "erp"."payments" AS payment
  GROUP BY payment."student_id", date_trunc('month', payment."paid_at")::date
)
UPDATE "erp"."invoices" AS invoice
SET
  "balance_due" = greatest(invoice."amount" - monthly_payments."paid_amount", 0),
  "status" = CASE
    WHEN monthly_payments."paid_amount" >= invoice."amount"
      THEN 'PAID'::"erp"."InvoiceStatus"
    WHEN monthly_payments."paid_amount" > 0
      THEN 'PARTIAL'::"erp"."InvoiceStatus"
    ELSE invoice."status"
  END,
  "updated_at" = now()
FROM monthly_payments
WHERE invoice."student_id" = monthly_payments."student_id"
  AND invoice."period_month" = monthly_payments."period_month"
  AND invoice."status" <> 'VOID'::"erp"."InvoiceStatus";
