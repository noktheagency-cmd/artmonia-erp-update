-- Reconcile the scheduler with payment entry points: active, already-started
-- packages, period-aware fees, payment-day overrides and historical freeze rules.
-- No historical invoice backfill or existing ledger rewrite is performed here.
CREATE OR REPLACE FUNCTION erp.materialize_due_student_invoices(
  as_of_date date DEFAULT ((now() AT TIME ZONE 'Asia/Baku')::date)
) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE created_count integer := 0;
BEGIN
  IF as_of_date IS NULL THEN RAISE EXCEPTION 'Billing materialization date is required'; END IF;
  IF NOT pg_try_advisory_xact_lock(hashtextextended('erp.materialize-due-student-invoices',0)) THEN RETURN 0; END IF;
  WITH candidates AS (
    SELECT s.id student_id, s.code student_code, e.id enrollment_id,
      date_trunc('month',as_of_date)::date period_month,
      erp.student_payment_due_date(s.id,date_trunc('month',as_of_date)::date) due_date,
      erp.enrollment_billing_amount(e.id,date_trunc('month',as_of_date)::date) amount
    FROM erp.students s JOIN erp.enrollments e ON e.student_id=s.id
    WHERE s.lifecycle_status IN ('ACTIVE'::erp."StudentLifecycleStatus",'FROZEN'::erp."StudentLifecycleStatus")
      AND NOT s.billing_paused AND NOT s.is_test_data AND s.billing_anchor_date IS NOT NULL
      AND e.status='ACTIVE'::erp."EnrollmentStatus"
      AND e.start_date<=as_of_date AND s.billing_anchor_date<=as_of_date
      AND erp.enrollment_billing_amount(e.id,date_trunc('month',as_of_date)::date)>0
      AND erp.student_payment_due_date(s.id,date_trunc('month',as_of_date)::date)<=as_of_date
      AND erp.student_is_billable_on_date(s.id,greatest(e.start_date,
        erp.billing_date_for_month(s.billing_anchor_date,date_trunc('month',as_of_date)::date)))
  ), inserted AS (
    INSERT INTO erp.invoices(id,student_id,enrollment_id,period_month,issue_date,due_date,
      amount,balance_due,status,idempotency_key,created_at,updated_at)
    SELECT gen_random_uuid(),c.student_id,c.enrollment_id,c.period_month,c.due_date,c.due_date,
      c.amount,c.amount,CASE WHEN c.due_date<as_of_date THEN 'OVERDUE'::erp."InvoiceStatus" ELSE 'OPEN'::erp."InvoiceStatus" END,
      concat('billing-auto-',c.student_code,'-',c.enrollment_id,'-',c.period_month),now(),now()
    FROM candidates c
    ON CONFLICT(student_id,enrollment_id,period_month)
      WHERE enrollment_id IS NOT NULL AND status<>'VOID'::erp."InvoiceStatus"
    DO NOTHING RETURNING id,student_id,enrollment_id,period_month,due_date,amount
  ), audited AS (
    INSERT INTO erp.audit_logs(id,action,entity_type,entity_id,after_json,reason,created_at)
    SELECT gen_random_uuid(),'student.billing_cycle.materialize','student',i.student_id,
      jsonb_build_object('invoiceId',i.id,'enrollmentId',i.enrollment_id,'periodMonth',i.period_month,'dueDate',i.due_date,'amount',i.amount),
      'Cari aktiv paket, dövrün tarifi və təsdiqlənmiş ödəniş günü üzrə avtomatik aylıq faktura',now()
    FROM inserted i RETURNING 1
  ) SELECT count(*)::integer INTO created_count FROM audited;
  UPDATE erp.invoices i SET status=CASE
      WHEN i.balance_due<i.amount THEN 'PARTIAL'::erp."InvoiceStatus"
      WHEN i.due_date<as_of_date THEN 'OVERDUE'::erp."InvoiceStatus" ELSE 'OPEN'::erp."InvoiceStatus" END,updated_at=now()
    WHERE i.status<>'VOID'::erp."InvoiceStatus" AND i.balance_due>0
      AND i.status IS DISTINCT FROM CASE WHEN i.balance_due<i.amount THEN 'PARTIAL'::erp."InvoiceStatus"
        WHEN i.due_date<as_of_date THEN 'OVERDUE'::erp."InvoiceStatus" ELSE 'OPEN'::erp."InvoiceStatus" END;
  RETURN created_count;
END;
$$;
REVOKE ALL ON FUNCTION erp.materialize_due_student_invoices(date) FROM PUBLIC,anon,authenticated;
