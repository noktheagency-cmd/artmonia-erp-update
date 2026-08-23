const actionLabels: Record<string, string> = {
  "about_profile.create": "“Biz kimik” məlumatı yaradıldı",
  "about_profile.update": "“Biz kimik” məlumatı yeniləndi",
  "attendance.batch.update": "Davamiyyət qeydləri yeniləndi",
  "auth.user.create": "İstifadəçi hesabı yaradıldı",
  "auth.account.create": "ERP giriş hesabı yaradıldı",
  "auth.account.update": "Giriş məlumatları yeniləndi",
  "auth.account.enable": "Giriş hesabı aktiv edildi",
  "auth.account.disable": "Giriş hesabı deaktiv edildi",
  "auth.password.reset": "Əməkdaş parolu yeniləndi",
  "class_slot.create": "Dərs vaxtı yaradıldı",
  "class_slot.delete": "Dərs vaxtı silindi",
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
  "hr.corporate.create": "Korporativ müştəri yaradıldı",
  "hr.corporate.update": "Korporativ müştəri yeniləndi",
  "hr.corporate.delete": "Korporativ müştəri silindi",
  "hr.employee.delete": "Əməkdaş profili silindi",
  "hr.employee.update": "Əməkdaş profili yeniləndi",
  "hr.note.create": "Əməkdaş qeydi yaradıldı",
  "hr.note.update": "Əməkdaş qeydi yeniləndi",
  "hr.document.upload": "Əməkdaş sənədi əlavə edildi",
  "hr.document.download": "Əməkdaş sənədinə baxıldı",
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
  SESSION_REVOKED: "Sessiya bağlandı",
  SESSION_SIGNED_IN: "Yeni giriş sessiyası yaradıldı",
  SESSION_SIGNED_OUT: "Giriş sessiyası bitirildi",
  "payment.void": "Ödəniş ləğv edildi",
  "role.create": "Rol yaradıldı",
  "role.delete": "Rol silindi",
  "role.permissions.update": "Rol icazələri yeniləndi",
  "student.create": "Tələbə yaradıldı",
  "student.delete": "Tələbə silindi",
  "student.mobile_account.disable": "Tələbənin mobil hesabı deaktiv edildi",
  "student.mobile_account.enable": "Tələbənin mobil hesabı aktiv edildi",
  "student.mobile_account.invite": "Tələbəyə mobil giriş dəvəti göndərildi",
  "student.mobile_account.resend": "Tələbəyə yeni mobil giriş linki göndərildi",
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
  about_profile: "“Biz kimik” məlumatı",
  auth_session: "Giriş sessiyası",
  auth_account: "ERP giriş hesabı",
  class_slot: "Dərs vaxtı",
  dropdown_catalog_option: "Siyahı seçimi",
  finance_expense: "Xərc qeydi",
  finance_expense_category: "Xərc kateqoriyası",
  hr_bonus_award: "Bonus payı",
  hr_bonus_campaign: "Bonus kampaniyası",
  hr_bonus_stage: "Bonus mərhələsi",
  hr_corporate_customer: "Korporativ müştəri",
  hr_employee: "Əməkdaş",
  hr_employee_note: "Əməkdaş qeydi",
  hr_employee_document: "Əməkdaş sənədi",
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
  active: "Aktivlik",
  allocations: "Bölüşdürülən ödənişlər",
  amount: "Məbləğ",
  amountPaid: "Ödənilən məbləğ",
  approvedCount: "Təsdiqlənənlərin sayı",
  assignedToId: "Təyin edilən əməkdaşın identifikatoru",
  authUserId: "Giriş hesabının identifikatoru",
  campaignId: "Kampaniyanın identifikatoru",
  cancelReason: "Ləğv səbəbi",
  cancelledAt: "Ləğv vaxtı",
  capacity: "Tutum",
  catalog: "Siyahı",
  category: "Kateqoriya",
  code: "Kod",
  copiedFrom: "Köçürüldüyü rol",
  createdAt: "Yaradılma vaxtı",
  currency: "Valyuta",
  decision: "Qərar",
  department: "Şöbə",
  description: "Təsvir",
  device: "Cihaz",
  deviceName: "Cihazın adı",
  discountAmount: "Endirim məbləği",
  email: "E-poçt",
  employeeId: "Əməkdaşın identifikatoru",
  endedAt: "Bitmə vaxtı",
  entryPrice: "Giriş qiyməti",
  eventDate: "Tədbirin tarixi",
  eventType: "Tədbirin növü",
  expenseDate: "Xərc tarixi",
  firstLessonAt: "İlk dərs tarixi",
  firstLessonMode: "İlk dərs tarixi rejimi",
  fullName: "Ad və soyad",
  hrEmployeeCreated: "Əməkdaş profili yaradılıb",
  id: "İdentifikator",
  intent: "Məqsəd",
  isActive: "Aktivdir",
  isGift: "Hədiyyədir",
  key: "Açar",
  label: "Görünən ad",
  leadId: "Müraciətin identifikatoru",
  loginCreated: "Giriş hesabı yaradılıb",
  loginEmail: "Login e-poçtu",
  listPrice: "Siyahı qiyməti",
  method: "Ödəniş üsulu",
  name: "Ad",
  note: "Qeyd",
  notes: "Qeydlər",
  outcome: "Nəticə",
  paidAt: "Ödəniş vaxtı",
  payerName: "Ödəyən şəxs",
  paymentMethod: "Ödəniş üsulu",
  permissionId: "İcazənin identifikatoru",
  position: "Vəzifə",
  postedCount: "Göndərilənlərin sayı",
  posterUrl: "Tədbir posteri",
  preservedRoles: "Saxlanılan rollar",
  profilePhotoUrl: "Profil şəklinin keçidi",
  reason: "Səbəb",
  receiptReference: "Qəbz qeydi",
  scheduleType: "Ödəniş növü",
  reportId: "Hesabatın identifikatoru",
  roleId: "Rolun identifikatoru",
  roleIds: "Rol identifikatorları",
  roles: "Rollar",
  passwordChanged: "Parol dəyişdirilib",
  characterCount: "Simvol sayı",
  fileName: "Fayl adı",
  mimeType: "Fayl formatı",
  sizeBytes: "Fayl ölçüsü",
  salaryAmount: "Maaş məbləği",
  salaryMode: "Maaş növü",
  salaryPercent: "Maaş faizi",
  scope: "Əhatə dairəsi",
  source: "Mənbə",
  stageId: "Mərhələnin identifikatoru",
  stage: "Mərhələ",
  staffType: "Əməkdaş növü",
  startTime: "Başlama vaxtı",
  status: "Status",
  studentId: "Tələbənin identifikatoru",
  teacherId: "Müəllimin identifikatoru",
  teacherIndicatorRemoved: "Müəllim statusu silinib",
  title: "Başlıq",
  tagline: "Qısa təqdimat",
  story: "Haqqımızda mətni",
  mission: "Missiya",
  vision: "Vizyon",
  values: "Dəyərlər",
  trialLessonCount: "Sınaq dərsi sayı",
  unallocatedAmount: "Bölüşdürülməmiş məbləğ",
  updatedAt: "Yenilənmə vaxtı",
  userId: "İstifadəçinin identifikatoru",
  value: "Dəyər",
  vendor: "Təchizatçı",
  voidedAt: "Ləğv vaxtı",
};

