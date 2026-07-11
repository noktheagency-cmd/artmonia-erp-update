INSERT INTO "erp"."roles" ("id", "code", "name", "created_at", "updated_at")
VALUES
  (gen_random_uuid(), 'SUPER_ADMIN', 'Super Admin', now(), now()),
  (gen_random_uuid(), 'OWNER', 'Owner', now(), now()),
  (gen_random_uuid(), 'ADMIN', 'Admin', now(), now()),
  (gen_random_uuid(), 'SALES', 'Sales', now(), now()),
  (gen_random_uuid(), 'FINANCE', 'Finance', now(), now()),
  (gen_random_uuid(), 'TEACHER', 'Teacher', now(), now()),
  (gen_random_uuid(), 'AUDITOR', 'Auditor', now(), now())
ON CONFLICT ("code") DO UPDATE SET "name" = EXCLUDED."name";

INSERT INTO "erp"."permissions" ("id", "code", "description")
VALUES
  (gen_random_uuid(), 'dashboard.owner.read', 'Owner dashboard and business metrics'),
  (gen_random_uuid(), 'dashboard.sales.read', 'Sales dashboard'),
  (gen_random_uuid(), 'dashboard.finance.read', 'Finance dashboard'),
  (gen_random_uuid(), 'dashboard.teacher.read', 'Teacher dashboard'),
  (gen_random_uuid(), 'student.read', 'Read students'),
  (gen_random_uuid(), 'student.create', 'Create students'),
  (gen_random_uuid(), 'student.update', 'Update student profiles'),
  (gen_random_uuid(), 'student.delete', 'Delete students'),
  (gen_random_uuid(), 'student.status.change', 'Change student lifecycle status'),
  (gen_random_uuid(), 'settings.manage', 'Manage lookup settings and system configuration'),
  (gen_random_uuid(), 'crm.lead.read', 'Read leads'),
  (gen_random_uuid(), 'crm.lead.create', 'Create leads'),
  (gen_random_uuid(), 'crm.lead.update', 'Update leads'),
  (gen_random_uuid(), 'crm.lead.delete', 'Delete leads'),
  (gen_random_uuid(), 'crm.lead.convert', 'Convert leads to students'),
  (gen_random_uuid(), 'billing.invoice.read', 'Read invoices'),
  (gen_random_uuid(), 'billing.invoice.generate', 'Generate invoices'),
  (gen_random_uuid(), 'billing.payment.read', 'Read payments'),
  (gen_random_uuid(), 'billing.payment.create', 'Create payments'),
  (gen_random_uuid(), 'billing.payment.void', 'Void payments'),
  (gen_random_uuid(), 'billing.expense.read', 'Read expenses'),
  (gen_random_uuid(), 'billing.expense.create', 'Create expenses'),
  (gen_random_uuid(), 'billing.expense.void', 'Void expenses'),
  (gen_random_uuid(), 'billing.adjustment.request', 'Request refunds or adjustments'),
  (gen_random_uuid(), 'billing.adjustment.approve.finance', 'Finance approval for adjustments'),
  (gen_random_uuid(), 'billing.adjustment.approve.owner', 'Owner approval for adjustments'),
  (gen_random_uuid(), 'group.read', 'Read student groups'),
  (gen_random_uuid(), 'group.manage', 'Manage groups and memberships'),
  (gen_random_uuid(), 'attendance.read', 'Read attendance journals'),
  (gen_random_uuid(), 'attendance.manage', 'Manage attendance journals'),
  (gen_random_uuid(), 'workshop.read', 'Read workshops and masterclasses'),
  (gen_random_uuid(), 'workshop.manage', 'Manage workshops and participants'),
  (gen_random_uuid(), 'workshop.finance.read', 'Read workshop financials'),
  (gen_random_uuid(), 'workshop.finance.manage', 'Manage workshop financials'),
  (gen_random_uuid(), 'hr.employee.read', 'Read employee profiles'),
  (gen_random_uuid(), 'hr.employee.manage', 'Manage employee profiles'),
  (gen_random_uuid(), 'teacher.read', 'Read teacher profiles'),
  (gen_random_uuid(), 'teacher.account.manage', 'Link teacher ERP accounts'),
  (gen_random_uuid(), 'teacher.rule.manage', 'Manage teacher payout rules'),
  (gen_random_uuid(), 'teacher.payout.read', 'Read teacher payouts'),
  (gen_random_uuid(), 'teacher.payout.generate', 'Generate teacher payouts'),
  (gen_random_uuid(), 'teacher.payout.approve', 'Approve teacher payouts'),
  (gen_random_uuid(), 'task.read', 'Read tasks'),
  (gen_random_uuid(), 'task.manage', 'Manage tasks'),
  (gen_random_uuid(), 'marketing.read', 'Read marketing campaigns'),
  (gen_random_uuid(), 'marketing.manage', 'Manage marketing campaigns'),
  (gen_random_uuid(), 'playbook.read', 'Read playbook documents'),
  (gen_random_uuid(), 'playbook.manage', 'Manage playbook documents'),
  (gen_random_uuid(), 'report.read', 'Read reports workspace'),
  (gen_random_uuid(), 'report.export', 'Export reports'),
  (gen_random_uuid(), 'audit.read', 'Read audit logs'),
  (gen_random_uuid(), 'auth.user.read', 'Read ERP users'),
  (gen_random_uuid(), 'auth.user.manage', 'Manage ERP users'),
  (gen_random_uuid(), 'auth.role.read', 'Read role permission matrix'),
  (gen_random_uuid(), 'auth.role.manage', 'Manage role permissions')
ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description";

