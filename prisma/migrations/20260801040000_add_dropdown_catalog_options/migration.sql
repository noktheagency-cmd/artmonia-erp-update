CREATE TABLE "erp"."dropdown_catalog_options" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "catalog" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_custom" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dropdown_catalog_options_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dropdown_catalog_options_catalog_value_key"
    ON "erp"."dropdown_catalog_options"("catalog", "value");

CREATE INDEX "dropdown_catalog_options_catalog_is_active_label_idx"
    ON "erp"."dropdown_catalog_options"("catalog", "is_active", "label");

CREATE INDEX "dropdown_catalog_options_created_by_id_idx"
    ON "erp"."dropdown_catalog_options"("created_by_id");

ALTER TABLE "erp"."dropdown_catalog_options"
    ADD CONSTRAINT "dropdown_catalog_options_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "erp"."users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "erp"."dropdown_catalog_options" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "erp"."dropdown_catalog_options" FROM anon, authenticated;
