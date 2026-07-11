INSERT INTO "erp"."permissions" ("id", "code", "description")
VALUES (gen_random_uuid(), 'dashboard.marketing.read', 'Marketing dashboard and campaign performance')
ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description";

DELETE FROM "erp"."roles"
WHERE "code" IS NULL
   OR "code" NOT IN (
     'SUPER_ADMIN'::"erp"."AppRole",
     'SALES'::"erp"."AppRole",
     'TEACHER'::"erp"."AppRole"
   );

UPDATE "erp"."roles" SET "name" = 'Super Admin', "is_system" = true WHERE "code" = 'SUPER_ADMIN';
UPDATE "erp"."roles" SET "name" = 'Satış təmsilçisi', "is_system" = true WHERE "code" = 'SALES';
UPDATE "erp"."roles" SET "name" = 'Müəllim', "is_system" = true WHERE "code" = 'TEACHER';

INSERT INTO "erp"."roles" ("id", "code", "key", "name", "description", "is_system", "created_at", "updated_at")
VALUES (
  gen_random_uuid(),
  NULL,
  'marketing',
  'Marketing',
  'Marketing kampaniyaları, şəxsi dashboard, şəxsi tasklar və ümumi Playbook',
  false,
  now(),
  now()
);

DELETE FROM "erp"."role_permissions"
WHERE "role_id" IN (
  SELECT "id" FROM "erp"."roles"
  WHERE "code" IN ('SALES'::"erp"."AppRole", 'TEACHER'::"erp"."AppRole")
     OR "key" = 'marketing'
);

WITH grants(role_key, permission_code, scope) AS (
  VALUES
    ('SALES', 'dashboard.sales.read', 'ALL'::"erp"."PermissionScope"),
    ('SALES', 'crm.lead.read', 'ASSIGNED'::"erp"."PermissionScope"),
    ('SALES', 'crm.lead.create', 'ALL'::"erp"."PermissionScope"),
    ('SALES', 'crm.lead.update', 'ASSIGNED'::"erp"."PermissionScope"),
    ('SALES', 'crm.lead.delete', 'ASSIGNED'::"erp"."PermissionScope"),
    ('SALES', 'crm.lead.convert', 'ASSIGNED'::"erp"."PermissionScope"),
    ('SALES', 'student.read', 'ASSIGNED'::"erp"."PermissionScope"),
    ('SALES', 'task.read', 'ASSIGNED'::"erp"."PermissionScope"),
    ('SALES', 'task.manage', 'ASSIGNED'::"erp"."PermissionScope"),
    ('SALES', 'playbook.read', 'ALL'::"erp"."PermissionScope"),

    ('TEACHER', 'dashboard.teacher.read', 'ALL'::"erp"."PermissionScope"),
    ('TEACHER', 'group.read', 'ASSIGNED'::"erp"."PermissionScope"),
    ('TEACHER', 'attendance.read', 'ASSIGNED'::"erp"."PermissionScope"),
    ('TEACHER', 'attendance.manage', 'ASSIGNED'::"erp"."PermissionScope"),
    ('TEACHER', 'task.read', 'ASSIGNED'::"erp"."PermissionScope"),
    ('TEACHER', 'task.manage', 'ASSIGNED'::"erp"."PermissionScope"),
    ('TEACHER', 'playbook.read', 'ALL'::"erp"."PermissionScope"),

    ('marketing', 'dashboard.marketing.read', 'ALL'::"erp"."PermissionScope"),
    ('marketing', 'marketing.read', 'ALL'::"erp"."PermissionScope"),
    ('marketing', 'marketing.manage', 'ALL'::"erp"."PermissionScope"),
    ('marketing', 'task.read', 'ASSIGNED'::"erp"."PermissionScope"),
    ('marketing', 'task.manage', 'ASSIGNED'::"erp"."PermissionScope"),
    ('marketing', 'playbook.read', 'ALL'::"erp"."PermissionScope")
), resolved AS (
  SELECT r.id AS role_id, p.id AS permission_id, g.scope
  FROM grants g
  JOIN "erp"."roles" r ON r.key = lower(g.role_key)
  JOIN "erp"."permissions" p ON p.code = g.permission_code
)
INSERT INTO "erp"."role_permissions" ("role_id", "permission_id", "scope")
SELECT role_id, permission_id, scope FROM resolved
ON CONFLICT ("role_id", "permission_id") DO UPDATE SET "scope" = EXCLUDED."scope";

INSERT INTO "erp"."audit_logs" ("id", "actor_user_id", "action", "entity_type", "reason", "after_json", "created_at")
SELECT
  gen_random_uuid(),
  ur.user_id,
  'role.catalog.focus',
  'role',
  'Rol kataloqu Super Admin, Satış təmsilçisi, Müəllim və Marketing rollarına endirildi',
  jsonb_build_object(
    'roles', jsonb_build_array('SUPER_ADMIN', 'SALES', 'TEACHER', 'marketing'),
    'scopeRule', 'ALL > ASSIGNED'
  ),
  now()
FROM "erp"."user_roles" ur
JOIN "erp"."roles" r ON r.id = ur.role_id AND r.code = 'SUPER_ADMIN'
ORDER BY ur.assigned_at
LIMIT 1;
