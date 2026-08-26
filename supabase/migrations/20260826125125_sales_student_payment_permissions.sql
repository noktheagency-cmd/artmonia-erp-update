INSERT INTO "erp"."role_permissions" ("role_id", "permission_id", "scope")
SELECT r.id, p.id, 'ALL'::"erp"."PermissionScope"
FROM "erp"."roles" r
JOIN "erp"."permissions" p
  ON p.code IN ('billing.payment.read', 'billing.payment.create')
WHERE r.key = 'sales'
ON CONFLICT ("role_id", "permission_id")
DO UPDATE SET "scope" = EXCLUDED."scope";
