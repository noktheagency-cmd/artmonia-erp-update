BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

CREATE TYPE "erp"."FinanceTransactionType" AS ENUM (
  'INCOME',
  'EXPENSE',
  'CAPEX_OUT',
  'FINANCING_IN',
  'FINANCING_OUT'
);

CREATE TYPE "erp"."FinanceFinancialClass" AS ENUM (
  'DIRECT_COST',
  'OPEX',
  'CAPEX',
  'FINANCING',
  'LEGACY_LIABILITY'
);

CREATE TYPE "erp"."FinanceCostCenter" AS ENUM (
  'TEACHING',
  'SALES',
  'MARKETING',
  'OPERATIONS',
  'MANAGEMENT'
);

ALTER TABLE "erp"."finance_expense_categories"
  ADD COLUMN "code" TEXT,
  ADD COLUMN "transaction_type" "erp"."FinanceTransactionType",
  ADD COLUMN "financial_class" "erp"."FinanceFinancialClass",
  ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "requires_staff" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "requires_project" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "erp"."finance_expenses"
  ADD COLUMN "transaction_type" "erp"."FinanceTransactionType" NOT NULL DEFAULT 'EXPENSE',
  ADD COLUMN "financial_class" "erp"."FinanceFinancialClass" NOT NULL DEFAULT 'OPEX',
  ADD COLUMN "cost_center" "erp"."FinanceCostCenter",
  ADD COLUMN "legacy_category_name" TEXT,
  ADD COLUMN "classification_review_required" BOOLEAN NOT NULL DEFAULT false;

