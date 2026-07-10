import { AppRole } from "@/generated/prisma/client";

export const permissionCatalog = [
  ["auth.user.read", "Read ERP users"],
  ["auth.user.manage", "Create and manage ERP users"],
  ["settings.manage", "Manage lookup settings and system configuration"],
  ["crm.lead.read", "Read leads"],
  ["crm.lead.create", "Create leads"],
  ["crm.lead.update", "Update lead details and stage"],
  ["crm.lead.convert", "Convert lead to student"],
  ["student.read", "Read students"],
  ["student.create", "Create students"],
  ["student.update", "Update student profile"],
  ["student.status.change", "Change student lifecycle status"],
  ["billing.invoice.read", "Read invoices"],
  ["billing.invoice.generate", "Generate invoices"],
  ["billing.payment.read", "Read payments"],
  ["billing.payment.create", "Create payments"],
  ["billing.expense.read", "Read expenses"],
  ["billing.expense.create", "Create expenses"],
  ["billing.adjustment.request", "Request refunds or adjustments"],
  ["billing.adjustment.approve.finance", "Finance approval for refunds or adjustments"],
  ["billing.adjustment.approve.owner", "Owner approval for refunds or adjustments"],
  ["workshop.read", "Read workshops and masterclasses"],
  ["workshop.manage", "Create workshops, assign participants, and record event payments"],
  ["workshop.finance.read", "Read workshop and masterclass financials"],
  ["workshop.finance.manage", "Record and void workshop payments and expenses"],
  ["group.read", "Read student groups"],
  ["group.manage", "Create groups and manage group memberships"],
  ["attendance.read", "Read group attendance journals"],
  ["attendance.manage", "Record group attendance"],
  ["teacher.read", "Read teacher profiles"],
  ["teacher.account.manage", "Link teacher profiles to ERP users"],
  ["teacher.rule.manage", "Manage teacher payout rules"],
  ["teacher.payout.read", "Read teacher payout reports"],
  ["teacher.payout.generate", "Generate teacher payout drafts"],
  ["teacher.payout.approve", "Approve teacher payout"],
  ["dashboard.owner.read", "Read owner dashboard"],
  ["dashboard.sales.read", "Read sales dashboard"],
  ["dashboard.finance.read", "Read finance dashboard"],
  ["dashboard.teacher.read", "Read teacher dashboard"],
  ["task.read", "Read tasks"],
  ["task.manage", "Create, assign, and complete tasks"],
  ["report.export", "Export reports"],
  ["audit.read", "Read audit logs"],
] as const;

export type PermissionCode = (typeof permissionCatalog)[number][0];

export const rolePermissionMap: Record<AppRole, PermissionCode[]> = {
  [AppRole.SUPER_ADMIN]: permissionCatalog.map(([code]) => code),
  [AppRole.OWNER]: [
    "auth.user.read",
    "settings.manage",
    "crm.lead.read",
    "crm.lead.create",
    "crm.lead.update",
    "crm.lead.convert",
    "student.read",
    "student.create",
    "student.update",
    "student.status.change",
    "billing.invoice.read",
    "billing.invoice.generate",
    "billing.payment.read",
    "billing.payment.create",
    "billing.expense.read",
    "billing.expense.create",
    "billing.adjustment.request",
    "billing.adjustment.approve.owner",
    "workshop.read",
    "workshop.manage",
    "workshop.finance.read",
    "workshop.finance.manage",
    "group.read",
    "group.manage",
    "attendance.read",
    "attendance.manage",
    "teacher.read",
    "teacher.account.manage",
    "teacher.rule.manage",
    "teacher.payout.read",
    "teacher.payout.generate",
    "teacher.payout.approve",
    "dashboard.owner.read",
    "dashboard.sales.read",
    "dashboard.finance.read",
    "dashboard.teacher.read",
    "task.read",
    "task.manage",
    "report.export",
    "audit.read",
  ],
  [AppRole.ADMIN]: [
    "crm.lead.read",
    "crm.lead.create",
    "crm.lead.update",
    "crm.lead.convert",
    "student.read",
    "student.create",
    "student.update",
    "student.status.change",
    "billing.invoice.read",
    "billing.payment.read",
    "billing.expense.read",
    "workshop.read",
    "workshop.manage",
    "workshop.finance.read",
    "group.read",
    "group.manage",
    "attendance.read",
    "attendance.manage",
    "teacher.read",
    "teacher.account.manage",
    "dashboard.owner.read",
    "dashboard.sales.read",
    "dashboard.teacher.read",
    "task.read",
    "task.manage",
    "report.export",
    "audit.read",
  ],
  [AppRole.SALES]: [
    "crm.lead.read",
    "crm.lead.create",
    "crm.lead.update",
    "crm.lead.convert",
    "student.read",
    "student.create",
    "workshop.read",
    "workshop.manage",
    "dashboard.sales.read",
    "task.read",
    "task.manage",
  ],
  [AppRole.FINANCE]: [
    "student.read",
    "student.status.change",
    "billing.invoice.read",
    "billing.invoice.generate",
    "billing.payment.read",
    "billing.payment.create",
    "billing.expense.read",
    "billing.expense.create",
    "billing.adjustment.request",
    "billing.adjustment.approve.finance",
    "workshop.read",
    "workshop.finance.read",
    "workshop.finance.manage",
    "workshop.manage",
    "teacher.read",
    "teacher.payout.read",
    "teacher.payout.generate",
    "dashboard.finance.read",
    "task.read",
    "task.manage",
    "report.export",
    "audit.read",
  ],
  [AppRole.TEACHER]: [
    "student.read",
    "group.read",
    "attendance.read",
    "attendance.manage",
    "workshop.read",
    "teacher.payout.read",
    "dashboard.teacher.read",
    "task.read",
  ],
  [AppRole.AUDITOR]: [
    "student.read",
    "billing.invoice.read",
    "billing.payment.read",
    "billing.expense.read",
    "workshop.read",
    "workshop.finance.read",
    "teacher.read",
    "dashboard.owner.read",
    "dashboard.sales.read",
    "dashboard.finance.read",
    "dashboard.teacher.read",
    "audit.read",
  ],
};

const permissionCache = new Map<string, Set<PermissionCode>>();

export function getPermissionsForRoles(roles: AppRole[]) {
  const cacheKey = [...new Set(roles)].sort().join("|");
  const cachedPermissions = permissionCache.get(cacheKey);

  if (cachedPermissions) {
    return cachedPermissions;
  }

  const permissions = new Set(
    roles.flatMap((role) => rolePermissionMap[role] ?? [])
  );
  permissionCache.set(cacheKey, permissions);

  return permissions;
}

export function hasPermission(roles: AppRole[], permission: PermissionCode) {
  return getPermissionsForRoles(roles).has(permission);
}

export function assertPermission(roles: AppRole[], permission: PermissionCode) {
  if (!hasPermission(roles, permission)) {
    throw new Error(`Missing permission: ${permission}`);
  }
}
