ALTER TABLE "erp"."hr_corporate_contacts"
  ADD COLUMN "user_id" UUID;

CREATE UNIQUE INDEX "hr_corporate_contacts_user_id_key"
  ON "erp"."hr_corporate_contacts"("user_id");

ALTER TABLE "erp"."hr_corporate_contacts"
  ADD CONSTRAINT "hr_corporate_contacts_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "erp"."users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