INSERT INTO "erp"."finance_expense_categories" (
  "id", "code", "name", "description", "transaction_type", "financial_class",
  "is_active", "is_system", "requires_staff", "requires_project", "created_at", "updated_at"
)
VALUES
  ('f1000000-0000-4000-8000-000000000001', 'REV_TUITION', 'Tədris satışları', 'Tələbə tədris ödənişləri', 'INCOME', NULL, true, true, false, false, now(), now()),
  ('f1000000-0000-4000-8000-000000000002', 'REV_WORKSHOP', 'Workshop gəliri', 'Workshop və masterclass iştirakçı ödənişləri', 'INCOME', NULL, true, true, false, true, now(), now()),
  ('f1000000-0000-4000-8000-000000000101', 'DC_TEACHER_COMP', 'Əməkhaqqı — Müəllimlər', 'Müəllim maaşı və faiz ödənişləri', 'EXPENSE', 'DIRECT_COST', true, true, true, false, now(), now()),
  ('f1000000-0000-4000-8000-000000000102', 'DC_TEACHING_MATERIALS', 'Tədris materialları', 'Dərsə birbaşa sərf olunan materiallar', 'EXPENSE', 'DIRECT_COST', true, true, false, false, now(), now()),
  ('f1000000-0000-4000-8000-000000000201', 'OP_PAYROLL_SALES_ADMIN', 'Əməkhaqqı — Satış və administrasiya', 'Satış, administrasiya və digər inzibati əməkdaşlar', 'EXPENSE', 'OPEX', true, true, true, false, now(), now()),
  ('f1000000-0000-4000-8000-000000000202', 'OP_MANAGEMENT_COMP', 'Rəhbərlik kompensasiyası', 'Şirkətin idarə edilməsinə görə rəhbərlik ödənişi', 'EXPENSE', 'OPEX', true, true, true, false, now(), now()),
  ('f1000000-0000-4000-8000-000000000203', 'OP_BONUS_COMMISSION', 'Bonus və komissiyalar', 'Satış, performans bonusu və komissiyalar', 'EXPENSE', 'OPEX', true, true, true, false, now(), now()),
  ('f1000000-0000-4000-8000-000000000204', 'OP_TAX_GOV', 'Vergi və dövlət ödənişləri', 'Vergi, DSMF, dövlət rüsumları və məcburi ödənişlər', 'EXPENSE', 'OPEX', true, true, false, false, now(), now()),
  ('f1000000-0000-4000-8000-000000000205', 'OP_RENT', 'İcarə', 'Məkan və filial icarəsi', 'EXPENSE', 'OPEX', true, true, false, false, now(), now()),
  ('f1000000-0000-4000-8000-000000000206', 'OP_UTILITIES_COMMS', 'Kommunal və rabitə', 'Elektrik, internet, telefon və kommunal xidmətlər', 'EXPENSE', 'OPEX', true, true, false, false, now(), now()),
  ('f1000000-0000-4000-8000-000000000207', 'OP_OFFICE_DAILY', 'Ofis və gündəlik əməliyyat', 'Kiçik gündəlik ofis xərcləri', 'EXPENSE', 'OPEX', true, true, false, false, now(), now()),
  ('f1000000-0000-4000-8000-000000000208', 'OP_CUSTOMER_EXPERIENCE', 'Müştəri təcrübəsi', 'Qonaq və welcome materialları', 'EXPENSE', 'OPEX', true, true, false, false, now(), now()),
  ('f1000000-0000-4000-8000-000000000209', 'OP_SMALL_EQUIPMENT', 'İnventar və kiçik avadanlıq', 'Gündəlik istifadə olunan kiçik avadanlıq', 'EXPENSE', 'OPEX', true, true, false, false, now(), now()),
  ('f1000000-0000-4000-8000-000000000210', 'OP_REPAIR_MAINT', 'Təmir və texniki xidmət', 'Məkan və inventar təmiri, servis', 'EXPENSE', 'OPEX', true, true, false, false, now(), now()),
  ('f1000000-0000-4000-8000-000000000211', 'OP_MARKETING_ADS', 'Marketinq — Reklam', 'Meta Ads, TikTok Ads və media büdcəsi', 'EXPENSE', 'OPEX', true, true, false, false, now(), now()),
  ('f1000000-0000-4000-8000-000000000212', 'OP_MARKETING_CONTENT', 'Marketinq — Agentlik və kontent', 'Agentlik, foto, video, model və kontent istehsalı', 'EXPENSE', 'OPEX', true, true, false, false, now(), now()),
  ('f1000000-0000-4000-8000-000000000213', 'OP_SOFTWARE_SUBS', 'Proqramlar və aboneliklər', 'Software və subscription ödənişləri', 'EXPENSE', 'OPEX', true, true, false, false, now(), now()),
  ('f1000000-0000-4000-8000-000000000214', 'OP_IT_SYSTEMS', 'İT və sistem xidmətləri', 'ERP, sayt, developer və sistem inkişafı', 'EXPENSE', 'OPEX', true, true, false, false, now(), now()),
  ('f1000000-0000-4000-8000-000000000215', 'OP_BANK_FEES', 'Bank və kassa xidmətləri', 'Bank, POS, kassa və payment komissiyaları', 'EXPENSE', 'OPEX', true, true, false, false, now(), now()),
  ('f1000000-0000-4000-8000-000000000216', 'OP_EVENTS_PROJECTS', 'Tədbir və layihə xərcləri', 'Workshop, sərgi və xüsusi layihələr', 'EXPENSE', 'OPEX', true, true, false, true, now(), now()),
  ('f1000000-0000-4000-8000-000000000217', 'OP_PRO_SERVICES', 'Peşəkar xidmətlər', 'Mühasib, hüquqşünas və konsultant xidmətləri', 'EXPENSE', 'OPEX', true, true, false, false, now(), now()),
  ('f1000000-0000-4000-8000-000000000218', 'OP_LOGISTICS', 'Logistika və çatdırılma', 'Kuryer, daşınma və çatdırılma', 'EXPENSE', 'OPEX', true, true, false, false, now(), now()),
  ('f1000000-0000-4000-8000-000000000219', 'OP_TEAM_DEVELOPMENT', 'Komanda inkişafı və daxili tədbirlər', 'Komanda görüşü, təlim və daxili inkişaf', 'EXPENSE', 'OPEX', true, true, false, false, now(), now()),
  ('f1000000-0000-4000-8000-000000000301', 'CAP_EQUIPMENT', 'Kapital avadanlıq', 'Uzunmüddətli böyük texnika və avadanlıq', 'CAPEX_OUT', 'CAPEX', true, true, false, false, now(), now()),
  ('f1000000-0000-4000-8000-000000000302', 'CAP_FITOUT', 'Məkan və filial kapital investisiyası', 'Böyük təmir, fit-out və filial qurulması', 'CAPEX_OUT', 'CAPEX', true, true, false, false, now(), now()),
  ('f1000000-0000-4000-8000-000000000401', 'FIN_INVESTOR_REPAY', 'İnvestor ödənişi / kapitalın qaytarılması', 'İnvestora əsas kapitalın qaytarılması', 'FINANCING_OUT', 'FINANCING', true, true, false, false, now(), now()),
  ('f1000000-0000-4000-8000-000000000402', 'FIN_OWNER_LOAN_OUT', 'Sahibkara verilmiş borc', 'Sahibkar tərəfindən geri qaytarılacaq məbləğ', 'FINANCING_OUT', 'FINANCING', true, true, false, false, now(), now()),
  ('f1000000-0000-4000-8000-000000000403', 'FIN_OWNER_DRAW', 'Sahibkar çıxarışı', 'Sahibkarın şəxsi istifadə üçün götürdüyü məbləğ', 'FINANCING_OUT', 'FINANCING', true, true, false, false, now(), now()),
  ('f1000000-0000-4000-8000-000000000404', 'FIN_OWNER_CONTRIB', 'Sahibkar kapital qoyuluşu', 'Sahibkarın şirkətə daxil etdiyi vəsait', 'FINANCING_IN', 'FINANCING', true, true, false, false, now(), now()),
  ('f1000000-0000-4000-8000-000000000405', 'FIN_LOAN_RECEIVED', 'Kredit / borc daxilolması', 'Şirkətin aldığı kredit və ya borc', 'FINANCING_IN', 'FINANCING', true, true, false, false, now(), now()),
  ('f1000000-0000-4000-8000-000000000406', 'FIN_LOAN_PRINCIPAL', 'Kredit əsas məbləğinin qaytarılması', 'Kreditin əsas məbləğinin qaytarılması', 'FINANCING_OUT', 'FINANCING', true, true, false, false, now(), now()),
  ('f1000000-0000-4000-8000-000000000501', 'LEGACY_INV_LIABILITY', 'Keçmiş inventar öhdəliyinin ödənişi', 'Artmonianın quruluşundan qalan inventar borcları', 'FINANCING_OUT', 'LEGACY_LIABILITY', true, true, false, false, now(), now())
