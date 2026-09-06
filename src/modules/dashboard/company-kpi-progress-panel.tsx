"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { ArrowUpRight, ChartNoAxesCombined, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import type {
  CompanyKpiMetric,
  CompanyKpiTone,
  CompanyKpiValueKind,
} from "@/modules/hr/company-kpi-calculations";
import type { CompanyKpiData } from "@/modules/hr/company-kpi-data";

export function CompanyKpiProgressPanel({ data }: { data: CompanyKpiData }) {
  const sales = data.metrics.find((metric) => metric.key === "newSales");
  if (!sales) return null;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="owner-dashboard-company-kpi"
          aria-label={`${data.monthLabel} üzrə şirkət KPI detallarını aç`}
        >
          <span className="owner-dashboard-company-kpi-icon" aria-hidden="true">
            <ChartNoAxesCombined />
          </span>
          <span className="owner-dashboard-company-kpi-content">
            <span className="owner-dashboard-company-kpi-headline">
              <span>
                <strong>Aylıq satış</strong>
                <small>{data.monthLabel} · yeni qeydiyyat və ödənişli geri dönüş</small>
              </span>
              <span className="owner-dashboard-company-kpi-result">
                <b>{formatValue(sales.actual, sales.kind)}</b>
                <small>/ {sales.hasTarget ? formatValue(sales.target, sales.kind) : "Target yoxdur"}</small>
              </span>
            </span>
            <Progress
              value={progressValue(sales)}
              aria-label={`Aylıq satış: ${sales.progressLabel}`}
              className="owner-dashboard-company-kpi-progress"
            />
          </span>
          <StatusBadge tone={sales.status} label={sales.statusLabel} />
          <ChevronRight className="owner-dashboard-company-kpi-chevron" aria-hidden="true" />
        </button>
      </DialogTrigger>

      <DialogContent className="owner-dashboard-company-kpi-dialog">
        <DialogHeader>
          <DialogTitle>Şirkət KPI · {data.monthLabel}</DialogTitle>
          <DialogDescription>
            Aylıq hədəflərin faktiki nəticə, fərq, tamamlanma və ay sonu proqnozu.
          </DialogDescription>
        </DialogHeader>

        <div className="owner-dashboard-company-kpi-list">
          {data.metrics.map((metric) => (
            <MetricRow key={metric.key} metric={metric} />
          ))}
        </div>

        <DialogFooter>
          <Link
            href={`/hr?view=company-kpi&month=${data.periodMonth}`}
            className={buttonVariants({ variant: "default" })}
          >
            {data.permissions.canManage ? "Ayın hədəflərini idarə et" : "Şirkət KPI bölməsini aç"}
            <ArrowUpRight data-icon="inline-end" />
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MetricRow({ metric }: { metric: CompanyKpiMetric }) {
  return (
    <article className="owner-dashboard-company-kpi-metric">
      <div className="owner-dashboard-company-kpi-metric-head">
        <div>
          <strong>{metric.label}</strong>
          <span>
            Actual <b>{formatValue(metric.actual, metric.kind)}</b>
            <i aria-hidden="true">·</i>
            Target <b>{metric.hasTarget ? formatValue(metric.target, metric.kind) : "—"}</b>
          </span>
        </div>
        <StatusBadge tone={metric.status} label={metric.statusLabel} />
      </div>
      <Progress
        value={progressValue(metric)}
        aria-label={`${metric.label}: ${metric.progressLabel}`}
        className="owner-dashboard-company-kpi-metric-progress"
      />
      <div className="owner-dashboard-company-kpi-metric-foot">
        <span>{metric.progressLabel}</span>
        <span>{differenceLabel(metric)}</span>
        <span>Proqnoz: {formatValue(metric.projected, metric.kind)}</span>
        <span>{metric.paceLabel}: {formatValue(metric.requiredDaily, metric.requiredDailyKind)}</span>
      </div>
    </article>
  );
}

function StatusBadge({ tone, label }: { tone: CompanyKpiTone; label: string }) {
  const variant: ComponentProps<typeof Badge>["variant"] =
    tone === "danger"
      ? "destructive"
      : tone === "success"
        ? "default"
        : tone === "warning"
          ? "secondary"
          : "outline";

  return <Badge variant={variant}>{label}</Badge>;
}

function progressValue(metric: CompanyKpiMetric) {
  return Math.min(Math.max(metric.completion, 0), 100);
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
  return new Intl.NumberFormat("az-AZ", {
    style: kind === "money" ? "currency" : "decimal",
    currency: kind === "money" ? "AZN" : undefined,
    maximumFractionDigits: kind === "count" && Number.isInteger(value) ? 0 : 2,
  }).format(value) + (kind === "percent" ? "%" : "");
}
