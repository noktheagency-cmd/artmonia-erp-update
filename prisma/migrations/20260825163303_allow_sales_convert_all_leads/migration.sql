-- Sales representatives may register any CRM lead as a student.
-- This keeps unrelated student update/delete permissions unchanged.
INSERT INTO "erp"."role_permissions" ("role_id", "permission_id", "scope")
SELECT r.id, p.id, 'ALL'::"erp"."PermissionScope"
FROM "erp"."roles" r
JOIN "erp"."permissions" p
  ON p.code IN ('crm.lead.convert', 'student.create')
WHERE r.code = 'SALES'::"erp"."AppRole"
   OR r.key = 'sales'
ON CONFLICT ("role_id", "permission_id")
DO UPDATE SET "scope" = EXCLUDED."scope";
