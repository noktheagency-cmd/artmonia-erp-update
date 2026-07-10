"use client";

import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { DashboardData } from "@/modules/dashboard/queries";

type RevenuePoint = DashboardData["revenueBars"][number];
type StudentStatus = DashboardData["studentStatusCounts"][number];
type TeamMember = DashboardData["teamPerformance"][number];

const STATUS_COLORS: Record<StudentStatus["tone"], string> = {
  success: "var(--chart-positive)",
  warning: "var(--chart-warning)",
  danger: "var(--chart-danger)",
  info: "var(--chart-primary)",
  neutral: "var(--chart-neutral)",
};

const revenueChartConfig = {
  revenue: {
    label: "Gəlir",
    color: "var(--chart-primary)",
  },
} satisfies ChartConfig;

const teamChartConfig = {
  conversion: {
    label: "Konversiya",
    color: "var(--chart-secondary)",
  },
} satisfies ChartConfig;

const statusChartConfig = {
  count: {
    label: "Tələbə sayı",
    color: "var(--chart-primary)",
  },
} satisfies ChartConfig;

export function RevenueAreaChart({ items }: { items: RevenuePoint[] }) {
  const canAnimate = useChartAnimation();
  const chartData = items.map((item) => ({
    month: item.label,
    revenue: item.rawAmount,
    formattedAmount: item.amount,
  }));
  const maximum = Math.max(...items.map((item) => item.rawAmount), 0);
  const chartMax = getChartMax(maximum);

  return (
    <>
    <ChartContainer
      config={revenueChartConfig}
      className="owner-dashboard-recharts owner-dashboard-revenue-chart"
      aria-label="İllik gəlir dinamikası"
    >
      <AreaChart
        accessibilityLayer
        data={chartData}
        margin={{ top: 20, right: 12, bottom: 2, left: 0 }}
      >
        <defs>
          <linearGradient id="revenue-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-revenue)" stopOpacity={0.42} />
            <stop offset="72%" stopColor="var(--chart-secondary)" stopOpacity={0.08} />
            <stop offset="100%" stopColor="var(--color-revenue)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 7" />
        <XAxis
          dataKey="month"
          axisLine={false}
          tickLine={false}
          tickMargin={11}
          minTickGap={18}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          tickMargin={10}
          width={48}
          domain={[0, chartMax]}
          ticks={buildAxisTicks(chartMax)}
          tickFormatter={formatAxisAmount}
        />
        <ChartTooltip
          cursor={{ stroke: "var(--chart-primary)", strokeDasharray: "3 5", strokeOpacity: 0.3 }}
          content={
            <ChartTooltipContent
              indicator="line"
              labelFormatter={(label) => String(label)}
              formatter={(value) => (
                <div className="owner-dashboard-chart-tooltip-value">
                  <span>Gəlir</span>
                  <strong>{formatCurrency(Number(value))}</strong>
                </div>
              )}
            />
          }
        />
        <Area
          type="monotone"
          dataKey="revenue"
          stroke="var(--color-revenue)"
          strokeWidth={2.6}
          fill="url(#revenue-fill)"
          fillOpacity={1}
          dot={{ r: 3.5, fill: "var(--surface)", strokeWidth: 2.2 }}
          activeDot={{ r: 6, strokeWidth: 3, fill: "var(--surface)" }}
          isAnimationActive={canAnimate}
          animationBegin={120}
          animationDuration={1050}
          animationEasing="ease-out"
        />
      </AreaChart>
    </ChartContainer>
    <MonthlyMetricGrid items={items} />
    </>
  );
}

