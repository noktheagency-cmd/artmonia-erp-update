DELETE FROM "erp"."role_permissions" rp
USING "erp"."roles" r, "erp"."permissions" p
WHERE rp."role_id" = r.id
  AND rp."permission_id" = p.id
  AND r.key = 'sales'
  AND p.code IN ('billing.payment.read', 'billing.entry.create');

INSERT INTO "erp"."role_permissions" ("role_id", "permission_id", "scope")
SELECT r.id, p.id, 'ALL'::"erp"."PermissionScope"
FROM "erp"."roles" r
JOIN "erp"."permissions" p ON p.code = 'billing.payment.create'
WHERE r.key = 'sales'
ON CONFLICT ("role_id", "permission_id")
DO UPDATE SET "scope" = EXCLUDED."scope";