INSERT INTO "erp"."role_permissions" ("role_id", "permission_id", "scope")
SELECT r.id, p.id, 'ALL'::"erp"."PermissionScope"
FROM "erp"."roles" r CROSS JOIN "erp"."permissions" p
WHERE r.code = 'SUPER_ADMIN'::"erp"."AppRole"
ON CONFLICT ("role_id", "permission_id") DO UPDATE SET "scope" = EXCLUDED."scope";

WITH defaults(role_code, codes) AS (
  VALUES
  ('OWNER', ARRAY['auth.user.read','auth.role.read','settings.manage','crm.lead.read','crm.lead.create','crm.lead.update','crm.lead.convert','student.read','student.create','student.update','student.delete','student.status.change','billing.invoice.read','billing.invoice.generate','billing.payment.read','billing.payment.create','billing.payment.void','billing.expense.read','billing.expense.create','billing.expense.void','billing.adjustment.request','billing.adjustment.approve.owner','workshop.read','workshop.manage','workshop.finance.read','workshop.finance.manage','group.read','group.manage','attendance.read','attendance.manage','teacher.read','hr.employee.read','hr.employee.manage','teacher.account.manage','teacher.rule.manage','teacher.payout.read','teacher.payout.generate','teacher.payout.approve','dashboard.owner.read','dashboard.sales.read','dashboard.finance.read','dashboard.teacher.read','task.read','task.manage','marketing.read','marketing.manage','playbook.read','playbook.manage','report.read','report.export','audit.read']::text[]),
  ('ADMIN', ARRAY['crm.lead.read','crm.lead.create','crm.lead.update','crm.lead.convert','student.read','student.create','student.update','student.delete','student.status.change','billing.invoice.read','billing.payment.read','billing.expense.read','workshop.read','workshop.manage','workshop.finance.read','group.read','group.manage','attendance.read','attendance.manage','teacher.read','hr.employee.read','hr.employee.manage','teacher.account.manage','dashboard.owner.read','dashboard.sales.read','dashboard.teacher.read','task.read','task.manage','marketing.read','marketing.manage','playbook.read','playbook.manage','report.read','report.export','audit.read']::text[]),
  ('SALES', ARRAY['crm.lead.read','crm.lead.create','crm.lead.update','crm.lead.convert','student.read','student.create','workshop.read','workshop.manage','dashboard.sales.read','task.read','task.manage','marketing.read','marketing.manage','playbook.read']::text[]),
  ('FINANCE', ARRAY['student.read','student.status.change','billing.invoice.read','billing.invoice.generate','billing.payment.read','billing.payment.create','billing.payment.void','billing.expense.read','billing.expense.create','billing.expense.void','billing.adjustment.request','billing.adjustment.approve.finance','workshop.read','workshop.finance.read','workshop.finance.manage','workshop.manage','teacher.read','hr.employee.read','teacher.payout.read','teacher.payout.generate','dashboard.finance.read','task.read','task.manage','report.read','report.export','audit.read','marketing.read','playbook.read']::text[]),
  ('TEACHER', ARRAY['student.read','group.read','attendance.read','attendance.manage','workshop.read','teacher.payout.read','dashboard.teacher.read','task.read','playbook.read']::text[]),
  ('AUDITOR', ARRAY['student.read','billing.invoice.read','billing.payment.read','billing.expense.read','workshop.read','workshop.finance.read','teacher.read','hr.employee.read','dashboard.owner.read','dashboard.sales.read','dashboard.finance.read','dashboard.teacher.read','report.read','audit.read','playbook.read']::text[])
)
INSERT INTO "erp"."role_permissions" ("role_id", "permission_id", "scope")
SELECT r.id, p.id,
  CASE
    WHEN d.role_code = 'SALES' AND p.code IN ('crm.lead.read','crm.lead.update','crm.lead.convert') THEN 'ASSIGNED'::"erp"."PermissionScope"
    WHEN d.role_code = 'TEACHER' AND p.code IN ('student.read','group.read','attendance.read','attendance.manage','task.read') THEN 'ASSIGNED'::"erp"."PermissionScope"
    ELSE 'ALL'::"erp"."PermissionScope"
  END
FROM defaults d
JOIN "erp"."roles" r ON r.code::text = d.role_code
JOIN "erp"."permissions" p ON p.code = ANY(d.codes)
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
