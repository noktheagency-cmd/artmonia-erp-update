INSERT INTO "erp"."role_permissions" ("role_id", "permission_id", "scope")
SELECT r."id", p."id", 'ALL'::"erp"."PermissionScope"
FROM "erp"."roles" r
CROSS JOIN "erp"."permissions" p
WHERE r."code" = 'SALES'::"erp"."AppRole"
  AND p."code" IN ('crm.lead.read', 'student.read')
ON CONFLICT ("role_id", "permission_id")
DO UPDATE SET "scope" = EXCLUDED."scope";
