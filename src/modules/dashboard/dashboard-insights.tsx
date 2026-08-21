"use client";

import { type CSSProperties, useState } from "react";
import Link from "next/link";
import { ArrowRight, Percent, TrendingDown } from "lucide-react";
import { PolarAngleAxis, RadialBar, RadialBarChart } from "recharts";
import {
  type ChartConfig,
  ChartContainer,
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
  churnCounts,
}: {
  conversionRate: string;
  conversionHelper: string;
  salesCount: number;
  churnRate: string;
  churnCounts: ChurnCounts;
}) {
  const [churnOpen, setChurnOpen] = useState(false);
  const conversionValue = percentageToNumber(conversionRate);
  const churnValue = percentageToNumber(churnRate);
  const churnDetails = [
    { label: "Dondurulan tələbələr", status: "FROZEN", count: churnCounts.frozen },
    { label: "Təhsili dayandıranlar", status: "STOPPED", count: churnCounts.stopped },
    { label: "İmtina edənlər", status: "DECLINED", count: churnCounts.declined },
  ] as const;

  return (
    <aside className="owner-dashboard-panel owner-dashboard-insights-panel owner-dashboard-entrance">
      <section className="owner-dashboard-insight-card owner-dashboard-insight-conversion">
        <MetricRing value={conversionValue} config={conversionChartConfig} tone="conversion" />
        <div className="owner-dashboard-insight-copy">
          <span><Percent size={15} aria-hidden="true" /> Satış sayı</span>
          <strong>{salesCount}</strong>
          <small>Konversiya {conversionRate} · {conversionHelper}</small>
        </div>
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
          <div className="owner-dashboard-churn-summary" aria-label="Churn xülasəsi">
            <div><span>Ümumi tələbə</span><strong>{churnCounts.population}</strong></div>
            <div><span>Churn statusunda</span><strong>{churnCounts.total}</strong></div>
            <div><span>Churndan kənar</span><strong>{Math.max(0, churnCounts.population - churnCounts.total)}</strong></div>
          </div>
          <nav className="owner-dashboard-churn-breakdown" aria-label="Churn statusları üzrə tələbə siyahıları">
            {churnDetails.map((item) => (
              <Link
                href={`/students?status=${item.status}&tab=list`}
                key={item.status}
                onClick={() => setChurnOpen(false)}
              >
                <span>
                  <strong>{item.label}</strong>
                  <small>Ümumi tələbələrin {formatShare(item.count, churnCounts.population)}-i</small>
                </span>
                <b>{item.count}</b>
                <ArrowRight aria-hidden="true" />
              </Link>
            ))}
          </nav>
          <Link
            className="owner-dashboard-churn-total-link"
            href="/students?churn=1&tab=list"
            onClick={() => setChurnOpen(false)}
          >
            Bütün churn tələbələrini aç
            <span>{churnCounts.total}</span>
            <ArrowRight aria-hidden="true" />
          </Link>
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

function percentageToNumber(value: string) {
  return Math.min(100, Math.max(0, Number.parseFloat(value) || 0));
}

function formatShare(value: number, total: number) {
  return `${total > 0 ? Math.round((value / total) * 100) : 0}%`;
}
