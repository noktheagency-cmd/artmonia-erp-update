ALTER TABLE "erp"."leads"
ADD COLUMN "education_level" TEXT;

INSERT INTO "erp"."dropdown_catalog_options" (
    "catalog",
    "value",
    "label",
    "is_active",
    "is_custom"
)
VALUES
    ('STUDENT_EDUCATION_LEVEL', 'Orta təhsil', 'Orta təhsil', true, false),
    ('STUDENT_EDUCATION_LEVEL', 'Subbakalavr', 'Subbakalavr', true, false),
    ('STUDENT_EDUCATION_LEVEL', 'Bakalavr', 'Bakalavr', true, false),
    ('STUDENT_EDUCATION_LEVEL', 'Magistr', 'Magistr', true, false),
    ('STUDENT_EDUCATION_LEVEL', 'Doktorantura', 'Doktorantura', true, false)
ON CONFLICT ("catalog", "value") DO UPDATE
SET "label" = EXCLUDED."label",
    "is_active" = true;

INSERT INTO "erp"."dropdown_catalog_options" (
    "catalog",
    "value",
    "label",
    "is_active",
    "is_custom"
)
SELECT
    'STUDENT_EDUCATION_LEVEL',
    trim(s."education_level"),
    trim(s."education_level"),
    true,
    true
FROM "erp"."students" s
WHERE s."education_level" IS NOT NULL
  AND trim(s."education_level") <> ''
ON CONFLICT ("catalog", "value") DO NOTHING;
