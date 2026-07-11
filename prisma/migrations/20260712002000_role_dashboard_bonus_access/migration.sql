WITH grants(role_key, scope) AS (
  VALUES
    ('sales', 'ASSIGNED'::"erp"."PermissionScope"),
    ('teacher', 'ASSIGNED'::"erp"."PermissionScope"),
    ('marketing', 'ASSIGNED'::"erp"."PermissionScope")
), resolved AS (
  SELECT r."id" AS role_id, p."id" AS permission_id, g.scope
  FROM grants g
  JOIN "erp"."roles" r ON r."key" = g.role_key
  JOIN "erp"."permissions" p ON p."code" = 'hr.bonus.read'
)
INSERT INTO "erp"."role_permissions" ("role_id", "permission_id", "scope")
SELECT role_id, permission_id, scope FROM resolved
ON CONFLICT ("role_id", "permission_id") DO UPDATE SET "scope" = EXCLUDED."scope";
