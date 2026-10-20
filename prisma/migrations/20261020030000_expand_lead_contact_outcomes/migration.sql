-- Align DB check with CRM contact policy outcomes used by the app.
-- Old constraint only allowed TALKED / UNANSWERED, which blocked WhatsApp results.

ALTER TABLE erp.lead_contact_events
  DROP CONSTRAINT IF EXISTS lead_contact_event_values;

ALTER TABLE erp.lead_contact_events
  ADD CONSTRAINT lead_contact_event_values CHECK (
    channel IN ('PHONE', 'WHATSAPP', 'IN_PERSON', 'OTHER')
    AND outcome IN (
      'TALKED',
      'ANSWERED_NO_TALK',
      'UNANSWERED',
      'WHATSAPP_SENT',
      'WHATSAPP_REPLIED'
    )
  );