export function RevenueSummaryCards({
  items,
  bestRevenueMonth,
}: {
  items: RevenuePoint[];
  bestRevenueMonth: DashboardData["bestRevenueMonth"];
}) {
  const [revenueRange, setRevenueRange] = useState(12);
  const [averageRange, setAverageRange] = useState(12);
  const revenueItems = items.slice(-revenueRange);
  const averageItems = items.slice(-averageRange);
  const totalRevenue = revenueItems.reduce((sum, item) => sum + item.rawAmount, 0);
  const averageRevenue = averageItems.length > 0
    ? averageItems.reduce((sum, item) => sum + item.rawAmount, 0) / averageItems.length
    : 0;

  return (
    <div className="owner-dashboard-revenue-summary">
      <RevenueSummaryCard
        label="İllik gəlir dinamikası"
        value={formatCurrency(totalRevenue)}
        helper={`Ümumi dövriyyə · Son ${revenueRange} ay`}
        range={revenueRange}
        onRangeChange={setRevenueRange}
      />
      <RevenueSummaryCard
        label="Aylıq orta göstərici"
        value={formatCurrency(averageRevenue)}
        helper={`Son ${averageRange} ay üzrə orta dövriyyə`}
        range={averageRange}
        onRangeChange={setAverageRange}
      />
      <div className="owner-dashboard-best-month">
        <span>Ən məhsuldar ay</span>
        <strong>{bestRevenueMonth.label}</strong>
        <small>{bestRevenueMonth.amount} gəlir</small>
      </div>
    </div>
  );
}

function RevenueSummaryCard({
  label,
  value,
  helper,
  range,
  onRangeChange,
}: {
  label: string;
  value: string;
  helper: string;
  range: number;
  onRangeChange: (range: number) => void;
}) {
  return (
    <div className="owner-dashboard-revenue-stat">
      <div className="owner-dashboard-revenue-stat-head">
        <span>{label}</span>
        <select
          className="owner-dashboard-revenue-range-select"
          value={range}
          onChange={(event) => onRangeChange(Number(event.target.value))}
          aria-label={`${label} üçün tarix aralığı`}
        >
          <option value={3}>3 ay</option>
          <option value={6}>6 ay</option>
          <option value={12}>1 il</option>
        </select>
      </div>
      <strong>{value}</strong>
      <small>{helper}</small>
    </div>
  );
}