ON CONFLICT ("name") DO UPDATE SET
  "code" = EXCLUDED."code",
  "description" = EXCLUDED."description",
  "transaction_type" = EXCLUDED."transaction_type",
  "financial_class" = EXCLUDED."financial_class",
  "is_active" = true,
  "is_system" = true,
  "requires_staff" = EXCLUDED."requires_staff",
  "requires_project" = EXCLUDED."requires_project",
  "updated_at" = now();

UPDATE "erp"."finance_expense_categories"
SET
  "code" = 'LEGACY_' || upper(substr(md5("id"::text), 1, 16)),
  "transaction_type" = 'EXPENSE',
  "financial_class" = 'OPEX',
  "is_active" = false,
  "updated_at" = now()
WHERE "code" IS NULL;

UPDATE "erp"."finance_expenses" fe
SET
  "legacy_category_name" = fec."name",
  "transaction_type" = fec."transaction_type",
  "financial_class" = coalesce(fec."financial_class", 'OPEX')
FROM "erp"."finance_expense_categories" fec
WHERE fec."id" = fe."category_id";

-- Exact and relation-based mappings are safe to automate.
UPDATE "erp"."finance_expenses" fe
SET "category_id" = target."id"
FROM "erp"."finance_expense_categories" old_category,
     "erp"."finance_expense_categories" target
