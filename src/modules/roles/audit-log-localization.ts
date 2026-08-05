const actionLabels: Record<string, string> = {
  "attendance.batch.update": "Davamiyyət qeydləri yeniləndi",
  "auth.user.create": "İstifadəçi hesabı yaradıldı",
  "class_slot.create": "Dərs vaxtı yaradıldı",
  "class_slot.update": "Dərs vaxtı yeniləndi",
  "class_slot.version.create": "Dərs vaxtının yeni versiyası yaradıldı",
  "dropdown_option.create": "Siyahı seçimi yaradıldı",
  "dropdown_option.update": "Siyahı seçimi yeniləndi",
  "dropdown_option.delete": "Siyahı seçimi silindi",
  "finance.expense.create": "Xərc qeydi yaradıldı",
  "finance.expense.update": "Xərc qeydi yeniləndi",
  "finance.expense.delete": "Xərc qeydi silindi",
  "finance.expense_category.create": "Xərc kateqoriyası yaradıldı",
  "finance.expense_category.update": "Xərc kateqoriyası yeniləndi",
  "finance.expense_category.delete": "Xərc kateqoriyası silindi",
  "finance.payment.delete": "Ödəniş silindi",
  "finance.payment.record": "Ödəniş qeydə alındı",
  "finance.payment.update": "Ödəniş yeniləndi",
  "group.archive": "Qrup arxivləndi",
  "group.create": "Qrup yaradıldı",
  "group.update": "Qrup yeniləndi",
  "group.membership.add": "Tələbə qrupa əlavə edildi",
  "group.membership.end": "Tələbənin qrup üzvlüyü bitirildi",
  "group.membership.remove": "Tələbə qrupdan çıxarıldı",
  "group.membership.teacher.change": "Qrup müəllimi dəyişdirildi",
  "hr.bonus.awards.approve": "Bonus payları təsdiqləndi",
  "hr.bonus.awards.post": "Bonus payları maliyyəyə göndərildi",
  "hr.bonus.campaign.cancel": "Bonus kampaniyası ləğv edildi",
  "hr.bonus.campaign.create": "Bonus kampaniyası yaradıldı",
  "hr.bonus.campaign.recur": "Növbəti bonus kampaniyası yaradıldı",
  "hr.bonus.progress.adjust": "Bonus irəliləyişi düzəldildi",
  "hr.bonus.stage.unlock": "Bonus mərhələsi açıldı",
  "hr.bonus.teacher.award.calculate": "Müəllim bonusu hesablandı",
  "hr.credentials.create": "Sistemə giriş məlumatları yaradıldı",
  "hr.credentials.update": "Sistemə giriş məlumatları yeniləndi",
  "hr.employee.delete": "Əməkdaş profili silindi",
  "hr.employee.update": "Əməkdaş profili yeniləndi",
  "hr.notification.send": "Əməkdaşa bildiriş göndərildi",
  "hr.notification.status.update": "Bildiriş statusu yeniləndi",
  "hr.staff.create": "Əməkdaş profili yaradıldı",
  "lead.convert": "Müraciət tələbəyə çevrildi",
  "lead.convert_to_student": "Müraciət tələbəyə çevrildi",
  "lead.create": "Müraciət yaradıldı",
  "lead.delete": "Müraciət silindi",
  "lead.stage.change": "Müraciətin mərhələsi dəyişdirildi",
  "lead.stage.update": "Müraciətin mərhələsi yeniləndi",
  "lead.update": "Müraciət yeniləndi",
  "marketing.campaign.create": "Marketinq kampaniyası yaradıldı",
  "marketing.campaign.delete": "Marketinq kampaniyası silindi",
  "marketing.campaign.update": "Marketinq kampaniyası yeniləndi",
  "marketing.content.approve": "Marketinq məzmunu təsdiqləndi",
  "marketing.content.create": "Marketinq məzmunu yaradıldı",
  "marketing.content.revision_request": "Marketinq məzmununa düzəliş istənildi",
  "marketing.content.schedule": "Marketinq məzmunu təqvimə əlavə edildi",
  "marketing.content.unschedule": "Marketinq məzmunu təqvimdən çıxarıldı",
  "marketing.content.update": "Marketinq məzmunu yeniləndi",
  "marketing.meta.sync": "Meta reklam nəticələri sinxronlaşdırıldı",
  "marketing.report.create": "Marketinq hesabatı yaradıldı",
  "marketing.stat.save": "Kampaniya göstəricisi saxlanıldı",
  "marketing.strategy.create": "Marketinq strategiyası yaradıldı",
  "marketing.strategy.expense.create": "Marketinq strategiyasına xərc əlavə edildi",
  "marketing.strategy.update": "Marketinq strategiyası yeniləndi",
  MCP_READ: "Sistem məlumatları oxundu",
  "payment.void": "Ödəniş ləğv edildi",
  "role.create": "Rol yaradıldı",
  "role.delete": "Rol silindi",
  "role.permissions.update": "Rol icazələri yeniləndi",
  "student.create": "Tələbə yaradıldı",
  "student.delete": "Tələbə silindi",
  "student.payment.record": "Tələbə ödənişi qeydə alındı",
  "student.profile.update": "Tələbə profili yeniləndi",
  "student.status.change": "Tələbə statusu dəyişdirildi",
  "student.update": "Tələbə yeniləndi",
  "student_schedule.replace": "Tələbənin dərs planı yeniləndi",
  "task.create": "Tapşırıq yaradıldı",
  "task.status.update": "Tapşırıq statusu yeniləndi",
  "teacher.account.link": "Müəllimin sistem hesabı əlaqələndirildi",
  "teacher.archive": "Müəllim profili arxivləndi",
  "teacher.create": "Müəllim yaradıldı",
  "teacher.salary.rule.update": "Müəllimin maaş qaydası yeniləndi",
  "teacher.update": "Müəllim yeniləndi",
  "user.roles.update": "İstifadəçinin rolları yeniləndi",
  "workshop.event.create": "Tədbir yaradıldı",
  "workshop.event.delete": "Tədbir silindi",
  "workshop.event.update": "Tədbir yeniləndi",
  "workshop.expense.create": "Tədbir xərci yaradıldı",
  "workshop.expense.replace": "Tədbir xərci əvəz edildi",
  "workshop.expense.void": "Tədbir xərci ləğv edildi",
  "workshop.participant.assign": "Tədbir iştirakçısı əlavə edildi",
  "workshop.participant.cancel": "Tədbir iştirakçısı ləğv edildi",
  "workshop.participant.delete": "Tədbir iştirakçısı silindi",
  "workshop.participant.update": "Tədbir iştirakçısı yeniləndi",
  "workshop.payment.create": "Tədbir ödənişi qeydə alındı",
  "workshop.payment.replace": "Tədbir ödənişi əvəz edildi",
  "workshop.payment.void": "Tədbir ödənişi ləğv edildi",
};

