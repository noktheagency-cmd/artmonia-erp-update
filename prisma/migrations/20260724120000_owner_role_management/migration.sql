-- Business owners can manage roles without requiring the immutable Super Admin role.
INSERT INTO "erp"."permissions" ("id", "code", "description")
VALUES (gen_random_uuid(), 'auth.role.manage', 'Manage role permission assignments')
ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description";

INSERT INTO "erp"."role_permissions" ("role_id", "permission_id", "scope")
SELECT role.id, permission.id, 'ALL'::"erp"."PermissionScope"
FROM "erp"."roles" role
JOIN "erp"."permissions" permission ON permission.code = 'auth.role.manage'
WHERE role.code = 'OWNER'::"erp"."AppRole"
ON CONFLICT ("role_id", "permission_id") DO UPDATE SET "scope" = EXCLUDED."scope";