function MonthlyMetricGrid({ items }: { items: RevenuePoint[] }) {
  return (
    <section className="owner-dashboard-monthly-metrics" aria-label="Aylıq maliyyə göstəriciləri">
      <div className="owner-dashboard-monthly-metrics-head">
        <h3>Aylıq göstəricilər</h3>
        <span>Dövriyyə · Mənfəət · Xərc</span>
      </div>
      <div className="owner-dashboard-monthly-metrics-scroll">
        {items.map((item) => (
          <article className="owner-dashboard-monthly-metric" key={item.label}>
            <strong>{item.label}</strong>
            <dl>
              <div><dt>Dövriyyə</dt><dd>{item.amount}</dd></div>
              <div><dt>Mənfəət</dt><dd>{item.profit}</dd></div>
              <div><dt>Xərc</dt><dd>{item.expense}</dd></div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}

export function TeamPerformanceChart({ items }: { items: TeamMember[] }) {
  const canAnimate = useChartAnimation();
  const chartData = items.map((member) => ({
    name: member.name,
    conversion: Number.parseFloat(member.conversion) || 0,
    leads: member.leads,
    sales: member.sales,
    revenue: member.revenue,
  }));
  const chartHeight = Math.max(150, chartData.length * 54 + 28);

  return (
    <div className="owner-dashboard-team-chart-wrap">
      <ChartContainer
        config={teamChartConfig}
        className="owner-dashboard-recharts owner-dashboard-team-chart"
        style={{ height: chartHeight }}
        aria-label="Menecerlər üzrə dönüşüm göstəricisi"
      >
        <BarChart
          accessibilityLayer
          data={chartData}
          layout="vertical"
          margin={{ top: 4, right: 38, bottom: 2, left: 2 }}
        >
          <CartesianGrid horizontal={false} strokeDasharray="3 7" />
          <XAxis type="number" domain={[0, 100]} hide />
          <YAxis
            type="category"
            dataKey="name"
            axisLine={false}
            tickLine={false}
            tickMargin={8}
            width={92}
            tickFormatter={shortenName}
          />
          <ChartTooltip
            cursor={{ fill: "var(--surface-soft)", radius: 10 }}
            content={
              <ChartTooltipContent
                hideLabel
                indicator="line"
                formatter={(value, _name, item) => (
                  <div className="owner-dashboard-team-tooltip">
                    <strong>{String(item.payload?.name ?? "Menecer")}</strong>
                    <span>{Number(value)}% dönüşüm</span>
                    <small>
                      {String(item.payload?.leads ?? 0)} müraciət · {String(item.payload?.sales ?? 0)} satış · {String(item.payload?.revenue ?? "0 AZN")}
                    </small>
                  </div>
                )}
              />
            }
          />
          <Bar
            dataKey="conversion"
            fill="var(--color-conversion)"
            barSize={18}
            radius={[0, 8, 8, 0]}
            background={{ fill: "var(--surface-soft)", radius: 8 }}
            minPointSize={5}
            isAnimationActive={canAnimate}
            animationBegin={180}
            animationDuration={900}
            animationEasing="ease-out"
          >
            <LabelList
              dataKey="conversion"
              position="right"
              formatter={(value) => `${Number(value ?? 0)}%`}
              className="owner-dashboard-team-chart-label"
            />
          </Bar>
        </BarChart>
      </ChartContainer>

      <div className="owner-dashboard-team-summary-list">
        {items.map((member) => (
          <div className="owner-dashboard-team-summary" key={member.name}>
            <span>{getInitials(member.name)}</span>
            <div>
              <strong>{member.name}</strong>
              <small>{member.leads} müraciət · {member.sales} satış</small>
            </div>
            <b>{member.revenue}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

export function StudentStatusRing({ items }: { items: StudentStatus[] }) {
  const canAnimate = useChartAnimation();
  const total = items.reduce((sum, item) => sum + item.count, 0);
  const chartData = items.map((item, index) => ({
    key: `status-${index}`,
    label: item.label,
    count: item.count,
    fill: STATUS_COLORS[item.tone],
  }));

  return (
    <div className="owner-dashboard-status-ring" aria-label={`Toplam ${total} tələbə`}>
      <ChartContainer
        config={statusChartConfig}
        className="owner-dashboard-recharts owner-dashboard-status-chart"
      >
        <PieChart accessibilityLayer>
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                hideLabel
                formatter={(value, _name, item) => (
                  <div className="owner-dashboard-chart-tooltip-value">
                    <span>{String(item.payload?.label ?? "Status")}</span>
                    <strong>{String(value)} nəfər</strong>
                  </div>
                )}
              />
            }
          />
          <Pie
            data={chartData}
            dataKey="count"
            nameKey="label"
            innerRadius={37}
            outerRadius={52}
            paddingAngle={3}
            cornerRadius={6}
            strokeWidth={0}
            isAnimationActive={canAnimate}
            animationBegin={160}
            animationDuration={950}
            animationEasing="ease-out"
          >
            {chartData.map((item) => (
              <Cell fill={item.fill} key={item.key} />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>
      <div className="owner-dashboard-status-ring-center">
        <strong>{total}</strong>
        <span>cəmi</span>
      </div>
    </div>
  );
}

function getChartMax(maximum: number) {
  if (maximum <= 0) {
    return 100;
  }

  const magnitude = 10 ** Math.floor(Math.log10(maximum));
  const normalized = maximum / magnitude;
  const stops = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  const ceiling = stops.find((stop) => stop >= normalized) ?? 10;
  return ceiling * magnitude;
}

function buildAxisTicks(maximum: number) {
  return Array.from({ length: 5 }, (_, index) => (maximum / 4) * index);
}

function formatAxisAmount(value: number) {
  if (value === 0) {
    return "0";
  }

  if (value >= 1000) {
    return `${new Intl.NumberFormat("az-AZ", { maximumFractionDigits: 1 }).format(value / 1000)}K`;
  }

  return new Intl.NumberFormat("az-AZ", { maximumFractionDigits: 0 }).format(value);
}

function formatCurrency(value: number) {
  const rounded = Math.round(value);
  const digits = Math.abs(rounded).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  return `${rounded < 0 ? "-" : ""}${digits} AZN`;
}

function shortenName(value: string) {
  return value.length > 14 ? `${value.slice(0, 13)}…` : value;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function useChartAnimation() {
  const [canAnimate, setCanAnimate] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = () => setCanAnimate(!mediaQuery.matches);

    syncPreference();
    mediaQuery.addEventListener("change", syncPreference);
    return () => mediaQuery.removeEventListener("change", syncPreference);
  }, []);

  return canAnimate;
}
