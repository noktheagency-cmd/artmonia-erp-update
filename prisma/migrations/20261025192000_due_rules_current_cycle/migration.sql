-- A new actual billing cycle does not inherit a previous cycle's due-day override.
-- Historical month queries retain their own rules; no rule history is deleted.
CREATE OR REPLACE FUNCTION erp.student_payment_due_date(target_student_id uuid,target_month date)
RETURNS date LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT CASE WHEN r.due_day IS NULL THEN erp.billing_date_for_month(s.billing_anchor_date,target_month)
    ELSE date_trunc('month',target_month)::date + (
      least(r.due_day,extract(day FROM (date_trunc('month',target_month)+interval '1 month - 1 day'))::integer)-1
    ) END
  FROM erp.students s LEFT JOIN LATERAL (
    SELECT r.due_day FROM erp.student_due_date_rules r
    WHERE r.student_id=s.id
      AND (date_trunc('month',target_month)::date < date_trunc('month',s.billing_anchor_date)::date
        OR r.effective_month>=date_trunc('month',s.billing_anchor_date)::date)
      AND ((r.mode='ONLY_MONTH' AND r.effective_month=date_trunc('month',target_month)::date)
        OR (r.mode='FROM_MONTH' AND r.effective_month<=date_trunc('month',target_month)::date))
    ORDER BY r.version DESC LIMIT 1
  ) r ON true WHERE s.id=target_student_id;
$$;
REVOKE ALL ON FUNCTION erp.student_payment_due_date(uuid,date) FROM PUBLIC,anon,authenticated;
