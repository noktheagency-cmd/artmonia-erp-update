-- Resolve the displayed next date with the same rule used by invoice writers.
-- Freeze eligibility remains tied to teaching periods, not a negotiated due day.
-- Explicit definition also repairs databases restored with the legacy function.
CREATE OR REPLACE FUNCTION erp.next_unfrozen_billing_date(target_student_id uuid, from_month date)
RETURNS date LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  anchor date;
  month_date date := date_trunc('month', from_month)::date;
  freeze_end date;
  found_freeze boolean;
BEGIN
  SELECT billing_anchor_date INTO anchor FROM erp.students WHERE id = target_student_id;
  IF anchor IS NULL OR month_date IS NULL THEN RETURN NULL; END IF;
  LOOP
    SELECT f.end_date, true INTO freeze_end, found_freeze
    FROM erp.student_freeze_periods f
    WHERE f.student_id = target_student_id
      AND f.start_date <= erp.billing_date_for_month(anchor, month_date)
      AND (f.end_date IS NULL OR f.end_date >= erp.billing_date_for_month(anchor, (month_date + interval '1 month')::date))
    ORDER BY f.start_date LIMIT 1;
    IF NOT coalesce(found_freeze, false) THEN
      RETURN erp.student_payment_due_date(target_student_id, month_date);
    END IF;
    IF freeze_end IS NULL THEN RETURN NULL; END IF;
    month_date := greatest((month_date + interval '1 month')::date, date_trunc('month', freeze_end)::date);
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION erp.next_unfrozen_billing_date(uuid, date) FROM PUBLIC, anon, authenticated;
