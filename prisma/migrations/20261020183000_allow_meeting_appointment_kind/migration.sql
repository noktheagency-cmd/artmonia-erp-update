ALTER TABLE erp.crm_appointments DROP CONSTRAINT IF EXISTS crm_appointment_values;

ALTER TABLE erp.crm_appointments ADD CONSTRAINT crm_appointment_values CHECK (
  kind IN ('MEETING', 'CONSULTATION', 'TRIAL')
  AND outcome IN ('SCHEDULED', 'ATTENDED', 'NO_SHOW', 'CANCELLED', 'RESCHEDULED')
);
