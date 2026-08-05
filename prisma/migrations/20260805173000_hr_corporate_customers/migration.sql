CREATE TYPE "erp"."HrCorporateCustomerStatus" AS ENUM ('ACTIVE', 'POTENTIAL', 'PAUSED', 'INACTIVE');

CREATE TABLE "erp"."hr_corporate_customers" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "tax_id" TEXT,
  "status" "erp"."HrCorporateCustomerStatus" NOT NULL DEFAULT 'ACTIVE',
  "monthly_budget" DECIMAL(14,2) NOT NULL,
  "contract_value" DECIMAL(14,2),
  "note" TEXT,
  "created_by_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "hr_corporate_customers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "hr_corporate_customers_monthly_budget_check" CHECK ("monthly_budget" > 0),
  CONSTRAINT "hr_corporate_customers_contract_value_check" CHECK ("contract_value" IS NULL OR "contract_value" >= 0)
);

CREATE TABLE "erp"."hr_corporate_contacts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "customer_id" UUID NOT NULL,
  "full_name" TEXT NOT NULL,
  "position" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "is_primary" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "hr_corporate_contacts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "hr_corporate_contacts_channel_check" CHECK (
    NULLIF(BTRIM(COALESCE("phone", '')), '') IS NOT NULL
    OR NULLIF(BTRIM(COALESCE("email", '')), '') IS NOT NULL
  )
);

CREATE UNIQUE INDEX "hr_corporate_customers_tax_id_key" ON "erp"."hr_corporate_customers"("tax_id");
CREATE INDEX "hr_corporate_customers_status_updated_at_idx" ON "erp"."hr_corporate_customers"("status", "updated_at");
CREATE INDEX "hr_corporate_customers_name_idx" ON "erp"."hr_corporate_customers"("name");
CREATE INDEX "hr_corporate_customers_created_by_id_idx" ON "erp"."hr_corporate_customers"("created_by_id");
CREATE INDEX "hr_corporate_contacts_customer_id_is_primary_idx" ON "erp"."hr_corporate_contacts"("customer_id", "is_primary");
CREATE INDEX "hr_corporate_contacts_email_idx" ON "erp"."hr_corporate_contacts"("email");
CREATE UNIQUE INDEX "hr_corporate_contacts_one_primary_per_customer"
  ON "erp"."hr_corporate_contacts"("customer_id")
  WHERE "is_primary" = true;

ALTER TABLE "erp"."hr_corporate_customers"
  ADD CONSTRAINT "hr_corporate_customers_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "erp"."users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "erp"."hr_corporate_contacts"
  ADD CONSTRAINT "hr_corporate_contacts_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "erp"."hr_corporate_customers"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "erp"."hr_corporate_customers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "erp"."hr_corporate_contacts" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "erp"."hr_corporate_customers", "erp"."hr_corporate_contacts" FROM anon, authenticated;

INSERT INTO "erp"."permissions" ("id", "code", "description") VALUES
  (gen_random_uuid(), 'hr.corporate.read', 'Read corporate customer companies and contacts'),
  (gen_random_uuid(), 'hr.corporate.manage', 'Create, update, and delete corporate customer companies')
ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description";

INSERT INTO "erp"."role_permissions" ("role_id", "permission_id", "scope")
SELECT r.id, p.id, 'ALL'::"erp"."PermissionScope"
FROM "erp"."roles" r
JOIN "erp"."permissions" p ON p.code IN ('hr.corporate.read', 'hr.corporate.manage')
WHERE r.code IN ('SUPER_ADMIN', 'OWNER', 'ADMIN')
ON CONFLICT ("role_id", "permission_id") DO UPDATE SET "scope" = EXCLUDED."scope";

INSERT INTO "erp"."role_permissions" ("role_id", "permission_id", "scope")
SELECT r.id, p.id, 'ALL'::"erp"."PermissionScope"
FROM "erp"."roles" r
JOIN "erp"."permissions" p ON p.code = 'hr.corporate.read'
WHERE r.code IN ('FINANCE', 'AUDITOR')
ON CONFLICT ("role_id", "permission_id") DO UPDATE SET "scope" = EXCLUDED."scope";