WHERE old_category."id" = fe."category_id"
  AND lower(old_category."name") IN ('icare', 'icarə', 'kirayə')
  AND target."code" = 'OP_RENT';

UPDATE "erp"."finance_expenses" fe
SET "category_id" = target."id"
FROM "erp"."finance_expense_categories" old_category,
     "erp"."finance_expense_categories" target
WHERE old_category."id" = fe."category_id"
  AND lower(old_category."name") IN ('kommunal', 'kommunal və rabitə')
  AND target."code" = 'OP_UTILITIES_COMMS';

UPDATE "erp"."finance_expenses" fe
SET "category_id" = target."id"
FROM "erp"."finance_expense_categories" old_category,
     "erp"."finance_expense_categories" target
WHERE old_category."id" = fe."category_id"
  AND lower(old_category."name") IN ('əməkdaş bonusu', 'bonus', 'bonus və komissiyalar')
  AND target."code" = 'OP_BONUS_COMMISSION';

UPDATE "erp"."finance_expenses" fe
SET "category_id" = target."id"
FROM "erp"."finance_expense_categories" old_category,
     "erp"."finance_expense_categories" target
WHERE old_category."id" = fe."category_id"
  AND lower(old_category."name") IN ('vergi', 'vergi və dövlət ödənişləri')
  AND target."code" = 'OP_TAX_GOV';

UPDATE "erp"."finance_expenses" fe
SET "category_id" = target."id"
FROM "erp"."finance_expense_categories" old_category,
     "erp"."finance_expense_categories" target
WHERE old_category."id" = fe."category_id"
  AND lower(old_category."name") IN ('sistem xərci', 'it və sistem xidmətləri', 'i̇t və sistem xidmətləri')
  AND target."code" = 'OP_IT_SYSTEMS';

UPDATE "erp"."finance_expenses" fe
SET "category_id" = target."id"
FROM "erp"."finance_expense_categories" old_category,
     "erp"."finance_expense_categories" target
WHERE old_category."id" = fe."category_id"
  AND lower(old_category."name") IN ('şirkət abonelikləri', 'proqramlar və aboneliklər')
  AND target."code" = 'OP_SOFTWARE_SUBS';

UPDATE "erp"."finance_expenses" fe
SET "category_id" = target."id"
FROM "erp"."finance_expense_categories" old_category,
     "erp"."finance_expense_categories" target
WHERE old_category."id" = fe."category_id"
  AND lower(old_category."name") IN ('events', 'tədbirlər', 'tədbir və layihə xərcləri')
  AND target."code" = 'OP_EVENTS_PROJECTS';

UPDATE "erp"."finance_expenses" fe
SET "category_id" = target."id"
FROM "erp"."finance_expense_categories" old_category,
     "erp"."finance_expense_categories" target
WHERE old_category."id" = fe."category_id"
  AND lower(old_category."name") IN ('inventar təmiri', 'təmir və texniki xidmət')
  AND target."code" = 'OP_REPAIR_MAINT';

UPDATE "erp"."finance_expenses" fe
SET "category_id" = target."id"
FROM "erp"."finance_expense_categories" old_category,
     "erp"."finance_expense_categories" target
WHERE old_category."id" = fe."category_id"
  AND lower(old_category."name") IN ('roi', 'roİ', 'roı', 'investor ödənişi')
  AND target."code" = 'FIN_INVESTOR_REPAY';

UPDATE "erp"."finance_expenses" fe
SET "category_id" = target."id"
FROM "erp"."finance_expense_categories" old_category,
     "erp"."finance_expense_categories" target