const valueLabels: Record<string, string> = {
  ABSENT: "İştirak etməyib",
  ACTIVE: "Aktiv",
  ALL: "Hamısı",
  APPROVED: "Təsdiqlənib",
  ASSIGNED: "Təyin edilənlər",
  AUTO: "Avtomatik",
  CANCELLED: "Ləğv edilib",
  CARD: "Kart",
  CASH: "Nağd",
  COMPLETED: "Tamamlanıb",
  CONTACTED: "Xatırlatma",
  CRITICAL: "Təcili",
  DRAFT: "Qaralama",
  FINANCE: "Maliyyə",
  INACTIVE: "Passiv",
  LOST: "İtirilib",
  MASTERCLASS: "Ustad dərsi",
  MEDIUM: "Orta",
  MANUAL: "Manual",
  MONTHLY: "Aylıq ödəniş",
  NEW: "Zəng gözləyir",
  NORMAL: "Normal",
  NURTURE: "İzləmədə",
  ONE_TIME: "Birdəfəlik tam ödəniş",
  OWNER: "Sahib",
  PENDING: "Gözləmədə",
  PENDING_HR: "İnsan resurslarının təsdiqini gözləyir",
  PERCENT: "Faizlə",
  PRESENT: "İştirak edib",
  QUALIFIED: "Konsultasiya təyin olundu",
  REJECTED: "Rədd edilib",
  REGISTERED: "Qeydiyyata alınıb",
  SALES: "Satış",
  SUBMITTED: "Təsdiqə göndərilib",
  SUPER_ADMIN: "Baş inzibatçı",
  STATIC: "Sabit məbləğ",
  TEACHER: "Müəllim",
  TRIAL_LESSON: "Sınaq dərsi",
  TRIAL_LESSON_REMINDER: "Sınaq dərsini xatırlat",
  TRIAL_CONSULTATION: "Ödəniş gözlənilir",
  VOIDED: "Ləğv edilib",
  WORKSHOP: "Tədbir",
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

export type AuditDisplayChange = {
  id: string;
  label: string;
  previous: string | null;
  current: string | null;
  type: "added" | "removed" | "changed";
};

/**
 * Audit qeydlərini xam JSON göstərmədən, istifadəçi üçün mənalı dəyişikliklərə çevirir.
 * Texniki identifikatorlar və həssas sahələr bu təqdimat qatında məqsədli şəkildə gizlədilir.
 */
export function getAuditDisplayChanges(before: unknown, after: unknown): AuditDisplayChange[] {
  const previousFields = collectAuditFields(before);
  const currentFields = collectAuditFields(after);
  const isCreated = before == null && after != null;
  const isRemoved = before != null && after == null;
  // Yeniləmə qeydlərində `after` çox vaxt yalnız dəyişdirilən sahələri saxlayır.
  // Buna görə `after`-da olmayan əvvəlki sahələri silinmiş kimi təqdim etmirik.
  const fieldIds = isRemoved ? [...previousFields.keys()] : [...currentFields.keys()];

  return fieldIds.flatMap((id) => {
    const previous = previousFields.get(id);
    const current = currentFields.get(id);

    if (isCreated && (!current || !hasMeaningfulValue(current.value))) return [];
    if (isRemoved && (!previous || !hasMeaningfulValue(previous.value))) return [];
    if (!isCreated && !isRemoved && auditValuesEqual(previous?.value, current?.value)) return [];

    const type = !previous ? "added" : !current ? "removed" : "changed";
    return [{
      id,
      label: current?.label ?? previous?.label ?? "Məlumat",
      previous: previous ? formatDisplayValue(previous.value, previous.key) : null,
      current: current ? formatDisplayValue(current.value, current.key) : null,
      type,
    } satisfies AuditDisplayChange];
  });
}

type CollectedAuditField = { key: string; label: string; value: unknown };

function collectAuditFields(value: unknown) {
  const fields = new Map<string, CollectedAuditField>();
  collectAuditObject(value, fields, [], 0);
  return fields;
}

function collectAuditObject(
  value: unknown,
  fields: Map<string, CollectedAuditField>,
  path: string[],
  depth: number,
) {
  if (!isPlainRecord(value)) return;

  Object.entries(value).forEach(([key, entryValue], index) => {
    const nextPath = [...path, key];
    if (isHiddenAuditField(key) || containsOnlyTechnicalIdentifiers(entryValue)) return;

    if (isPlainRecord(entryValue) && depth < 2) {
      collectAuditObject(entryValue, fields, nextPath, depth + 1);
      return;
    }

    fields.set(nextPath.join("."), {
      key,
      label: fieldLabels[key] ?? localizeField(key, index),
      value: entryValue,
    });
  });
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isHiddenAuditField(key: string) {
  const tokens = key.replace(/([a-z\d])([A-Z])/g, "$1 $2").split(/[._\s-]+/).map((token) => token.toLowerCase());
  const lastToken = tokens.at(-1);
  if (lastToken === "id" || lastToken === "ids") return true;
  return tokens.some((token) => ["password", "secret", "token", "credential"].includes(token))
    || ["createdAt", "updatedAt", "ipAddress", "key"].includes(key);
}

function containsOnlyTechnicalIdentifiers(value: unknown) {
  if (typeof value === "string") return isUuid(value);
  return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "string" && isUuid(item));
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

function hasMeaningfulValue(value: unknown) {
  if (value == null || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  if (isPlainRecord(value)) return Object.keys(value).length > 0;
  return true;
}

function auditValuesEqual(previous: unknown, current: unknown) {
  return JSON.stringify(previous) === JSON.stringify(current);
}

function formatDisplayValue(value: unknown, key: string): string {
  if (value == null || value === "") return "Yoxdur";
  if (typeof value === "boolean") return value ? "Bəli" : "Xeyr";
  if (typeof value === "number") return new Intl.NumberFormat("az-AZ", { maximumFractionDigits: 2 }).format(value);
  if (Array.isArray(value)) return formatDisplayArray(value, key);
  if (isPlainRecord(value)) return `${Object.keys(value).length} məlumat`;

  const stringValue = String(localizeSnapshotString(String(value), key));
  if (/url$/iu.test(key)) return "Əlavə edilib";
  return stringValue.length > 180 ? `${stringValue.slice(0, 177)}…` : stringValue;
}

function formatDisplayArray(value: unknown[], key: string): string {
  if (!value.length) return "Yoxdur";
  const readableItems: string[] = value.flatMap((item): string[] => {
    if (["string", "number", "boolean"].includes(typeof item)) {
      return [formatDisplayValue(item, key)];
    }
    if (isPlainRecord(item)) {
      const name = item.name ?? item.label ?? item.fullName ?? item.title;
      return name == null ? [] : [String(name)];
    }
    return [];
  });
  if (!readableItems.length) return `${value.length} qeyd`;
  const visibleItems = readableItems.slice(0, 5).join(", ");
  return readableItems.length > 5 ? `${visibleItems} və daha ${readableItems.length - 5}` : visibleItems;
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
