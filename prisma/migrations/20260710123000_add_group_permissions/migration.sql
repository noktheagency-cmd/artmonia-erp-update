INSERT INTO "erp"."permissions" ("id", "code", "description")
VALUES
  (gen_random_uuid(), 'group.read', 'Read student groups'),
  (gen_random_uuid(), 'group.manage', 'Create groups and manage group memberships'),
  (gen_random_uuid(), 'attendance.read', 'Read group attendance journals'),
  (gen_random_uuid(), 'attendance.manage', 'Record group attendance'),
  (gen_random_uuid(), 'teacher.account.manage', 'Link teacher profiles to ERP users')
ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description";

INSERT INTO "erp"."role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id
FROM "erp"."roles" r
JOIN "erp"."permissions" p ON p.code IN (
  'group.read',
  'group.manage',
  'attendance.read',
  'attendance.manage',
  'teacher.account.manage'
)
WHERE r.code = 'SUPER_ADMIN'::"erp"."AppRole"
ON CONFLICT DO NOTHING;

INSERT INTO "erp"."role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id
FROM "erp"."roles" r
JOIN "erp"."permissions" p ON p.code IN (
  'group.read',
  'group.manage',
  'attendance.read',
  'attendance.manage',
  'teacher.account.manage'
)
WHERE r.code IN ('OWNER'::"erp"."AppRole", 'ADMIN'::"erp"."AppRole")
ON CONFLICT DO NOTHING;

INSERT INTO "erp"."role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id
FROM "erp"."roles" r
JOIN "erp"."permissions" p ON p.code IN (
  'group.read',
  'attendance.read',
  'attendance.manage'
)
WHERE r.code = 'TEACHER'::"erp"."AppRole"
ON CONFLICT DO NOTHING;