WHERE old_category."id" = fe."category_id"
  AND lower(old_category."name") IN ('maas', 'maaş', 'əməkhaqqı')
  AND fe."teacher_id" IS NOT NULL
  AND target."code" = 'DC_TEACHER_COMP';

UPDATE "erp"."finance_expenses" fe
SET "category_id" = target."id"
FROM "erp"."finance_expense_categories" old_category,
     "erp"."finance_expense_categories" target
WHERE old_category."id" = fe."category_id"
  AND lower(old_category."name") IN ('maas', 'maaş', 'əməkhaqqı')
  AND fe."teacher_id" IS NULL
  AND fe."employee_user_id" IS NOT NULL
  AND target."code" = 'OP_PAYROLL_SALES_ADMIN';

UPDATE "erp"."finance_expenses" fe
SET "category_id" = target."id"
FROM "erp"."finance_expense_categories" old_category,
     "erp"."finance_expense_categories" target
WHERE old_category."id" = fe."category_id"
  AND lower(old_category."name") IN ('material', 'ləvazimat', 'tədris materialları')
  AND fe."workshop_event_id" IS NOT NULL
  AND target."code" = 'OP_EVENTS_PROJECTS';

UPDATE "erp"."finance_expenses" fe
SET "category_id" = target."id"
FROM "erp"."finance_expense_categories" old_category,
     "erp"."finance_expense_categories" target
WHERE old_category."id" = fe."category_id"
  AND lower(old_category."name") IN ('material', 'ləvazimat', 'tədris materialları')
  AND fe."workshop_event_id" IS NULL
  AND target."code" = 'DC_TEACHING_MATERIALS';

-- Marketing is mapped only where vendor/description provides a reliable signal.
UPDATE "erp"."finance_expenses" fe
SET "category_id" = target."id"
FROM "erp"."finance_expense_categories" old_category,
     "erp"."finance_expense_categories" target
WHERE old_category."id" = fe."category_id"
  AND lower(old_category."name") = 'marketing'
  AND concat_ws(' ', fe."vendor", fe."description") ~* '(meta|facebook|instagram|tiktok|ads|reklam)'
  AND target."code" = 'OP_MARKETING_ADS';

UPDATE "erp"."finance_expenses" fe
SET "category_id" = target."id"
FROM "erp"."finance_expense_categories" old_category,
     "erp"."finance_expense_categories" target
WHERE old_category."id" = fe."category_id"
  AND lower(old_category."name") = 'marketing'
  AND concat_ws(' ', fe."vendor", fe."description") ~* '(agency|agentlik|kontent|content|foto|video|model)'
  AND target."code" = 'OP_MARKETING_CONTENT';

-- Anything that still points at a frozen legacy category requires review.
UPDATE "erp"."finance_expenses" fe
SET "classification_review_required" = true
FROM "erp"."finance_expense_categories" fec
WHERE fec."id" = fe."category_id"
  AND fec."is_active" = false;

UPDATE "erp"."finance_expenses" fe
SET
  "transaction_type" = fec."transaction_type",
  "financial_class" = coalesce(fec."financial_class", 'OPEX'),
  "cost_center" = CASE
    WHEN fec."code" LIKE 'DC_%' THEN 'TEACHING'::"erp"."FinanceCostCenter"
    WHEN fec."code" LIKE 'OP_MARKETING_%' THEN 'MARKETING'::"erp"."FinanceCostCenter"
    WHEN fec."code" = 'OP_MANAGEMENT_COMP' THEN 'MANAGEMENT'::"erp"."FinanceCostCenter"
    WHEN fec."code" = 'OP_PAYROLL_SALES_ADMIN' THEN 'SALES'::"erp"."FinanceCostCenter"
    ELSE 'OPERATIONS'::"erp"."FinanceCostCenter"
  END
FROM "erp"."finance_expense_categories" fec
WHERE fec."id" = fe."category_id";

