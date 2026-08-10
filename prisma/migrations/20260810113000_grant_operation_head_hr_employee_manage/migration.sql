WITH operation_head_roles AS (
  SELECT "id"
  FROM "erp"."roles"
  WHERE lower(trim("name")) = 'operation head'
     OR "key" LIKE 'custom.operation-head.%'
), resolved_grants AS (
  SELECT r."id" AS role_id, p."id" AS permission_id
  FROM operation_head_roles r
  CROSS JOIN "erp"."permissions" p
  WHERE p."code" IN ('hr.employee.read', 'hr.employee.manage')
)
INSERT INTO "erp"."role_permissions" ("role_id", "permission_id", "scope")
SELECT role_id, permission_id, 'ALL'::"erp"."PermissionScope"
FROM resolved_grants
ON CONFLICT ("role_id", "permission_id")
DO UPDATE SET "scope" = EXCLUDED."scope";

