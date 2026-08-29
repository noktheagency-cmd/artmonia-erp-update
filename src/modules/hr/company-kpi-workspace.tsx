"use client";

import { useRouter } from "next/navigation";
import { useTransition, type FormEvent } from "react";
import { LoaderCircle, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { unwrapActionResult } from "@/lib/action-result";
import { notifyCaughtError, notifySuccess } from "@/lib/app-notifications";
import type { CompanyKpiMetric, CompanyKpiValueKind } from "@/modules/hr/company-kpi-calculations";
import type { CompanyKpiData } from "@/modules/hr/company-kpi-data";
import "./company-kpi.css";

type Action = (formData: FormData) => Promise<unknown>;

const targetFields = [
  { name: "activeStudents", label: "Aktiv tələbə", step: "1" },
  { name: "newSales", label: "Yeni satış", step: "1" },
  { name: "churn", label: "Churn maksimumu", step: "1" },
  { name: "leads", label: "Lead", step: "1" },
  { name: "conversion", label: "Conversion (%)", step: "0.01" },
  { name: "revenue", label: "Revenue (AZN)", step: "0.01" },
] as const;

export function CompanyKpiWorkspace({
  data,
  saveAction,
}: {
  data: CompanyKpiData;
  saveAction: Action;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function changeMonth(month: string) {
    if (!/^\d{4}-\d{2}$/.test(month)) return;
    router.replace(`/hr?view=company-kpi&month=${month}`);
  }

  function submitTargets(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => {
      void saveAction(formData)
        .then((result) => {
          unwrapActionResult(result);
          notifySuccess("Hədəflər yadda saxlanıldı");
          router.refresh();
        })
        .catch((error) => notifyCaughtError(error, "Hədəflər yadda saxlanmadı"));
    });
  }

  return (
    <div className="company-kpi-workspace">
      <div className="company-kpi-toolbar">
        <div>
          <h2>Şirkət KPI</h2>
          <p>{data.monthLabel} üzrə hədəf və faktiki nəticələr</p>
        </div>
        <label>
          <span>Ay</span>
          <Input
            aria-label="KPI ayı"
            type="month"
            value={data.periodMonth}
            onChange={(event) => changeMonth(event.target.value)}
          />
        </label>
      </div>

      {data.permissions.canManage ? (
        <form className="company-kpi-target-form" key={data.periodMonth} onSubmit={submitTargets}>
          <input type="hidden" name="periodMonth" value={data.periodMonth} />
          {targetFields.map((field) => (
            <label key={field.name}>
              <span>{field.label}</span>
              <Input
                name={field.name}
                type="number"
                min="0"
                max={field.name === "conversion" ? "100" : undefined}
                step={field.step}
                defaultValue={data.targets?.[field.name] ?? ""}
                required
              />
            </label>
          ))}
          <Button type="submit" disabled={pending}>
            {pending ? <LoaderCircle className="company-kpi-spinner" data-icon="inline-start" /> : <Save data-icon="inline-start" />}
            {pending ? "Yadda saxlanır..." : "Hədəfləri saxla"}
          </Button>
        </form>
      ) : null}

      <section className="company-kpi-list" aria-label="Şirkət KPI göstəriciləri">
        {data.metrics.map((metric) => (
          <KpiProgressRow key={metric.key} metric={metric} />
        ))}
      </section>
    </div>
  );
}

function KpiProgressRow({ metric }: { metric: CompanyKpiMetric }) {
  const progress = Math.min(metric.completion, 100);
  return (
    <article className={`company-kpi-row is-${metric.status}`}>
      <div className="company-kpi-row-head">
        <div>
          <strong>{metric.label}</strong>
          <span className="company-kpi-status">{metric.statusLabel}</span>
        </div>
        <div className="company-kpi-values">
          <span>Actual <b>{formatValue(metric.actual, metric.kind)}</b></span>
          <span>Target <b>{formatValue(metric.target, metric.kind)}</b></span>
        </div>
      </div>
      <Progress value={progress} aria-label={`${metric.label}: ${metric.progressLabel}`} />
      <div className="company-kpi-row-foot">
        <span>{metric.progressLabel}</span>
        <span>{differenceLabel(metric)}</span>
        <span>Proqnoz: {formatValue(metric.projected, metric.kind)}</span>
        <span>{metric.paceLabel}: {formatValue(metric.requiredDaily, metric.requiredDailyKind)}</span>
      </div>
    </article>
  );
}

function differenceLabel(metric: CompanyKpiMetric) {
  if (!metric.hasTarget) return "Fərq targetdən sonra hesablanacaq";
  if (metric.key === "churn") {
    return metric.difference >= 0
      ? `Qalan limit: ${formatValue(metric.difference, "count")}`
      : `Limit ${formatValue(Math.abs(metric.difference), "count")} aşılıb`;
  }
  return metric.difference >= 0
    ? `${formatValue(metric.difference, metric.kind)} öndə`
    : `Qalan: ${formatValue(Math.abs(metric.difference), metric.kind)}`;
}

function formatValue(value: number, kind: CompanyKpiValueKind) {
  const maximumFractionDigits = kind === "count" ? (Number.isInteger(value) ? 0 : 1) : 2;
  const fixed = Math.abs(value).toFixed(maximumFractionDigits);
  const [integerPart, rawFraction = ""] = fixed.split(".");
  const fraction = rawFraction.replace(/0+$/, "");
  const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const formatted = `${value < 0 ? "-" : ""}${groupedInteger}${fraction ? `,${fraction}` : ""}`;
  if (kind === "money") return `${formatted} AZN`;
  if (kind === "percent") return `${formatted}%`;
  return formatted;
}