ALTER TABLE "erp"."finance_expense_categories"
  ALTER COLUMN "code" SET NOT NULL,
  ALTER COLUMN "transaction_type" SET NOT NULL;

ALTER TABLE "erp"."finance_expenses"
  ALTER COLUMN "cost_center" SET NOT NULL;

ALTER TABLE "erp"."finance_expense_categories"
  ADD CONSTRAINT "finance_expense_categories_class_check"
  CHECK (
    ("transaction_type" = 'INCOME' AND "financial_class" IS NULL)
    OR ("transaction_type" = 'EXPENSE' AND "financial_class" IN ('DIRECT_COST', 'OPEX'))
    OR ("transaction_type" = 'CAPEX_OUT' AND "financial_class" = 'CAPEX')
    OR ("transaction_type" = 'FINANCING_IN' AND "financial_class" = 'FINANCING')
    OR ("transaction_type" = 'FINANCING_OUT' AND "financial_class" IN ('FINANCING', 'LEGACY_LIABILITY'))
  );

ALTER TABLE "erp"."finance_expenses"
  ADD CONSTRAINT "finance_expenses_class_check"
  CHECK (
    ("transaction_type" = 'EXPENSE' AND "financial_class" IN ('DIRECT_COST', 'OPEX'))
    OR ("transaction_type" = 'CAPEX_OUT' AND "financial_class" = 'CAPEX')
    OR ("transaction_type" = 'FINANCING_IN' AND "financial_class" = 'FINANCING')
    OR ("transaction_type" = 'FINANCING_OUT' AND "financial_class" IN ('FINANCING', 'LEGACY_LIABILITY'))
  );

CREATE UNIQUE INDEX "finance_expense_categories_code_key"
  ON "erp"."finance_expense_categories" ("code");
CREATE INDEX "finance_expense_categories_is_active_transaction_type_idx"
  ON "erp"."finance_expense_categories" ("is_active", "transaction_type");
CREATE INDEX "finance_expense_categories_financial_class_is_active_idx"
  ON "erp"."finance_expense_categories" ("financial_class", "is_active");
CREATE INDEX "finance_expenses_financial_class_expense_date_idx"
  ON "erp"."finance_expenses" ("financial_class", "expense_date");
CREATE INDEX "finance_expenses_transaction_type_expense_date_idx"
  ON "erp"."finance_expenses" ("transaction_type", "expense_date");
CREATE INDEX "finance_expenses_review_required_idx"
  ON "erp"."finance_expenses" ("expense_date" DESC)
  WHERE "classification_review_required" = true AND "voided_at" IS NULL;

CREATE OR REPLACE FUNCTION "erp"."prevent_finance_category_code_update"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW."code" IS DISTINCT FROM OLD."code" THEN
    RAISE EXCEPTION 'Finance category code is immutable';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION "erp"."prevent_finance_category_code_update"() FROM PUBLIC;

CREATE TRIGGER "finance_category_code_immutable"
BEFORE UPDATE OF "code" ON "erp"."finance_expense_categories"
FOR EACH ROW
EXECUTE FUNCTION "erp"."prevent_finance_category_code_update"();

INSERT INTO "erp"."permissions" ("id", "code", "description")
VALUES (gen_random_uuid(), 'billing.category.manage', 'Manage the controlled finance category catalogue')
ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description";

INSERT INTO "erp"."role_permissions" ("role_id", "permission_id", "scope")
SELECT role."id", permission."id", 'ALL'::"erp"."PermissionScope"
FROM "erp"."roles" role
JOIN "erp"."permissions" permission ON permission."code" = 'billing.category.manage'
WHERE role."code" IN ('OWNER'::"erp"."AppRole", 'ADMIN'::"erp"."AppRole", 'FINANCE'::"erp"."AppRole")
ON CONFLICT ("role_id", "permission_id") DO UPDATE SET "scope" = EXCLUDED."scope";

COMMIT;
