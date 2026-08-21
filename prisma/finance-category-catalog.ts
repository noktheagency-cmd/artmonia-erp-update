import {
  FinanceFinancialClass,
  FinanceTransactionType,
} from "../src/generated/prisma/client";

type FinanceCategoryCatalogItem = {
  code: string;
  name: string;
  description: string;
  transactionType: FinanceTransactionType;
  financialClass: FinanceFinancialClass | null;
  requiresStaff?: boolean;
  requiresProject?: boolean;
};

export const financeCategoryCatalog: FinanceCategoryCatalogItem[] = [
  { code: "REV_TUITION", name: "Tədris satışları", description: "Tələbə tədris ödənişləri", transactionType: FinanceTransactionType.INCOME, financialClass: null },
  { code: "REV_WORKSHOP", name: "Workshop gəliri", description: "Workshop və masterclass iştirakçı ödənişləri", transactionType: FinanceTransactionType.INCOME, financialClass: null, requiresProject: true },
  { code: "DC_TEACHER_COMP", name: "Əməkhaqqı — Müəllimlər", description: "Müəllim maaşı və faiz ödənişləri", transactionType: FinanceTransactionType.EXPENSE, financialClass: FinanceFinancialClass.DIRECT_COST, requiresStaff: true },
  { code: "DC_TEACHING_MATERIALS", name: "Tədris materialları", description: "Dərsə birbaşa sərf olunan materiallar", transactionType: FinanceTransactionType.EXPENSE, financialClass: FinanceFinancialClass.DIRECT_COST },
  { code: "OP_PAYROLL_SALES_ADMIN", name: "Əməkhaqqı — Satış və administrasiya", description: "Satış, administrasiya və digər inzibati əməkdaşlar", transactionType: FinanceTransactionType.EXPENSE, financialClass: FinanceFinancialClass.OPEX, requiresStaff: true },
  { code: "OP_MANAGEMENT_COMP", name: "Rəhbərlik kompensasiyası", description: "Şirkətin idarə edilməsinə görə rəhbərlik ödənişi", transactionType: FinanceTransactionType.EXPENSE, financialClass: FinanceFinancialClass.OPEX, requiresStaff: true },
  { code: "OP_BONUS_COMMISSION", name: "Bonus və komissiyalar", description: "Satış, performans bonusu və komissiyalar", transactionType: FinanceTransactionType.EXPENSE, financialClass: FinanceFinancialClass.OPEX, requiresStaff: true },
  { code: "OP_TAX_GOV", name: "Vergi və dövlət ödənişləri", description: "Vergi, DSMF, dövlət rüsumları və məcburi ödənişlər", transactionType: FinanceTransactionType.EXPENSE, financialClass: FinanceFinancialClass.OPEX },
  { code: "OP_RENT", name: "İcarə", description: "Məkan və filial icarəsi", transactionType: FinanceTransactionType.EXPENSE, financialClass: FinanceFinancialClass.OPEX },
  { code: "OP_UTILITIES_COMMS", name: "Kommunal və rabitə", description: "Elektrik, internet, telefon və kommunal xidmətlər", transactionType: FinanceTransactionType.EXPENSE, financialClass: FinanceFinancialClass.OPEX },
  { code: "OP_OFFICE_DAILY", name: "Ofis və gündəlik əməliyyat", description: "Kiçik gündəlik ofis xərcləri", transactionType: FinanceTransactionType.EXPENSE, financialClass: FinanceFinancialClass.OPEX },
  { code: "OP_CUSTOMER_EXPERIENCE", name: "Müştəri təcrübəsi", description: "Qonaq və welcome materialları", transactionType: FinanceTransactionType.EXPENSE, financialClass: FinanceFinancialClass.OPEX },
  { code: "OP_SMALL_EQUIPMENT", name: "İnventar və kiçik avadanlıq", description: "Gündəlik istifadə olunan kiçik avadanlıq", transactionType: FinanceTransactionType.EXPENSE, financialClass: FinanceFinancialClass.OPEX },
  { code: "OP_REPAIR_MAINT", name: "Təmir və texniki xidmət", description: "Məkan və inventar təmiri, servis", transactionType: FinanceTransactionType.EXPENSE, financialClass: FinanceFinancialClass.OPEX },
  { code: "OP_MARKETING_ADS", name: "Marketinq — Reklam", description: "Meta Ads, TikTok Ads və media büdcəsi", transactionType: FinanceTransactionType.EXPENSE, financialClass: FinanceFinancialClass.OPEX },
  { code: "OP_MARKETING_CONTENT", name: "Marketinq — Agentlik və kontent", description: "Agentlik, foto, video, model və kontent istehsalı", transactionType: FinanceTransactionType.EXPENSE, financialClass: FinanceFinancialClass.OPEX },
  { code: "OP_SOFTWARE_SUBS", name: "Proqramlar və aboneliklər", description: "Software və subscription ödənişləri", transactionType: FinanceTransactionType.EXPENSE, financialClass: FinanceFinancialClass.OPEX },
  { code: "OP_IT_SYSTEMS", name: "İT və sistem xidmətləri", description: "ERP, sayt, developer və sistem inkişafı", transactionType: FinanceTransactionType.EXPENSE, financialClass: FinanceFinancialClass.OPEX },
  { code: "OP_BANK_FEES", name: "Bank və kassa xidmətləri", description: "Bank, POS, kassa və payment komissiyaları", transactionType: FinanceTransactionType.EXPENSE, financialClass: FinanceFinancialClass.OPEX },
  { code: "OP_EVENTS_PROJECTS", name: "Tədbir və layihə xərcləri", description: "Workshop, sərgi və xüsusi layihələr", transactionType: FinanceTransactionType.EXPENSE, financialClass: FinanceFinancialClass.OPEX, requiresProject: true },
  { code: "OP_PRO_SERVICES", name: "Peşəkar xidmətlər", description: "Mühasib, hüquqşünas və konsultant xidmətləri", transactionType: FinanceTransactionType.EXPENSE, financialClass: FinanceFinancialClass.OPEX },
  { code: "OP_LOGISTICS", name: "Logistika və çatdırılma", description: "Kuryer, daşınma və çatdırılma", transactionType: FinanceTransactionType.EXPENSE, financialClass: FinanceFinancialClass.OPEX },
  { code: "OP_TEAM_DEVELOPMENT", name: "Komanda inkişafı və daxili tədbirlər", description: "Komanda görüşü, təlim və daxili inkişaf", transactionType: FinanceTransactionType.EXPENSE, financialClass: FinanceFinancialClass.OPEX },
  { code: "CAP_EQUIPMENT", name: "Kapital avadanlıq", description: "Uzunmüddətli böyük texnika və avadanlıq", transactionType: FinanceTransactionType.CAPEX_OUT, financialClass: FinanceFinancialClass.CAPEX },
  { code: "CAP_FITOUT", name: "Məkan və filial kapital investisiyası", description: "Böyük təmir, fit-out və filial qurulması", transactionType: FinanceTransactionType.CAPEX_OUT, financialClass: FinanceFinancialClass.CAPEX },
  { code: "FIN_INVESTOR_REPAY", name: "İnvestor ödənişi / kapitalın qaytarılması", description: "İnvestora əsas kapitalın qaytarılması", transactionType: FinanceTransactionType.FINANCING_OUT, financialClass: FinanceFinancialClass.FINANCING },
  { code: "FIN_OWNER_LOAN_OUT", name: "Sahibkara verilmiş borc", description: "Sahibkar tərəfindən geri qaytarılacaq məbləğ", transactionType: FinanceTransactionType.FINANCING_OUT, financialClass: FinanceFinancialClass.FINANCING },
  { code: "FIN_OWNER_DRAW", name: "Sahibkar çıxarışı", description: "Sahibkarın şəxsi istifadə üçün götürdüyü məbləğ", transactionType: FinanceTransactionType.FINANCING_OUT, financialClass: FinanceFinancialClass.FINANCING },
  { code: "FIN_OWNER_CONTRIB", name: "Sahibkar kapital qoyuluşu", description: "Sahibkarın şirkətə daxil etdiyi vəsait", transactionType: FinanceTransactionType.FINANCING_IN, financialClass: FinanceFinancialClass.FINANCING },
  { code: "FIN_LOAN_RECEIVED", name: "Kredit / borc daxilolması", description: "Şirkətin aldığı kredit və ya borc", transactionType: FinanceTransactionType.FINANCING_IN, financialClass: FinanceFinancialClass.FINANCING },
  { code: "FIN_LOAN_PRINCIPAL", name: "Kredit əsas məbləğinin qaytarılması", description: "Kreditin əsas məbləğinin qaytarılması", transactionType: FinanceTransactionType.FINANCING_OUT, financialClass: FinanceFinancialClass.FINANCING },
  { code: "LEGACY_INV_LIABILITY", name: "Keçmiş inventar öhdəliyinin ödənişi", description: "Artmonianın quruluşundan qalan inventar borcları", transactionType: FinanceTransactionType.FINANCING_OUT, financialClass: FinanceFinancialClass.LEGACY_LIABILITY },
];
