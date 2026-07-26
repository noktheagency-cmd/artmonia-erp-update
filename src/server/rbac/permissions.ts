import { AppRole, Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/server/db/prisma";

export const permissionScopes = ["ASSIGNED", "ALL"] as const;
export type PermissionScope = (typeof permissionScopes)[number];
export type PermissionAction = "read" | "create" | "update" | "delete" | "export" | "special";

export type PermissionDefinitionShape = {
  code: string;
  module: string;
  moduleLabel: string;
  tab: string;
  tabLabel: string;
  action: PermissionAction;
  actionLabel: string;
  description: string;
  sensitive?: boolean;
  supportsScope?: boolean;
  dependsOn?: string;
};

const define = <const T extends readonly PermissionDefinitionShape[]>(definitions: T) => definitions;

export const permissionDefinitions = define([
  { code: "dashboard.owner.read", module: "dashboard", moduleLabel: "Dashboard", tab: "owner", tabLabel: "Owner dashboard", action: "read", actionLabel: "Görə bilər", description: "Owner dashboard və ümumi biznes göstəriciləri" },
  { code: "dashboard.sales.read", module: "dashboard", moduleLabel: "Dashboard", tab: "sales", tabLabel: "Satış dashboard", action: "read", actionLabel: "Görə bilər", description: "Satış göstəriciləri" },
  { code: "dashboard.finance.read", module: "dashboard", moduleLabel: "Dashboard", tab: "finance", tabLabel: "Maliyyə dashboard", action: "read", actionLabel: "Görə bilər", description: "Maliyyə göstəriciləri", sensitive: true },
  { code: "dashboard.teacher.read", module: "dashboard", moduleLabel: "Dashboard", tab: "teacher", tabLabel: "Müəllim dashboard", action: "read", actionLabel: "Görə bilər", description: "Müəllim dashboard-u" },
  { code: "dashboard.marketing.read", module: "dashboard", moduleLabel: "Dashboard", tab: "marketing", tabLabel: "Marketing dashboard", action: "read", actionLabel: "Görə bilər", description: "Marketing kampaniya və performans göstəriciləri" },

  { code: "student.read", module: "students", moduleLabel: "Tələbələr", tab: "overview", tabLabel: "İcmal və siyahı", action: "read", actionLabel: "Görə bilər", description: "Tələbə məlumatlarını görmək", supportsScope: true },
  { code: "student.create", module: "students", moduleLabel: "Tələbələr", tab: "list", tabLabel: "Tələbə siyahısı", action: "create", actionLabel: "Əlavə edə bilər", description: "Yeni tələbə yaratmaq", dependsOn: "student.read" },
  { code: "student.update", module: "students", moduleLabel: "Tələbələr", tab: "list", tabLabel: "Tələbə siyahısı", action: "update", actionLabel: "Dəyişə bilər", description: "Tələbə profilini dəyişmək", supportsScope: true, dependsOn: "student.read" },
  { code: "student.delete", module: "students", moduleLabel: "Tələbələr", tab: "list", tabLabel: "Tələbə siyahısı", action: "delete", actionLabel: "Silə bilər", description: "Tələbəni silmək", sensitive: true, supportsScope: true, dependsOn: "student.read" },
  { code: "student.status.change", module: "students", moduleLabel: "Tələbələr", tab: "list", tabLabel: "Tələbə siyahısı", action: "special", actionLabel: "Statusu dəyişə bilər", description: "Tələbə lifecycle statusunu dəyişmək", sensitive: true, supportsScope: true, dependsOn: "student.read" },
  { code: "settings.manage", module: "students", moduleLabel: "Tələbələr", tab: "programs", tabLabel: "Proqramlar", action: "special", actionLabel: "Proqramları idarə edə bilər", description: "Proqram və lookup sazlamalarını idarə etmək", sensitive: true },

  { code: "crm.lead.read", module: "crm", moduleLabel: "CRM", tab: "leads", tabLabel: "İcmal və lead siyahısı", action: "read", actionLabel: "Görə bilər", description: "Lead məlumatlarını görmək", supportsScope: true },
  { code: "crm.lead.create", module: "crm", moduleLabel: "CRM", tab: "leads", tabLabel: "Lead siyahısı", action: "create", actionLabel: "Əlavə edə bilər", description: "Yeni lead yaratmaq", dependsOn: "crm.lead.read" },
  { code: "crm.lead.update", module: "crm", moduleLabel: "CRM", tab: "leads", tabLabel: "Lead siyahısı", action: "update", actionLabel: "Dəyişə bilər", description: "Lead profilini və mərhələsini dəyişmək", supportsScope: true, dependsOn: "crm.lead.read" },
  { code: "crm.lead.delete", module: "crm", moduleLabel: "CRM", tab: "leads", tabLabel: "Lead siyahısı", action: "delete", actionLabel: "Silə bilər", description: "Lead-i silmək", sensitive: true, supportsScope: true, dependsOn: "crm.lead.read" },
  { code: "crm.lead.convert", module: "crm", moduleLabel: "CRM", tab: "leads", tabLabel: "Lead siyahısı", action: "special", actionLabel: "Tələbəyə çevirə bilər", description: "Lead-i tələbəyə çevirmək", sensitive: true, supportsScope: true, dependsOn: "crm.lead.read" },

  { code: "billing.invoice.read", module: "finance", moduleLabel: "Maliyyə", tab: "overview", tabLabel: "Ümumi baxış və alacaqlar", action: "read", actionLabel: "Görə bilər", description: "Invoice və borc məlumatlarını görmək", sensitive: true },
  { code: "billing.invoice.generate", module: "finance", moduleLabel: "Maliyyə", tab: "debts", tabLabel: "Alacaqlar", action: "special", actionLabel: "Invoice yarada bilər", description: "Invoice yaratmaq", sensitive: true, dependsOn: "billing.invoice.read" },
  { code: "billing.payment.read", module: "finance", moduleLabel: "Maliyyə", tab: "payments", tabLabel: "Ödənişlər", action: "read", actionLabel: "Görə bilər", description: "Ödənişləri görmək", sensitive: true },
  { code: "billing.payment.create", module: "finance", moduleLabel: "Maliyyə", tab: "payments", tabLabel: "Ödənişlər", action: "create", actionLabel: "Əlavə edə bilər", description: "Ödəniş qeydə almaq", sensitive: true, dependsOn: "billing.payment.read" },
  { code: "billing.payment.void", module: "finance", moduleLabel: "Maliyyə", tab: "payments", tabLabel: "Ödənişlər", action: "delete", actionLabel: "Ləğv edə bilər", description: "Ödənişi ləğv etmək", sensitive: true, dependsOn: "billing.payment.read" },
  { code: "billing.expense.read", module: "finance", moduleLabel: "Maliyyə", tab: "expenses", tabLabel: "Xərclər", action: "read", actionLabel: "Görə bilər", description: "Xərcləri görmək", sensitive: true },
  { code: "billing.expense.create", module: "finance", moduleLabel: "Maliyyə", tab: "expenses", tabLabel: "Xərclər", action: "create", actionLabel: "Əlavə edə bilər", description: "Xərc yaratmaq", sensitive: true, dependsOn: "billing.expense.read" },
  { code: "billing.expense.void", module: "finance", moduleLabel: "Maliyyə", tab: "expenses", tabLabel: "Xərclər", action: "delete", actionLabel: "Ləğv edə bilər", description: "Xərci ləğv etmək", sensitive: true, dependsOn: "billing.expense.read" },
  { code: "billing.adjustment.request", module: "finance", moduleLabel: "Maliyyə", tab: "payments", tabLabel: "Ödənişlər", action: "special", actionLabel: "Düzəliş tələb edə bilər", description: "Refund və düzəliş istəyi", sensitive: true, dependsOn: "billing.payment.read" },
  { code: "billing.adjustment.approve.finance", module: "finance", moduleLabel: "Maliyyə", tab: "payments", tabLabel: "Ödənişlər", action: "special", actionLabel: "Finance təsdiqi", description: "Maliyyə təsdiqi vermək", sensitive: true, dependsOn: "billing.payment.read" },
  { code: "billing.adjustment.approve.owner", module: "finance", moduleLabel: "Maliyyə", tab: "payments", tabLabel: "Ödənişlər", action: "special", actionLabel: "Owner təsdiqi", description: "Owner təsdiqi vermək", sensitive: true, dependsOn: "billing.payment.read" },

  { code: "group.read", module: "groups", moduleLabel: "Qruplar", tab: "groups", tabLabel: "Qruplar", action: "read", actionLabel: "Görə bilər", description: "Qrupları və üzvləri görmək", supportsScope: true },
  { code: "group.manage", module: "groups", moduleLabel: "Qruplar", tab: "groups", tabLabel: "Qruplar", action: "special", actionLabel: "Qrupları idarə edə bilər", description: "Qrup və üzvlükləri idarə etmək", supportsScope: true, dependsOn: "group.read" },
  { code: "attendance.read", module: "groups", moduleLabel: "Qruplar", tab: "journal", tabLabel: "Jurnal", action: "read", actionLabel: "Görə bilər", description: "Davamiyyət jurnalını görmək", supportsScope: true },
  { code: "attendance.manage", module: "groups", moduleLabel: "Qruplar", tab: "journal", tabLabel: "Jurnal", action: "update", actionLabel: "Dəyişə bilər", description: "Davamiyyət qeyd etmək", supportsScope: true, dependsOn: "attendance.read" },

  { code: "workshop.read", module: "workshops", moduleLabel: "Workshop & Masterclass", tab: "overview", tabLabel: "İcmal, iştirakçılar və detallar", action: "read", actionLabel: "Görə bilər", description: "Tədbirləri görmək" },
  { code: "workshop.manage", module: "workshops", moduleLabel: "Workshop & Masterclass", tab: "details", tabLabel: "Tədbir və iştirakçılar", action: "special", actionLabel: "Tədbiri idarə edə bilər", description: "Tədbir və iştirakçıları idarə etmək", dependsOn: "workshop.read" },
  { code: "workshop.finance.read", module: "workshops", moduleLabel: "Workshop & Masterclass", tab: "payments", tabLabel: "Ödənişlər və xərclər", action: "read", actionLabel: "Görə bilər", description: "Workshop maliyyəsini görmək", sensitive: true, dependsOn: "workshop.read" },
  { code: "workshop.finance.manage", module: "workshops", moduleLabel: "Workshop & Masterclass", tab: "payments", tabLabel: "Ödənişlər və xərclər", action: "special", actionLabel: "Maliyyəni idarə edə bilər", description: "Workshop ödəniş və xərclərini idarə etmək", sensitive: true, dependsOn: "workshop.finance.read" },

  { code: "hr.employee.read", module: "hr", moduleLabel: "HR", tab: "employees", tabLabel: "İcmal və işçilər", action: "read", actionLabel: "Görə bilər", description: "İşçi profillərini görmək", sensitive: true },
  { code: "hr.employee.manage", module: "hr", moduleLabel: "HR", tab: "employees", tabLabel: "İşçilər", action: "special", actionLabel: "İşçiləri idarə edə bilər", description: "İşçi profillərini yaratmaq, dəyişmək və silmək", sensitive: true, dependsOn: "hr.employee.read" },
  { code: "hr.bonus.read", module: "hr", moduleLabel: "HR", tab: "bonus", tabLabel: "Bonus", action: "read", actionLabel: "Görə bilər", description: "Departament bonus kampaniyasını görmək", supportsScope: true },
  { code: "hr.bonus.manage", module: "hr", moduleLabel: "HR", tab: "bonus", tabLabel: "Bonus", action: "special", actionLabel: "Kampaniyanı idarə edə bilər", description: "Bonus kampaniyalarını yaratmaq, yeniləmək və ləğv etmək", sensitive: true, dependsOn: "hr.bonus.read" },
  { code: "hr.bonus.approve", module: "hr", moduleLabel: "HR", tab: "bonus", tabLabel: "Bonus", action: "special", actionLabel: "Bonusları təsdiqləyə bilər", description: "Açılmış əməkdaş bonus paylarını təsdiqləmək", sensitive: true, dependsOn: "hr.bonus.read" },
  { code: "teacher.read", module: "hr", moduleLabel: "HR", tab: "teachers", tabLabel: "Müəllimlər", action: "read", actionLabel: "Görə bilər", description: "Müəllim profillərini görmək", sensitive: true },
  { code: "teacher.account.manage", module: "hr", moduleLabel: "HR", tab: "teachers", tabLabel: "Müəllimlər", action: "special", actionLabel: "ERP hesabını bağlaya bilər", description: "Müəllim profilini ERP istifadəçisinə bağlamaq", sensitive: true, dependsOn: "teacher.read" },
  { code: "teacher.rule.manage", module: "hr", moduleLabel: "HR", tab: "teachers", tabLabel: "Müəllimlər", action: "special", actionLabel: "Maaş qaydasını dəyişə bilər", description: "Müəllim payout qaydalarını dəyişmək", sensitive: true, dependsOn: "teacher.read" },
  { code: "teacher.payout.read", module: "hr", moduleLabel: "HR", tab: "payroll", tabLabel: "Payroll", action: "read", actionLabel: "Görə bilər", description: "Müəllim payout hesabatını görmək", sensitive: true },
  { code: "teacher.payout.generate", module: "hr", moduleLabel: "HR", tab: "payroll", tabLabel: "Payroll", action: "special", actionLabel: "Payout yarada bilər", description: "Payout draft yaratmaq", sensitive: true, dependsOn: "teacher.payout.read" },
  { code: "teacher.payout.approve", module: "hr", moduleLabel: "HR", tab: "payroll", tabLabel: "Payroll", action: "special", actionLabel: "Payout təsdiqləyə bilər", description: "Payout təsdiqləmək", sensitive: true, dependsOn: "teacher.payout.read" },

  { code: "task.read", module: "tasks", moduleLabel: "Tasklar", tab: "tasks", tabLabel: "Tasklar", action: "read", actionLabel: "Görə bilər", description: "Taskları görmək", supportsScope: true },
  { code: "task.manage", module: "tasks", moduleLabel: "Tasklar", tab: "tasks", tabLabel: "Tasklar", action: "special", actionLabel: "Taskları idarə edə bilər", description: "Task yaratmaq, təyin etmək və tamamlamaq", supportsScope: true, dependsOn: "task.read" },
  { code: "marketing.read", module: "marketing", moduleLabel: "Marketing", tab: "campaigns", tabLabel: "Kampaniyalar", action: "read", actionLabel: "Görə bilər", description: "Marketing performansını görmək" },
  { code: "marketing.manage", module: "marketing", moduleLabel: "Marketing", tab: "campaigns", tabLabel: "Kampaniyalar", action: "special", actionLabel: "Kampaniyaları idarə edə bilər", description: "Kampaniyaları yaratmaq, dəyişmək və silmək", dependsOn: "marketing.read" },
  { code: "marketing.content.approve", module: "marketing", moduleLabel: "Marketing", tab: "content", tabLabel: "Content plan", action: "special", actionLabel: "Slide təsdiqləyə bilər", description: "Founder təsdiqi gözləyən slide-ı calendar üçün aktiv etmək və ya düzəlişə qaytarmaq", sensitive: true, dependsOn: "marketing.read" },
  { code: "playbook.read", module: "playbook", moduleLabel: "Playbook", tab: "library", tabLabel: "Sənədlər", action: "read", actionLabel: "Görə bilər", description: "Playbook sənədlərini görmək" },
  { code: "playbook.manage", module: "playbook", moduleLabel: "Playbook", tab: "library", tabLabel: "Sənədlər", action: "special", actionLabel: "Sənədləri idarə edə bilər", description: "Sənəd və departamentləri idarə etmək", dependsOn: "playbook.read" },
  { code: "report.read", module: "reports", moduleLabel: "Hesabatlar", tab: "reports", tabLabel: "Hesabatlar", action: "read", actionLabel: "Görə bilər", description: "Hesabat ekranını görmək" },
  { code: "report.export", module: "reports", moduleLabel: "Hesabatlar", tab: "reports", tabLabel: "Hesabatlar", action: "export", actionLabel: "İxrac edə bilər", description: "Excel/PDF ixrac etmək", sensitive: true, dependsOn: "report.read" },
  { code: "audit.read", module: "audit", moduleLabel: "Audit", tab: "logs", tabLabel: "Audit jurnalı", action: "read", actionLabel: "Görə bilər", description: "Audit loglarını görmək", sensitive: true },

  { code: "auth.user.read", module: "system", moduleLabel: "Sistem", tab: "users", tabLabel: "İstifadəçilər", action: "read", actionLabel: "Görə bilər", description: "ERP istifadəçilərini görmək", sensitive: true },
  { code: "auth.user.manage", module: "system", moduleLabel: "Sistem", tab: "users", tabLabel: "İstifadəçilər", action: "special", actionLabel: "İstifadəçiləri idarə edə bilər", description: "ERP istifadəçilərini idarə etmək", sensitive: true, dependsOn: "auth.user.read" },
  { code: "auth.role.read", module: "system", moduleLabel: "Sistem", tab: "roles", tabLabel: "Rol və icazələr", action: "read", actionLabel: "Görə bilər", description: "Rol və icazə matrisini görmək", sensitive: true },
  { code: "auth.role.manage", module: "system", moduleLabel: "Sistem", tab: "roles", tabLabel: "Rol və icazələr", action: "special", actionLabel: "İcazələri idarə edə bilər", description: "Rol icazələrini dəyişmək", sensitive: true, dependsOn: "auth.role.read" },
] as const);

export type PermissionDefinition = (typeof permissionDefinitions)[number];
export type PermissionCode = PermissionDefinition["code"];
export type EffectivePermissions = Map<PermissionCode, PermissionScope>;
export type PermissionGrant = { code: PermissionCode; scope: PermissionScope };

export const permissionCatalog = permissionDefinitions.map(
  ({ code, description }) => [code, description] as const
);

const legacyRolePermissionMap: Record<AppRole, PermissionCode[]> = {
  [AppRole.SUPER_ADMIN]: permissionDefinitions.map(({ code }) => code),
  [AppRole.OWNER]: ["auth.user.read", "auth.role.read", "auth.role.manage", "settings.manage", "crm.lead.read", "crm.lead.create", "crm.lead.update", "crm.lead.convert", "student.read", "student.create", "student.update", "student.delete", "student.status.change", "billing.invoice.read", "billing.invoice.generate", "billing.payment.read", "billing.payment.create", "billing.payment.void", "billing.expense.read", "billing.expense.create", "billing.expense.void", "billing.adjustment.request", "billing.adjustment.approve.owner", "workshop.read", "workshop.manage", "workshop.finance.read", "workshop.finance.manage", "group.read", "group.manage", "attendance.read", "attendance.manage", "teacher.read", "hr.employee.read", "hr.employee.manage", "teacher.account.manage", "teacher.rule.manage", "teacher.payout.read", "teacher.payout.generate", "teacher.payout.approve", "dashboard.owner.read", "dashboard.sales.read", "dashboard.finance.read", "dashboard.teacher.read", "task.read", "task.manage", "marketing.read", "marketing.manage", "marketing.content.approve", "playbook.read", "playbook.manage", "report.read", "report.export", "audit.read"],
  [AppRole.ADMIN]: ["crm.lead.read", "crm.lead.create", "crm.lead.update", "crm.lead.convert", "student.read", "student.create", "student.update", "student.delete", "student.status.change", "billing.invoice.read", "billing.payment.read", "billing.expense.read", "workshop.read", "workshop.manage", "workshop.finance.read", "group.read", "group.manage", "attendance.read", "attendance.manage", "teacher.read", "hr.employee.read", "hr.employee.manage", "teacher.account.manage", "dashboard.owner.read", "dashboard.sales.read", "dashboard.teacher.read", "task.read", "task.manage", "marketing.read", "marketing.manage", "playbook.read", "playbook.manage", "report.read", "report.export", "audit.read"],
  [AppRole.SALES]: ["crm.lead.read", "crm.lead.create", "crm.lead.update", "crm.lead.delete", "crm.lead.convert", "student.read", "dashboard.sales.read", "hr.bonus.read", "task.read", "task.manage", "playbook.read"],
  [AppRole.FINANCE]: ["student.read", "student.status.change", "billing.invoice.read", "billing.invoice.generate", "billing.payment.read", "billing.payment.create", "billing.payment.void", "billing.expense.read", "billing.expense.create", "billing.expense.void", "billing.adjustment.request", "billing.adjustment.approve.finance", "workshop.read", "workshop.finance.read", "workshop.finance.manage", "workshop.manage", "teacher.read", "hr.employee.read", "teacher.payout.read", "teacher.payout.generate", "dashboard.finance.read", "task.read", "task.manage", "report.read", "report.export", "audit.read", "marketing.read", "playbook.read"],
  [AppRole.TEACHER]: ["group.read", "attendance.read", "attendance.manage", "dashboard.teacher.read", "hr.bonus.read", "task.read", "task.manage", "playbook.read"],
  [AppRole.AUDITOR]: ["student.read", "billing.invoice.read", "billing.payment.read", "billing.expense.read", "workshop.read", "workshop.finance.read", "teacher.read", "hr.employee.read", "dashboard.owner.read", "dashboard.sales.read", "dashboard.finance.read", "dashboard.teacher.read", "report.read", "audit.read", "playbook.read"],
};

legacyRolePermissionMap[AppRole.OWNER].unshift("hr.bonus.read", "hr.bonus.manage", "hr.bonus.approve");
legacyRolePermissionMap[AppRole.ADMIN].unshift("hr.bonus.read", "hr.bonus.manage", "hr.bonus.approve");
legacyRolePermissionMap[AppRole.FINANCE].unshift("hr.bonus.read");
legacyRolePermissionMap[AppRole.AUDITOR].unshift("hr.bonus.read");

export const rolePermissionMap = legacyRolePermissionMap;

export function getPermissionsForRoles(roles: AppRole[]): EffectivePermissions {
  const permissions: EffectivePermissions = new Map();
  for (const role of roles) {
    for (const code of rolePermissionMap[role] ?? []) permissions.set(code, "ALL");
  }
  return permissions;
}

type PermissionGrantRow = { code: string; scope: string };

export async function loadPermissionsForUser(userId: string, roles: AppRole[]): Promise<EffectivePermissions> {
  if (roles.includes(AppRole.SUPER_ADMIN)) return getPermissionsForRoles([AppRole.SUPER_ADMIN]);

  const rows = await getPrisma().$queryRaw<PermissionGrantRow[]>(Prisma.sql`
    select p.code,
      case when bool_or(rp.scope::text = 'ALL') then 'ALL' else 'ASSIGNED' end as scope
    from erp.user_roles ur
    join erp.role_permissions rp on rp.role_id = ur.role_id
    join erp.permissions p on p.id = rp.permission_id
    where ur.user_id = ${userId}::uuid
    group by p.code
  `);
  const permissions: EffectivePermissions = new Map();
  for (const row of rows) {
    if (isPermissionCode(row.code)) permissions.set(row.code, row.scope === "ALL" ? "ALL" : "ASSIGNED");
  }
  return permissions;
}

const permissionCodeSet = new Set<string>(permissionDefinitions.map(({ code }) => code));
export function isPermissionCode(value: string): value is PermissionCode {
  return permissionCodeSet.has(value);
}

export function scopeFor(permissions: EffectivePermissions, permission: PermissionCode) {
  return permissions.get(permission) ?? null;
}

export function can(permissions: EffectivePermissions, permission: PermissionCode) {
  return permissions.has(permission);
}

export function hasPermission(subject: AppRole[] | EffectivePermissions, permission: PermissionCode) {
  return Array.isArray(subject)
    ? getPermissionsForRoles(subject).has(permission)
    : subject.has(permission);
}

export function assertPermission(subject: AppRole[] | EffectivePermissions, permission: PermissionCode) {
  if (!hasPermission(subject, permission)) throw new Error(`Missing permission: ${permission}`);
}

export function getDependentPermissionCodes(code: PermissionCode) {
  return permissionDefinitions
    .filter((definition) => "dependsOn" in definition && definition.dependsOn === code)
    .map((definition) => definition.code);
}
