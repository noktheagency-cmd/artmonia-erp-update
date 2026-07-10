"use client";

import { type CSSProperties, useState } from "react";
import { CircleDollarSign, Percent, TrendingDown } from "lucide-react";
import { Area, AreaChart, PolarAngleAxis, RadialBar, RadialBarChart } from "recharts";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { DashboardData } from "@/modules/dashboard/queries";

type ChurnCounts = DashboardData["churnCounts"];
type RevenuePoint = DashboardData["revenueBars"][number];

const conversionChartConfig = {
  value: { label: "Konversiya", color: "var(--chart-violet)" },
} satisfies ChartConfig;

const churnChartConfig = {
  value: { label: "Churn", color: "var(--chart-danger)" },
} satisfies ChartConfig;

const forecastChartConfig = {
  revenue: { label: "Gəlir", color: "var(--chart-secondary)" },
} satisfies ChartConfig;

export function DashboardInsights({
  conversionRate,
  conversionHelper,
  revenueForecast,
  revenueForecastHelper,
  revenueBars,
  churnRate,
  churnCounts,
}: {
  conversionRate: string;
  conversionHelper: string;
  revenueForecast: string;
  revenueForecastHelper: string;
  revenueBars: RevenuePoint[];
  churnRate: string;
  churnCounts: ChurnCounts;
}) {
  const [churnOpen, setChurnOpen] = useState(false);
  const conversionValue = percentageToNumber(conversionRate);
  const churnValue = percentageToNumber(churnRate);

  return (
    <aside className="owner-dashboard-panel owner-dashboard-insights-panel owner-dashboard-entrance">
      <section className="owner-dashboard-insight-card owner-dashboard-insight-conversion">
        <MetricRing value={conversionValue} config={conversionChartConfig} tone="conversion" />
        <div className="owner-dashboard-insight-copy">
          <span><Percent size={15} aria-hidden="true" /> Konversiya</span>
          <strong>{conversionRate}</strong>
          <small>{conversionHelper}</small>
        </div>
      </section>

      <section className="owner-dashboard-insight-card owner-dashboard-insight-forecast">
        <div className="owner-dashboard-insight-copy">
          <span><CircleDollarSign size={15} aria-hidden="true" /> Ay sonu gəlir</span>
          <strong>{revenueForecast}</strong>
          <small>{revenueForecastHelper}</small>
        </div>
        <ForecastTrend items={revenueBars} />
      </section>

      <button
        type="button"
        className="owner-dashboard-insight-card owner-dashboard-insight-churn"
        onClick={() => setChurnOpen(true)}
        aria-haspopup="dialog"
        aria-label="Churn Rate detalları aç"
      >
        <MetricRing value={churnValue} config={churnChartConfig} tone="churn" />
        <span className="owner-dashboard-insight-copy">
          <span><TrendingDown size={15} aria-hidden="true" /> Churn Rate</span>
          <strong>{churnRate}</strong>
          <small>Detalları görmək üçün klikləyin</small>
        </span>
      </button>

      <Dialog open={churnOpen} onOpenChange={setChurnOpen}>
        <DialogContent className="owner-dashboard-churn-dialog">
          <DialogHeader className="owner-dashboard-churn-dialog-hero">
            <span className="owner-dashboard-churn-dialog-icon" aria-hidden="true">
              <TrendingDown size={20} strokeWidth={2.1} />
            </span>
            <div>
              <DialogTitle>Churn Rate</DialogTitle>
              <DialogDescription>
                Dondurulan, dayandırılan və imtina edən tələbələrin cari sayı.
              </DialogDescription>
            </div>
            <ChurnRateDial rate={churnRate} />
          </DialogHeader>
          <dl className="owner-dashboard-churn-breakdown">
            <div><dt>Donduranların sayı</dt><dd>{churnCounts.frozen}</dd></div>
            <div><dt>Dayandıranların sayı</dt><dd>{churnCounts.stopped}</dd></div>
            <div><dt>İmtina edənlərin sayı</dt><dd>{churnCounts.declined}</dd></div>
            <div className="owner-dashboard-churn-total"><dt>Ümumi churn sayı</dt><dd>{churnCounts.total}</dd></div>
          </dl>
        </DialogContent>
      </Dialog>
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

function ChurnRateDial({ rate }: { rate: string }) {
  const value = percentageToNumber(rate);

  return (
    <span
      className="owner-dashboard-churn-rate-dial"
      style={{ "--churn-progress": `${value * 3.6}deg` } as CSSProperties}
    >
      <strong>{rate}</strong>
      <small>churn</small>
    </span>
  );
}

function ForecastTrend({ items }: { items: RevenuePoint[] }) {
  const data = items.map((item) => ({ month: item.label, revenue: item.rawAmount, amount: item.amount }));

  return (
    <ChartContainer config={forecastChartConfig} className="owner-dashboard-insight-forecast-chart">
      <AreaChart accessibilityLayer data={data} margin={{ top: 8, right: 2, bottom: 2, left: 2 }}>
        <defs>
          <linearGradient id="insight-forecast-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-revenue)" stopOpacity={0.45} />
            <stop offset="100%" stopColor="var(--color-revenue)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <ChartTooltip
          cursor={false}
          content={<ChartTooltipContent hideLabel indicator="line" />}
        />
        <Area
          type="monotone"
          dataKey="revenue"
          stroke="var(--color-revenue)"
          strokeWidth={2.2}
          fill="url(#insight-forecast-fill)"
        />
      </AreaChart>
    </ChartContainer>
  );
}

function percentageToNumber(value: string) {
  return Math.min(100, Math.max(0, Number.parseFloat(value) || 0));
}
