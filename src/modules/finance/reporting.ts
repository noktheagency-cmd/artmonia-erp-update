export const EVENT_REPORTING_CATEGORY = "Tədbirlər";

export function getExpenseReportingCategory(
  workshopEventId: string | null | undefined,
  category: string,
) {
  return workshopEventId ? EVENT_REPORTING_CATEGORY : category;
}

export function getIncomeReportingCategory(sourceKind: "STUDENT" | "WORKSHOP") {
  return sourceKind === "WORKSHOP" ? "Tədbir gəliri" : "Təhsil haqqı";
}

export function getIncomeDescription(
  sourceKind: "STUDENT" | "WORKSHOP",
  personName: string,
  sourceLabel: string,
) {
  return sourceKind === "WORKSHOP"
    ? `${personName} — ${sourceLabel}`
    : `${personName} — kurs haqqı`;
}
