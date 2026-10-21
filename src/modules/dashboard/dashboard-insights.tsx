"use client";

import Link from "next/link";
import { Percent, TrendingDown } from "lucide-react";
import { PolarAngleAxis, RadialBar, RadialBarChart } from "recharts";
import {
  type ChartConfig,
  ChartContainer,
} from "@/components/ui/chart";
import { retentionDetailsHref } from "@/modules/students/retention-analytics";

const conversionChartConfig = {
  value: { label: "Konversiya", color: "var(--chart-violet)" },
} satisfies ChartConfig;

const churnChartConfig = {
  value: { label: "Churn", color: "var(--chart-danger)" },
} satisfies ChartConfig;

export function DashboardInsights({
  conversionRate,
  conversionHelper,
  salesCount,
  churnRate,
  from,
  to,
}: {
  conversionRate: string;
  conversionHelper: string;
  salesCount: number;
  churnRate: string;
  from: string;
  to: string;
}) {
  const conversionValue = percentageToNumber(conversionRate);
  const churnValue = percentageToNumber(churnRate);

  return (
    <aside className="owner-dashboard-panel owner-dashboard-insights-panel owner-dashboard-entrance">
      <article className="owner-dashboard-insight-card owner-dashboard-insight-conversion">
        <div className="owner-dashboard-insight-sale">
          <span>Bu ay satış</span>
          <strong>{salesCount}</strong>
        </div>
        <Link
          href="/crm?salesDetails=1"
          className="owner-dashboard-insight-conversion-link"
          aria-haspopup="dialog"
          aria-label="Konversiya detallarını aç"
        >
          <MetricRing value={conversionValue} config={conversionChartConfig} tone="conversion" />
          <span className="owner-dashboard-insight-copy">
            <span><Percent size={15} aria-hidden="true" /> Konversiya</span>
            <strong>{conversionRate}</strong>
            <small>{conversionHelper}</small>
          </span>
        </Link>
      </article>

      <Link
        href={retentionDetailsHref(from, to)}
        className="owner-dashboard-insight-card owner-dashboard-insight-churn"
        aria-haspopup="dialog"
        aria-label="Churn Rate detalları aç"
      >
        <MetricRing value={churnValue} config={churnChartConfig} tone="churn" />
        <span className="owner-dashboard-insight-copy">
          <span><TrendingDown size={15} aria-hidden="true" /> Churn Rate</span>
          <strong>{churnRate}</strong>
          <small>{from.split("-").reverse().join(".")} — {to.split("-").reverse().join(".")}</small>
        </span>
      </Link>
    </aside>
  );
}

function MetricRing({
  value,
  config,
  tone,
}: {
  value: number;
  config: ChartConfig;
  tone: "conversion" | "churn";
}) {
  return (
    <ChartContainer config={config} className={`owner-dashboard-insight-ring is-${tone}`}>
      <RadialBarChart
        data={[{ value }]}
        startAngle={90}
        endAngle={-270}
        innerRadius="70%"
        outerRadius="100%"
      >
        <PolarAngleAxis type="number" domain={[0, 100]} tick={false} axisLine={false} />
        <RadialBar
          dataKey="value"
          fill="var(--color-value)"
          background={{ fill: "var(--surface-soft)" }}
          cornerRadius={6}
        />
      </RadialBarChart>
    </ChartContainer>
  );
}

function percentageToNumber(value: string) {
  return Math.min(100, Math.max(0, Number.parseFloat(value) || 0));
}
