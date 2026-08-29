export type CompanyKpiKey =
  | "activeStudents"
  | "newSales"
  | "churn"
  | "leads"
  | "conversion"
  | "revenue";

export type CompanyKpiValueKind = "count" | "percent" | "money";
export type CompanyKpiTone = "success" | "warning" | "danger" | "neutral";

export type CompanyKpiTargets = {
  activeStudents: number;
  newSales: number;
  churn: number;
  leads: number;
  conversion: number;
  revenue: number;
};

export type CompanyKpiActuals = CompanyKpiTargets & {
  openingActiveStudents: number;
  convertedLeads: number;
};

export type CompanyKpiPeriod = {
  elapsedDays: number;
  totalDays: number;
  remainingDays: number;
  hasStarted: boolean;
  isComplete: boolean;
};

export type CompanyKpiMetric = {
  key: CompanyKpiKey;
  label: string;
  kind: CompanyKpiValueKind;
  target: number;
  actual: number;
  difference: number;
  completion: number;
  projected: number;
  requiredDaily: number;
  requiredDailyKind: CompanyKpiValueKind;
  paceLabel: string;
  status: CompanyKpiTone;
  statusLabel: string;
  progressLabel: string;
  hasTarget: boolean;
};

type MetricDefinition = {
  key: CompanyKpiKey;
  label: string;
  kind: CompanyKpiValueKind;
  paceLabel: string;
};

const metricDefinitions: MetricDefinition[] = [
  { key: "activeStudents", label: "Aktiv tələbə", kind: "count", paceLabel: "Gündəlik xalis artım" },
  { key: "newSales", label: "Yeni satış", kind: "count", paceLabel: "Gündəlik satış" },
  { key: "churn", label: "Churn maksimumu", kind: "count", paceLabel: "Gündəlik qalan limit" },
  { key: "leads", label: "Lead", kind: "count", paceLabel: "Gündəlik lead" },
  { key: "conversion", label: "Conversion", kind: "percent", paceLabel: "Gündəlik əlavə satış" },
  { key: "revenue", label: "Revenue", kind: "money", paceLabel: "Gündəlik revenue" },
];

export function buildCompanyKpiMetrics(
  targets: CompanyKpiTargets | null,
  actuals: CompanyKpiActuals,
  period: CompanyKpiPeriod,
): CompanyKpiMetric[] {
  return metricDefinitions.map((definition) => {
    const hasTarget = targets !== null;
    const target = targets?.[definition.key] ?? 0;
    const actual = actuals[definition.key];
    const isChurn = definition.key === "churn";
    const completion = hasTarget ? completionFor(actual, target, isChurn) : 0;
    const projected = projectionFor(definition.key, actuals, period);
    const status = statusFor(definition.key, target, actual, projected, period, Boolean(targets));
    const pace = requiredPaceFor(definition.key, target, actuals, period);

    return {
      ...definition,
      target,
      actual,
      difference: isChurn ? target - actual : actual - target,
      completion,
      projected,
      requiredDaily: pace.value,
      requiredDailyKind: pace.kind,
      status,
      statusLabel: !hasTarget
        ? "Target daxil edilməyib"
        : !period.hasStarted
          ? "Ay başlamayıb"
          : statusLabelFor(status),
      progressLabel: !hasTarget
        ? "Target gözlənilir"
        : isChurn
          ? `${round(completion)}% limit istifadə olunub`
          : `${round(completion)}% tamamlanıb`,
      hasTarget,
    };
  });
}

function completionFor(actual: number, target: number, isChurn: boolean) {
  if (target <= 0) {
    if (isChurn) return actual <= 0 ? 0 : 100;
    return 0;
  }
  return Math.max(0, (actual / target) * 100);
}

function projectionFor(
  key: CompanyKpiKey,
  actuals: CompanyKpiActuals,
  period: CompanyKpiPeriod,
) {
  if (!period.hasStarted) return 0;
  if (period.isComplete || period.elapsedDays <= 0) return actuals[key];

  if (key === "activeStudents") {
    const netChange = actuals.activeStudents - actuals.openingActiveStudents;
    return Math.max(
      0,
      actuals.openingActiveStudents + (netChange / period.elapsedDays) * period.totalDays,
    );
  }

  if (key === "conversion") return actuals.conversion;
  return Math.max(0, (actuals[key] / period.elapsedDays) * period.totalDays);
}

function requiredPaceFor(
  key: CompanyKpiKey,
  target: number,
  actuals: CompanyKpiActuals,
  period: CompanyKpiPeriod,
): { value: number; kind: CompanyKpiValueKind } {
  const divisor = Math.max(period.remainingDays, 1);
  if (!period.hasStarted || period.isComplete) return { value: 0, kind: "count" };

  if (key === "churn") {
    return { value: Math.max(target - actuals.churn, 0) / divisor, kind: "count" };
  }

  if (key === "conversion") {
    const projectedLeads = projectionFor("leads", actuals, period);
    const requiredConversions = Math.ceil(projectedLeads * (target / 100));
    return {
      value: Math.max(requiredConversions - actuals.convertedLeads, 0) / divisor,
      kind: "count",
    };
  }

  const kind: CompanyKpiValueKind = key === "revenue" ? "money" : "count";
  return { value: Math.max(target - actuals[key], 0) / divisor, kind };
}

function statusFor(
  key: CompanyKpiKey,
  target: number,
  actual: number,
  projected: number,
  period: CompanyKpiPeriod,
  hasTargets: boolean,
): CompanyKpiTone {
  if (!hasTargets || !period.hasStarted) return "neutral";

  if (key === "churn") {
    const measured = period.isComplete ? actual : projected;
    if (measured <= target) return "success";
    if (target <= 0) return "danger";
    if (measured <= target * 1.1) return "warning";
    return "danger";
  }

  if (target <= 0) return "neutral";

  if (key === "activeStudents" || key === "conversion" || period.isComplete) {
    const ratio = actual / target;
    if (ratio >= 1) return "success";
    if (ratio >= 0.9) return "warning";
    return "danger";
  }

  const expectedToDate = target * (period.elapsedDays / period.totalDays);
  const paceRatio = expectedToDate > 0 ? actual / expectedToDate : 0;
  if (paceRatio >= 1) return "success";
  if (paceRatio >= 0.9) return "warning";
  return "danger";
}

function statusLabelFor(status: CompanyKpiTone) {
  if (status === "success") return "Plan üzrə";
  if (status === "warning") return "Diqqət";
  if (status === "danger") return "Geridə";
  return "Neytral";
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}
