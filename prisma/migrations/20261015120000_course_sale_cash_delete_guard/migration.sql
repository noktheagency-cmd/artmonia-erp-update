-- Keep admission cash immutable while allowing existing non-admission deletion flows.
CREATE OR REPLACE FUNCTION erp.guard_course_sale_cash() RETURNS trigger LANGUAGE plpgsql SET search_path=erp,pg_catalog AS $cash$
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
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $cash$;
