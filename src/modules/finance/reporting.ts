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

export function calculateFinanceStatement(input: {
  operatingIncome: number;
  directCost: number;
  opex: number;
  capex: number;
  financingIn: number;
  financingOut: number;
  legacyLiability: number;
}) {
  const grossProfit = input.operatingIncome - input.directCost;
  const operatingProfit = grossProfit - input.opex;
  const netCash =
    input.operatingIncome +
    input.financingIn -
    input.directCost -
    input.opex -
    input.capex -
    input.financingOut -
    input.legacyLiability;

  return { grossProfit, operatingProfit, netCash };
}

export function isCashInflow(transactionType: string) {
  return transactionType === "INCOME" || transactionType === "FINANCING_IN";
}
