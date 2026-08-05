export const dropdownCatalogKeys = [
  "CRM_SOURCE",
  "STUDENT_EDUCATION_LEVEL",
  "STUDENT_DISCOUNT_TYPE",
  "HR_DEPARTMENT",
  "HR_POSITION",
  "WORKSHOP_EVENT_TYPE",
  "MARKETING_CHANNEL",
  "MARKETING_CONTENT_PLATFORM",
  "MARKETING_CONTENT_FORMAT",
  "MARKETING_EXPENSE_CATEGORY",
] as const;

export type DropdownCatalogKey = (typeof dropdownCatalogKeys)[number];

export type DropdownCatalogRecord = {
  id: string;
  value: string;
  label: string;
  isActive: boolean;
  isCustom: boolean;
};

export type DropdownCatalogSnapshot = {
  canManage: boolean;
  records: DropdownCatalogRecord[];
};
