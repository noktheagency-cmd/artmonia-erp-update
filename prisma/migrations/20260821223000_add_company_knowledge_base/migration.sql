CREATE TYPE "erp"."KnowledgeSectionType" AS ENUM ('COMPANY', 'PLAYBOOK');
CREATE TYPE "erp"."KnowledgeContentStatus" AS ENUM ('DRAFT', 'PUBLISHED');

CREATE TABLE "erp"."knowledge_sections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" VARCHAR(48) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "type" "erp"."KnowledgeSectionType" NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "status" "erp"."KnowledgeContentStatus" NOT NULL DEFAULT 'PUBLISHED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "knowledge_sections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "erp"."knowledge_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "section_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "status" "erp"."KnowledgeContentStatus" NOT NULL DEFAULT 'PUBLISHED',
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "knowledge_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "erp"."knowledge_articles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "category_id" UUID NOT NULL,
    "title" VARCHAR(180) NOT NULL,
    "content" JSONB NOT NULL,
    "plain_text" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL DEFAULT 0,
    "status" "erp"."KnowledgeContentStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "knowledge_articles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "knowledge_sections_key_key" ON "erp"."knowledge_sections"("key");
CREATE INDEX "knowledge_sections_type_status_position_idx" ON "erp"."knowledge_sections"("type", "status", "position");
CREATE UNIQUE INDEX "knowledge_categories_section_id_name_key" ON "erp"."knowledge_categories"("section_id", "name");
CREATE INDEX "knowledge_categories_section_id_status_position_idx" ON "erp"."knowledge_categories"("section_id", "status", "position");
CREATE INDEX "knowledge_categories_created_by_id_idx" ON "erp"."knowledge_categories"("created_by_id");
CREATE INDEX "knowledge_categories_updated_by_id_idx" ON "erp"."knowledge_categories"("updated_by_id");
CREATE INDEX "knowledge_articles_category_id_status_position_idx" ON "erp"."knowledge_articles"("category_id", "status", "position");
CREATE INDEX "knowledge_articles_created_by_id_idx" ON "erp"."knowledge_articles"("created_by_id");
CREATE INDEX "knowledge_articles_updated_by_id_idx" ON "erp"."knowledge_articles"("updated_by_id");

ALTER TABLE "erp"."knowledge_categories" ADD CONSTRAINT "knowledge_categories_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "erp"."knowledge_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "erp"."knowledge_categories" ADD CONSTRAINT "knowledge_categories_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "erp"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "erp"."knowledge_categories" ADD CONSTRAINT "knowledge_categories_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "erp"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "erp"."knowledge_articles" ADD CONSTRAINT "knowledge_articles_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "erp"."knowledge_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "erp"."knowledge_articles" ADD CONSTRAINT "knowledge_articles_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "erp"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "erp"."knowledge_articles" ADD CONSTRAINT "knowledge_articles_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "erp"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "erp"."knowledge_sections" (
    "key",
    "name",
    "type",
    "position",
    "status",
    "updated_at"
) VALUES (
    'company',
    'Biz Kimik',
    'COMPANY',
    0,
    'PUBLISHED',
    CURRENT_TIMESTAMP
);
