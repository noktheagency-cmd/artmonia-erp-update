-- A phone number identifies a household contact channel, not a unique person.
-- Keep equality lookup indexed while allowing siblings/family members to use it.
CREATE INDEX IF NOT EXISTS "contacts_phone_normalized_idx"
ON "erp"."contacts"("phone_normalized");

DROP INDEX IF EXISTS "erp"."contacts_phone_normalized_key";
