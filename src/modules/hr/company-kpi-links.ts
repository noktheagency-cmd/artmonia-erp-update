import type { Route } from "next";
import type { CompanyKpiKey } from "@/modules/hr/company-kpi-calculations";

export function kpiMetricHref(key: CompanyKpiKey, periodMonth: string): Route {
  const { from, to } = monthDateRange(periodMonth);
  switch (key) {
    case "activeStudents":
      return `/students?tab=list&status=ACTIVE` as Route;
    case "newSales":
      return `/students?tab=list&from=${from}&to=${to}` as Route;
    case "churn":
      return `/students?tab=list&churn=1` as Route;
    case "leads":
    case "conversion":
      return `/crm?from=${from}&to=${to}` as Route;
    case "revenue":
      return `/finance?type=payments&from=${from}&to=${to}` as Route;
    default:
      return "/hr?view=company-kpi" as Route;
  }
}

export function monthDateRange(periodMonth: string) {
  const [year, month] = periodMonth.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    from: `${periodMonth}-01`,
    to: `${periodMonth}-${String(lastDay).padStart(2, "0")}`,
  };
}
