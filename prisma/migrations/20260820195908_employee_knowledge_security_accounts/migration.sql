CREATE TABLE "erp"."hr_employee_notes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "employee_id" UUID NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "content" JSONB NOT NULL,
  "created_by_id" UUID,
  "updated_by_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "hr_employee_notes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "hr_employee_notes_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "erp"."hr_employees"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "hr_employee_notes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "erp"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "hr_employee_notes_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "erp"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "erp"."hr_employee_documents" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "employee_id" UUID NOT NULL,
  "original_name" VARCHAR(255) NOT NULL,
  "object_key" VARCHAR(500) NOT NULL,
  "mime_type" VARCHAR(120) NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "uploaded_by_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "hr_employee_documents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "hr_employee_documents_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "erp"."hr_employees"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "hr_employee_documents_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "erp"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "hr_employee_documents_size_bytes_check" CHECK ("size_bytes" > 0 AND "size_bytes" <= 15728640)
);

CREATE INDEX "hr_employee_notes_employee_id_updated_at_idx" ON "erp"."hr_employee_notes"("employee_id", "updated_at" DESC);
CREATE INDEX "hr_employee_notes_created_by_id_idx" ON "erp"."hr_employee_notes"("created_by_id");
CREATE INDEX "hr_employee_notes_updated_by_id_idx" ON "erp"."hr_employee_notes"("updated_by_id");
CREATE UNIQUE INDEX "hr_employee_documents_object_key_key" ON "erp"."hr_employee_documents"("object_key");
CREATE INDEX "hr_employee_documents_employee_id_created_at_idx" ON "erp"."hr_employee_documents"("employee_id", "created_at" DESC);
CREATE INDEX "hr_employee_documents_uploaded_by_id_idx" ON "erp"."hr_employee_documents"("uploaded_by_id");

INSERT INTO "erp"."hr_employee_notes" ("employee_id", "title", "content", "created_by_id", "updated_by_id", "created_at", "updated_at")
SELECT employee."id", 'Ümumi HR qeydi', jsonb_build_object('type', 'doc', 'content', jsonb_build_array(jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', employee."note"))))), employee."created_by_id", employee."created_by_id", employee."created_at", employee."updated_at"
FROM "erp"."hr_employees" employee
WHERE nullif(btrim(employee."note"), '') IS NOT NULL;

INSERT INTO "erp"."permissions" ("id", "code", "description")
VALUES
  (gen_random_uuid(), 'hr.note.read', 'Əməkdaşın daxili qeydlərini görmək'),
  (gen_random_uuid(), 'hr.note.manage', 'Əməkdaşın daxili qeydlərini yaratmaq və dəyişmək'),
  (gen_random_uuid(), 'hr.document.read', 'Əməkdaşa aid qorunan sənədləri görmək'),
  (gen_random_uuid(), 'hr.document.manage', 'Əməkdaşa aid qorunan sənədləri əlavə etmək')
ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description";

WITH allowed_roles AS (
  SELECT "id" FROM "erp"."roles"
  WHERE "code"::text IN ('SUPER_ADMIN', 'OWNER', 'ADMIN') OR lower(trim("name")) = 'operation head' OR "key" LIKE 'custom.operation-head.%'
), resolved_grants AS (
  SELECT role."id" AS role_id, permission."id" AS permission_id
  FROM allowed_roles role CROSS JOIN "erp"."permissions" permission
  WHERE permission."code" IN ('hr.note.read', 'hr.note.manage', 'hr.document.read', 'hr.document.manage')
)
INSERT INTO "erp"."role_permissions" ("role_id", "permission_id", "scope")
SELECT role_id, permission_id, 'ALL'::"erp"."PermissionScope" FROM resolved_grants
ON CONFLICT ("role_id", "permission_id") DO UPDATE SET "scope" = EXCLUDED."scope";

ALTER TABLE "erp"."hr_employee_notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "erp"."hr_employee_documents" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "erp"."hr_employee_notes" FROM anon, authenticated;
REVOKE ALL ON TABLE "erp"."hr_employee_documents" FROM anon, authenticated;
