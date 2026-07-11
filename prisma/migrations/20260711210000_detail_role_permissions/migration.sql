CREATE TYPE "erp"."PermissionScope" AS ENUM ('ASSIGNED', 'ALL');

ALTER TABLE "erp"."roles"
  ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "erp"."role_permissions"
  ADD COLUMN "scope" "erp"."PermissionScope" NOT NULL DEFAULT 'ALL';

INSERT INTO "erp"."permissions" ("id", "code", "description")
VALUES
  (gen_random_uuid(), 'auth.role.read', 'Read role and permission matrix'),
  (gen_random_uuid(), 'auth.role.manage', 'Manage role permission assignments'),
  (gen_random_uuid(), 'crm.lead.delete', 'Delete leads'),
  (gen_random_uuid(), 'student.delete', 'Delete students'),
  (gen_random_uuid(), 'billing.payment.void', 'Void payments'),
  (gen_random_uuid(), 'billing.expense.void', 'Void expenses'),
  (gen_random_uuid(), 'playbook.read', 'Read playbook documents'),
  (gen_random_uuid(), 'playbook.manage', 'Manage playbook documents and departments'),
  (gen_random_uuid(), 'report.read', 'Read reports workspace')
ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description";

INSERT INTO "erp"."role_permissions" ("role_id", "permission_id", "scope")
SELECT r.id, p.id, 'ALL'::"erp"."PermissionScope"
FROM "erp"."roles" r
CROSS JOIN "erp"."permissions" p
WHERE r.code = 'SUPER_ADMIN'::"erp"."AppRole"
ON CONFLICT ("role_id", "permission_id") DO UPDATE SET "scope" = EXCLUDED."scope";

INSERT INTO "erp"."role_permissions" ("role_id", "permission_id", "scope")
SELECT r.id, p.id, 'ALL'::"erp"."PermissionScope"
FROM "erp"."roles" r
JOIN "erp"."permissions" p ON p.code IN (
  'auth.role.read', 'student.delete', 'billing.payment.void', 'billing.expense.void',
  'playbook.read', 'playbook.manage', 'report.read'
)
WHERE r.code = 'OWNER'::"erp"."AppRole"
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

UPDATE "erp"."role_permissions" rp
SET "scope" = 'ASSIGNED'::"erp"."PermissionScope"
FROM "erp"."roles" r, "erp"."permissions" p
WHERE rp.role_id = r.id
  AND rp.permission_id = p.id
  AND r.code = 'SALES'::"erp"."AppRole"
  AND p.code IN ('crm.lead.read', 'crm.lead.update', 'crm.lead.convert');

UPDATE "erp"."role_permissions" rp
SET "scope" = 'ASSIGNED'::"erp"."PermissionScope"
FROM "erp"."roles" r, "erp"."permissions" p
WHERE rp.role_id = r.id
  AND rp.permission_id = p.id
  AND r.code = 'TEACHER'::"erp"."AppRole"
  AND p.code IN ('student.read', 'group.read', 'attendance.read', 'attendance.manage', 'task.read');

INSERT INTO "erp"."role_permissions" ("role_id", "permission_id", "scope")
SELECT r.id, p.id, 'ALL'::"erp"."PermissionScope"
FROM "erp"."roles" r
JOIN "erp"."permissions" p ON p.code IN ('student.delete', 'playbook.read', 'playbook.manage', 'report.read')
WHERE r.code = 'ADMIN'::"erp"."AppRole"
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

INSERT INTO "erp"."role_permissions" ("role_id", "permission_id", "scope")
SELECT r.id, p.id, 'ALL'::"erp"."PermissionScope"
FROM "erp"."roles" r
JOIN "erp"."permissions" p ON p.code IN ('playbook.read')
WHERE r.code IN ('SALES'::"erp"."AppRole", 'TEACHER'::"erp"."AppRole")
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

INSERT INTO "erp"."role_permissions" ("role_id", "permission_id", "scope")
SELECT r.id, p.id, 'ALL'::"erp"."PermissionScope"
FROM "erp"."roles" r
JOIN "erp"."permissions" p ON p.code IN (
  'billing.payment.void', 'billing.expense.void', 'playbook.read', 'report.read'
)
WHERE r.code = 'FINANCE'::"erp"."AppRole"
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

INSERT INTO "erp"."role_permissions" ("role_id", "permission_id", "scope")
SELECT r.id, p.id, 'ALL'::"erp"."PermissionScope"
FROM "erp"."roles" r
JOIN "erp"."permissions" p ON p.code IN ('playbook.read', 'report.read')
WHERE r.code = 'AUDITOR'::"erp"."AppRole"
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

-- The ERP authorization tables are server-only. Prevent accidental Data API access
-- even if the erp schema is later added to Supabase's exposed schema list.
REVOKE ALL ON TABLE "erp"."roles" FROM anon, authenticated;
REVOKE ALL ON TABLE "erp"."permissions" FROM anon, authenticated;
REVOKE ALL ON TABLE "erp"."role_permissions" FROM anon, authenticated;
REVOKE ALL ON TABLE "erp"."user_roles" FROM anon, authenticated;