const entityLabels: Record<string, string> = {
  class_slot: "Dərs vaxtı",
  dropdown_catalog_option: "Siyahı seçimi",
  finance_expense: "Xərc qeydi",
  finance_expense_category: "Xərc kateqoriyası",
  group: "Qrup",
  group_membership: "Qrup üzvlüyü",
  group_session: "Qrup dərsi",
  hr_bonus_award: "Bonus payı",
  hr_bonus_campaign: "Bonus kampaniyası",
  hr_bonus_stage: "Bonus mərhələsi",
  hr_employee: "Əməkdaş",
  lead: "Müraciət",
  marketing_campaign: "Marketinq kampaniyası",
  marketing_campaign_stat: "Marketinq kampaniyasının göstəricisi",
  marketing_content: "Marketinq məzmunu",
  marketing_integration: "Marketinq inteqrasiyası",
  marketing_strategy: "Marketinq strategiyası",
  marketing_strategy_expense: "Marketinq strategiyasının xərci",
  MCP_TOOL: "Sistem aləti",
  payment: "Ödəniş",
  role: "Rol",
  student: "Tələbə",
  task: "Tapşırıq",
  teacher: "Müəllim",
  user: "İstifadəçi",
  workshop_event: "Tədbir",
  workshop_participant: "Tədbir iştirakçısı",
  workshop_payment: "Tədbir ödənişi",
};

