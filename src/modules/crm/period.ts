import { addMonths, startOfMonth } from "@/modules/shared/format";

export const crmPeriodOptions = [
  { value: "this_month", label: "Bu ay" },
  { value: "last_month", label: "Keçən ay" },
  { value: "last_90", label: "Son 90 gün" },
  { value: "all", label: "Bütün dövr" },
] as const;

export type CrmPeriodValue = (typeof crmPeriodOptions)[number]["value"];

export const crmPeriodLabels: Record<CrmPeriodValue, string> = {
  this_month: "Bu ay",
  last_month: "Keçən ay",
  last_90: "Son 90 gün",
  all: "Bütün dövr",
};

export function normalizeCrmPeriod(value: string | undefined): CrmPeriodValue {
  return crmPeriodOptions.find((period) => period.value === value)?.value ?? "this_month";
}

export function getCrmPeriodRange(period: CrmPeriodValue, reference = new Date()) {
  const monthStart = startOfMonth(reference);

  if (period === "this_month") {
    return {
      gte: monthStart,
      lt: addMonths(monthStart, 1),
    };
  }

  if (period === "last_month") {
    return {
      gte: addMonths(monthStart, -1),
      lt: monthStart,
    };
  }

  if (period === "last_90") {
    const start = new Date(reference);
    start.setUTCDate(start.getUTCDate() - 90);
    start.setUTCHours(0, 0, 0, 0);

    return { gte: start };
  }

  return null;
}
