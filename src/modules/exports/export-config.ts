import { z } from "zod";

export const exportModules = ["crm", "students", "finance"] as const;
export type ExportModule = (typeof exportModules)[number];

export const exportFormats = ["xlsx", "csv", "pdf"] as const;
export type ExportFormat = (typeof exportFormats)[number];

export type ExportField = {
  key: string;
  label: string;
  defaultSelected?: boolean;
  detail?: boolean;
};

export type ExportDataset = {
  key: string;
  label: string;
  fields: ExportField[];
};

const commonLeadFields: ExportField[] = [
  { key: "name", label: "Müraciət edən", defaultSelected: true },
  { key: "phone", label: "Telefon", defaultSelected: true },
  { key: "program", label: "Proqram", defaultSelected: true },
  { key: "source", label: "Mənbə", defaultSelected: true },
  { key: "stage", label: "Mərhələ", defaultSelected: true },
  { key: "trialLessonCount", label: "Sınaq dərsi sayı", defaultSelected: true },
  { key: "priority", label: "Prioritet", defaultSelected: true },
  { key: "nextAction", label: "Növbəti addım", defaultSelected: true },
  { key: "nextFollowUp", label: "Növbəti əlaqə tarixi", defaultSelected: true },
  { key: "manager", label: "Məsul şəxs", defaultSelected: true },
  { key: "createdAt", label: "Yaradılma tarixi", defaultSelected: true },
  { key: "note", label: "Son qeyd", detail: true },
  { key: "convertedStudent", label: "Tələbə kodu", detail: true },
  { key: "history", label: "Mərhələ tarixçəsi", detail: true },
];

export const exportDatasetRegistry: Record<ExportModule, ExportDataset[]> = {
  crm: [{ key: "leads", label: "Follow-up müraciətləri", fields: commonLeadFields }],
  students: [
    {
      key: "students",
      label: "Tələbə siyahısı",
      fields: [
        { key: "code", label: "Tələbə kodu", defaultSelected: true },
        { key: "name", label: "Ad soyad", defaultSelected: true },
        { key: "phone", label: "Telefon", defaultSelected: true },
        { key: "program", label: "Proqram", defaultSelected: true },
        { key: "teacher", label: "Müəllim", defaultSelected: true },
        { key: "lifecycle", label: "Tələbə statusu", defaultSelected: true },
        { key: "paymentStatus", label: "Ödəniş statusu", defaultSelected: true },
        { key: "balance", label: "Cari borc", defaultSelected: true },
        { key: "dueDate", label: "Son ödəniş tarixi", defaultSelected: true },
        { key: "manager", label: "Menecer", detail: true },
        { key: "registeredAt", label: "Qeydiyyat tarixi", detail: true },
        { key: "billing", label: "Billing vəziyyəti", detail: true },
        { key: "notes", label: "Qeyd", detail: true },
        { key: "invoices", label: "Fakturalar", detail: true },
        { key: "payments", label: "Ödəniş tarixçəsi", detail: true },
        { key: "timeline", label: "Status tarixçəsi", detail: true },
      ],
    },
  ],
  finance: [
    {
      key: "payments",
      label: "Ödənişlər",
      fields: [
        { key: "student", label: "Tələbə", defaultSelected: true },
        { key: "studentCode", label: "Tələbə kodu", defaultSelected: true },
        { key: "amount", label: "Məbləğ", defaultSelected: true },
        { key: "paidAt", label: "Ödəniş tarixi", defaultSelected: true },
        { key: "paymentMonth", label: "Ödəniş ayı", defaultSelected: true },
        { key: "method", label: "Ödəniş üsulu", defaultSelected: true },
        { key: "payer", label: "Ödəyən şəxs", detail: true },
        { key: "receipt", label: "Qəbz referansı", detail: true },
        { key: "note", label: "Qeyd", detail: true },
      ],
    },
    {
      key: "expenses",
      label: "Xərclər",
      fields: [
        { key: "category", label: "Kateqoriya", defaultSelected: true },
        { key: "amount", label: "Məbləğ", defaultSelected: true },
        { key: "expenseDate", label: "Xərc tarixi", defaultSelected: true },
        { key: "method", label: "Ödəniş üsulu", defaultSelected: true },
        { key: "vendor", label: "Təchizatçı", defaultSelected: true },
        { key: "staff", label: "Əməkdaş", defaultSelected: true },
        { key: "salaryFormula", label: "Əməkhaqqı formulu", detail: true },
        { key: "receipt", label: "Qəbz referansı", detail: true },
        { key: "description", label: "Açıqlama", detail: true },
      ],
    },
    {
      key: "debts",
      label: "Alacaqlar",
      fields: [
        { key: "student", label: "Tələbə", defaultSelected: true },
        { key: "studentCode", label: "Tələbə kodu", defaultSelected: true },
        { key: "phone", label: "Telefon", defaultSelected: true },
        { key: "program", label: "Proqram", defaultSelected: true },
        { key: "teacher", label: "Müəllim", defaultSelected: true },
        { key: "balance", label: "Borc", defaultSelected: true },
        { key: "dueDate", label: "Növbəti ödəniş", defaultSelected: true },
        { key: "overdueDays", label: "Gecikmə günü", defaultSelected: true },
      ],
    },
    {
      key: "payroll",
      label: "Əməkhaqqı",
      fields: [
        { key: "staff", label: "Əməkdaş", defaultSelected: true },
        { key: "category", label: "Kateqoriya", defaultSelected: true },
        { key: "amount", label: "Məbləğ", defaultSelected: true },
        { key: "expenseDate", label: "Tarix", defaultSelected: true },
        { key: "method", label: "Ödəniş üsulu", defaultSelected: true },
        { key: "salaryFormula", label: "Hesablanma formulu", defaultSelected: true },
        { key: "receipt", label: "Qəbz referansı", detail: true },
        { key: "description", label: "Açıqlama", detail: true },
      ],
    },
  ],
};

export function getExportDataset(module: ExportModule, key: string) {
  return exportDatasetRegistry[module].find((dataset) => dataset.key === key) ?? null;
}

export function getDefaultExportFields(module: ExportModule, dataset: string) {
  return getExportDataset(module, dataset)?.fields
    .filter((field) => field.defaultSelected)
    .map((field) => field.key) ?? [];
}

export const exportRequestSchema = z.object({
  module: z.enum(exportModules),
  dataset: z.string().min(1),
  format: z.enum(exportFormats),
  scope: z.enum(["filtered", "all"]),
  fields: z.array(z.string()).min(1),
  filters: z.record(z.string(), z.string()).default({}),
  includeSummary: z.boolean().default(true),
});

export type ExportRequest = z.infer<typeof exportRequestSchema>;
