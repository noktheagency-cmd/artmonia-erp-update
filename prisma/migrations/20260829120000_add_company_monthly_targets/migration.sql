CREATE TABLE "erp"."company_monthly_targets" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "period_month" DATE NOT NULL,
  "active_students_target" INTEGER NOT NULL,
  "new_sales_target" INTEGER NOT NULL,
  "churn_max_target" INTEGER NOT NULL,
  "lead_target" INTEGER NOT NULL,
  "conversion_target" DECIMAL(5,2) NOT NULL,
  "revenue_target" DECIMAL(14,2) NOT NULL,
  "created_by_id" UUID,
  "updated_by_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "company_monthly_targets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "company_monthly_targets_period_month_check" CHECK (extract(day from "period_month") = 1),
  CONSTRAINT "company_monthly_targets_active_students_check" CHECK ("active_students_target" >= 0),
  CONSTRAINT "company_monthly_targets_new_sales_check" CHECK ("new_sales_target" >= 0),
  CONSTRAINT "company_monthly_targets_churn_max_check" CHECK ("churn_max_target" >= 0),
  CONSTRAINT "company_monthly_targets_lead_check" CHECK ("lead_target" >= 0),
  CONSTRAINT "company_monthly_targets_conversion_check" CHECK ("conversion_target" >= 0 AND "conversion_target" <= 100),
  CONSTRAINT "company_monthly_targets_revenue_check" CHECK ("revenue_target" >= 0)
);

CREATE UNIQUE INDEX "company_monthly_targets_period_month_key"
  ON "erp"."company_monthly_targets"("period_month");
CREATE INDEX "company_monthly_targets_created_by_id_idx"
  ON "erp"."company_monthly_targets"("created_by_id");
CREATE INDEX "company_monthly_targets_updated_by_id_idx"
  ON "erp"."company_monthly_targets"("updated_by_id");

ALTER TABLE "erp"."company_monthly_targets"
  ADD CONSTRAINT "company_monthly_targets_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "erp"."users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "erp"."company_monthly_targets"
  ADD CONSTRAINT "company_monthly_targets_updated_by_id_fkey"
  FOREIGN KEY ("updated_by_id") REFERENCES "erp"."users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "erp"."company_monthly_targets" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "erp"."company_monthly_targets" FROM anon, authenticated;

INSERT INTO "erp"."permissions" ("id", "code", "description") VALUES
  (gen_random_uuid(), 'hr.company_kpi.read', 'Read company monthly KPI targets and actuals'),
  (gen_random_uuid(), 'hr.company_kpi.manage', 'Create and update company monthly KPI targets')
ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description";

INSERT INTO "erp"."role_permissions" ("role_id", "permission_id", "scope")
SELECT r.id, p.id, 'ALL'::"erp"."PermissionScope"
FROM "erp"."roles" r
JOIN "erp"."permissions" p ON p.code IN ('hr.company_kpi.read', 'hr.company_kpi.manage')
WHERE r.code = 'SUPER_ADMIN'::"erp"."AppRole"
ON CONFLICT ("role_id", "permission_id") DO UPDATE SET "scope" = EXCLUDED."scope";

WITH operation_head_roles AS (
  SELECT "id"
  FROM "erp"."roles"
  WHERE lower(trim("name")) = 'operation head'
     OR "key" LIKE 'custom.operation-head.%'
)
INSERT INTO "erp"."role_permissions" ("role_id", "permission_id", "scope")
SELECT r.id, p.id, 'ALL'::"erp"."PermissionScope"
FROM operation_head_roles r
CROSS JOIN "erp"."permissions" p
WHERE p.code = 'hr.company_kpi.read'
ON CONFLICT ("role_id", "permission_id") DO UPDATE SET "scope" = EXCLUDED."scope";