const fieldLabels: Record<string, string> = {
  amount: "Məbləğ",
  approvedCount: "Təsdiqlənənlərin sayı",
  assignedToId: "Təyin edilən əməkdaşın identifikatoru",
  authUserId: "Giriş hesabının identifikatoru",
  campaignId: "Kampaniyanın identifikatoru",
  code: "Kod",
  copiedFrom: "Köçürüldüyü rol",
  createdAt: "Yaradılma vaxtı",
  currency: "Valyuta",
  decision: "Qərar",
  department: "Şöbə",
  description: "Təsvir",
  email: "E-poçt",
  employeeId: "Əməkdaşın identifikatoru",
  endedAt: "Bitmə vaxtı",
  fullName: "Ad və soyad",
  groupId: "Qrupun identifikatoru",
  hrEmployeeCreated: "Əməkdaş profili yaradılıb",
  id: "İdentifikator",
  intent: "Məqsəd",
  isActive: "Aktivdir",
  key: "Açar",
  leadId: "Müraciətin identifikatoru",
  loginCreated: "Giriş hesabı yaradılıb",
  name: "Ad",
  note: "Qeyd",
  notes: "Qeydlər",
  outcome: "Nəticə",
  paymentMethod: "Ödəniş üsulu",
  permissionId: "İcazənin identifikatoru",
  position: "Vəzifə",
  postedCount: "Göndərilənlərin sayı",
  profilePhotoUrl: "Profil şəklinin keçidi",
  reason: "Səbəb",
  reportId: "Hesabatın identifikatoru",
  roleId: "Rolun identifikatoru",
  roleIds: "Rol identifikatorları",
  roles: "Rollar",
  salaryPercent: "Maaş faizi",
  scope: "Əhatə dairəsi",
  stageId: "Mərhələnin identifikatoru",
  staffType: "Əməkdaş növü",
  status: "Status",
  studentId: "Tələbənin identifikatoru",
  teacherId: "Müəllimin identifikatoru",
  title: "Başlıq",
  updatedAt: "Yenilənmə vaxtı",
  userId: "İstifadəçinin identifikatoru",
};

const valueLabels: Record<string, string> = {
  ACTIVE: "Aktiv",
  ALL: "Hamısı",
  APPROVED: "Təsdiqlənib",
  ASSIGNED: "Təyin edilənlər",
  CANCELLED: "Ləğv edilib",
  COMPLETED: "Tamamlanıb",
  DRAFT: "Qaralama",
  FINANCE: "Maliyyə",
  INACTIVE: "Passiv",
  OWNER: "Sahib",
  PENDING: "Gözləmədə",
  PENDING_HR: "İnsan resurslarının təsdiqini gözləyir",
  REJECTED: "Rədd edilib",
  SALES: "Satış",
  SUBMITTED: "Təsdiqə göndərilib",
  SUPER_ADMIN: "Baş inzibatçı",
  TEACHER: "Müəllim",
  VOIDED: "Ləğv edilib",
};

const identifierTokens: Record<string, string> = {
  account: "hesab",
  action: "əməliyyat",
  active: "aktiv",
  add: "əlavə etmə",
  adjustment: "düzəliş",
  admin: "inzibatçı",
  approve: "təsdiqləmə",
  archive: "arxivləmə",
  assign: "təyin etmə",
  attendance: "davamiyyət",
  audit: "fəaliyyət jurnalı",
  auth: "giriş və təhlükəsizlik",
  award: "bonus payı",
  awards: "bonus payları",
  batch: "toplu",
  bonus: "bonus",
  billing: "hesablaşma",
  calculate: "hesablama",
  campaign: "kampaniya",
  cancel: "ləğv etmə",
  category: "kateqoriya",
  change: "dəyişiklik",
  class: "dərs",
  code: "kod",
  content: "məzmun",
  convert: "çevirmə",
  create: "yaratma",
  crm: "müştəri münasibətləri",
  credentials: "giriş məlumatları",
  delete: "silmə",
  dashboard: "göstəricilər paneli",
  employee: "əməkdaş",
  end: "bitirmə",
  event: "tədbir",
  export: "ixrac",
  expense: "xərc",
  finance: "maliyyə",
  generate: "yaratma",
  group: "qrup",
  hr: "insan resursları",
  id: "identifikator",
  invoice: "hesab-faktura",
  integration: "inteqrasiya",
  lead: "müraciət",
  link: "əlaqələndirmə",
  manage: "idarəetmə",
  marketing: "marketinq",
  membership: "üzvlük",
  notification: "bildiriş",
  nested: "daxili",
  option: "seçim",
  owner: "sahib",
  participant: "iştirakçı",
  payment: "ödəniş",
  payout: "maaş ödənişi",
  permission: "icazə",
  permissions: "icazələr",
  playbook: "qaydalar kitabçası",
  post: "göndərmə",
  profile: "profil",
  progress: "irəliləyiş",
  read: "baxış",
  record: "qeydə alma",
  remove: "çıxarma",
  replace: "əvəz etmə",
  report: "hesabat",
  request: "sorğu",
  revision: "düzəliş",
  role: "rol",
  roles: "rollar",
  rule: "qayda",
  salary: "maaş",
  sales: "satış",
  schedule: "dərs planı",
  session: "dərs",
  slot: "vaxt",
  stage: "mərhələ",
  stat: "göstərici",
  status: "status",
  settings: "sazlamalar",
  strategy: "strategiya",
  student: "tələbə",
  sync: "sinxronlaşdırma",
  task: "tapşırıq",
  teacher: "müəllim",
  unlock: "açma",
  unschedule: "təqvimdən çıxarma",
  update: "yeniləmə",
  user: "istifadəçi",
  value: "dəyər",
  version: "versiya",
  void: "ləğv etmə",
  workshop: "tədbir",
};

