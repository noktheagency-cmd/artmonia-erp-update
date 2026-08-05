-- Extend employee profiles with a persisted address.
ALTER TABLE "erp"."hr_employees"
ADD COLUMN "address" TEXT;

-- Persist the selected dynamic discount classification on each enrollment.
ALTER TABLE "erp"."enrollments"
ADD COLUMN "discount_type" TEXT;

-- Allocate student codes atomically across concurrent application instances.
CREATE SEQUENCE IF NOT EXISTS "erp"."student_code_seq"
  AS BIGINT
  START WITH 1001
  INCREMENT BY 1
  MINVALUE 1001
  NO MAXVALUE
  CACHE 20;

SELECT setval(
  '"erp"."student_code_seq"',
  GREATEST(
    COALESCE((
      SELECT max(substring("code" FROM 5)::bigint)
      FROM "erp"."students"
      WHERE "code" ~ '^ART-[0-9]+$'
    ), 1000),
    1000
  ),
  true
);

INSERT INTO "erp"."dropdown_catalog_options" (
  "catalog",
  "value",
  "label",
  "is_active",
  "is_custom"
)
VALUES
  ('STUDENT_DISCOUNT_TYPE', 'DISCOUNT', 'Endirim', true, false),
  ('STUDENT_DISCOUNT_TYPE', 'GIFT', 'Hədiyyə', true, false)
ON CONFLICT ("catalog", "value") DO UPDATE
SET "label" = EXCLUDED."label",
    "is_active" = true;