const reasonTerms: Array<[RegExp, string]> = [
  [/\bcustom\b/giu, "fərdi"],
  [/\btask\b/giu, "tapşırıq"],
  [/roster-ində/giu, "heyət siyahısında"],
  [/\broster\b/giu, "heyət siyahısı"],
  [/\blogin\b/giu, "giriş"],
  [/\bchurn\b/giu, "iştirakçı itkisi"],
  [/\bslide\b/giu, "slayd"],
  [/\bfounder\b/giu, "təsisçi"],
  [/\bcalendar\b/giu, "təqvim"],
  [/\bmarketing\b/giu, "marketinq"],
  [/\bworkshop\/?masterclass\b/giu, "tədbir və ustad dərsi"],
  [/\bworkshop\b/giu, "tədbir"],
];

export function getAuditActionLabel(action: string) {
  return actionLabels[action] ?? "Sistem əməliyyatı icra edildi";
}

export function getAuditEntityLabel(entityType: string) {
  return entityLabels[entityType] ?? "Sistem obyekti";
}

export function localizeAuditReason(reason: string | null) {
  if (!reason) return "Qeyd edilməyib";
  return reasonTerms.reduce(
    (result, [pattern, replacement]) => result.replace(pattern, (match) => preserveCapitalization(match, replacement)),
    reason,
  );
}

export function formatAuditSnapshot(value: unknown) {
  if (value == null) return "Məlumat yoxdur";
  return JSON.stringify(localizeSnapshotValue(value), null, 2);
}

function localizeSnapshotValue(value: unknown, key?: string): unknown {
  if (value == null) return "Məlumat yoxdur";
  if (typeof value === "boolean") return value ? "Bəli" : "Xeyr";
  if (typeof value === "string") return localizeSnapshotString(value, key);
  if (Array.isArray(value)) return value.map((item) => localizeSnapshotValue(item, key));
  if (typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([entryKey, entryValue], index) => [
      fieldLabels[entryKey] ?? localizeField(entryKey, index),
      localizeSnapshotValue(entryValue, entryKey),
    ]),
  );
}

function localizeSnapshotString(value: string, key?: string) {
  if (valueLabels[value]) return valueLabels[value];
  if (key === "code" && /[._-]/.test(value)) return localizeIdentifier(value);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return new Intl.DateTimeFormat("az-AZ", {
        dateStyle: "medium",
        timeStyle: "medium",
        timeZone: "Asia/Baku",
      }).format(date);
    }
  }
  return value;
}

function localizeIdentifier(value: string) {
  const words = value
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .split(/[._\s-]+/)
    .filter(Boolean)
    .map((word) => identifierTokens[word.toLocaleLowerCase("az")] ?? word.toLocaleLowerCase("az"));
  const result = words.join(" ") || value;
  return result.replace(/^./u, (letter) => letter.toLocaleUpperCase("az"));
}

function localizeField(value: string, index: number) {
  const words = value
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .split(/[._\s-]+/)
    .filter(Boolean);
  if (words.every((word) => identifierTokens[word.toLocaleLowerCase("az")])) {
    return localizeIdentifier(value);
  }
  return `Əlavə məlumat ${index + 1}`;
}

function preserveCapitalization(source: string, replacement: string) {
  if (source[0] === source[0]?.toLocaleUpperCase("az")) {
    return replacement.replace(/^./u, (letter) => letter.toLocaleUpperCase("az"));
  }
  return replacement;
}
