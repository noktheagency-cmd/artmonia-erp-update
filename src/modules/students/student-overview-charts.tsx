"use client";

import { useEffect, useState } from "react";
import {
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
import { CircleDollarSign, Layers3, UsersRound } from "lucide-react";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

type DistributionItem = {
  name: string;
  count: number;
  percentage: number;
};

const distributionColors = [
  "var(--students-chart-blue)",
  "var(--students-chart-coral)",
  "var(--students-chart-amber)",
  "var(--students-chart-green)",
  "var(--students-chart-violet)",
  "var(--students-chart-cyan)",
] as const;

const financeChartConfig = {
  value: { label: "Tələbə sayı", color: "var(--students-chart-green)" },
} satisfies ChartConfig;

const programChartConfig = {
  count: { label: "Tələbə sayı", color: "var(--students-chart-blue)" },
} satisfies ChartConfig;

const teacherChartConfig = {
  count: { label: "Tələbə sayı", color: "var(--students-chart-violet)" },
} satisfies ChartConfig;

export function StudentOverviewCharts({
  collectionRate,
  paidCount,
  debtCount,
  waitingCount,
  frozenCount,
  programs,
  teachers,
}: {
  collectionRate: number;
  paidCount: number;
  debtCount: number;
  waitingCount: number;
  frozenCount: number;
  programs: DistributionItem[];
  teachers: DistributionItem[];
}) {
  const canAnimate = useChartAnimation();
  const financeData = [
    { name: "Toplanıb", value: collectionRate, fill: "var(--students-chart-green)" },
    { name: "Qalıb", value: Math.max(100 - collectionRate, 0), fill: "var(--students-chart-track)" },
  ];
  const programData = programs.slice(0, 5).map((item, index) => ({
    ...item,
    fill: distributionColors[index % distributionColors.length],
  }));
  const teacherData = teachers.slice(0, 5).map((item, index) => ({
    ...item,
    fill: distributionColors[(index + 3) % distributionColors.length],
  }));

  return (
    <section className="students-analytics-grid" aria-label="Tələbə analitikası">
      <article className="students-analytics-card students-analytics-finance">
        <AnalyticsHeading
          icon={CircleDollarSign}
          title="Maliyyə sağlamlığı"
          description="Ödəniş və açıq balans nisbəti"
          meta={`${collectionRate}% toplanıb`}
          tone="green"
        />
        <div className="students-finance-content">
          <div className="students-radial-chart" aria-label={`${collectionRate}% ödəniş toplanıb`}>
            <ChartContainer config={financeChartConfig} className="students-chart students-finance-chart">
              <PieChart accessibilityLayer>
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      hideLabel
                      formatter={(value, _name, item) => (
                        <div className="students-tooltip-value">
                          <span>{String(item.payload?.name ?? "Göstərici")}</span>
                          <strong>{Number(value)}%</strong>
                        </div>
                      )}
                    />
                  }
                />
                <Pie
                  data={financeData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={47}
                  outerRadius={61}
                  startAngle={90}
                  endAngle={-270}
                  paddingAngle={collectionRate > 0 && collectionRate < 100 ? 3 : 0}
                  cornerRadius={8}
                  strokeWidth={0}
                  isAnimationActive={canAnimate}
                  animationDuration={900}
                  animationEasing="ease-out"
                >
                  {financeData.map((item) => (
                    <Cell key={item.name} fill={item.fill} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
            <div className="students-radial-center">
              <strong>{collectionRate}%</strong>
              <span>toplanıb</span>
            </div>
          </div>
          <div className="students-analytics-list">
            <AnalyticsRow color="green" label="Tam ödəniş edənlər" value={`${paidCount} (${collectionRate}%)`} />
            <AnalyticsRow color="coral" label="Borcu olanlar" value={`${debtCount} (${100 - collectionRate}%)`} />
            <AnalyticsRow color="amber" label="Slot gözləyənlər" value={`${waitingCount} tələbə`} />
            <AnalyticsRow color="blue" label="Dondurulanlar" value={`${frozenCount} tələbə`} />
          </div>
        </div>
      </article>

      <article className="students-analytics-card students-analytics-programs">
        <AnalyticsHeading
          icon={Layers3}
          title="Təhsil proqramları"
          description="Tələbələrin proqramlara paylanması"
          meta={`${programs.length} proqram`}
          tone="blue"
        />
        {programData.length > 0 ? (
          <ChartContainer config={programChartConfig} className="students-chart students-program-chart">
            <BarChart
              accessibilityLayer
              data={programData}
              layout="vertical"
              margin={{ top: 5, right: 38, bottom: 0, left: 0 }}
            >
              <CartesianGrid horizontal={false} strokeDasharray="3 7" />
              <XAxis type="number" allowDecimals={false} hide domain={[0, "dataMax + 1"]} />
              <YAxis
                type="category"
                dataKey="name"
                axisLine={false}
                tickLine={false}
                tickMargin={9}
                width={94}
                tickFormatter={shortenLabel}
              />
              <ChartTooltip
                cursor={{ fill: "var(--students-chart-hover)", radius: 8 }}
                content={
                  <ChartTooltipContent
                    hideLabel
                    indicator="line"
                    formatter={(value, _name, item) => (
                      <div className="students-tooltip-value">
                        <span>{String(item.payload?.name ?? "Proqram")}</span>
                        <strong>{Number(value)} tələbə</strong>
                      </div>
                    )}
                  />
                }
              />
              <Bar
                dataKey="count"
                radius={[0, 8, 8, 0]}
                barSize={13}
                isAnimationActive={canAnimate}
                animationDuration={850}
                animationEasing="ease-out"
              >
                {programData.map((item) => (
                  <Cell key={item.name} fill={item.fill} />
                ))}
                <LabelList
                  dataKey="count"
                  position="right"
                  formatter={(value) => String(Number(value ?? 0))}
                  className="students-chart-value-label"
                />
              </Bar>
            </BarChart>
          </ChartContainer>
        ) : (
          <ChartEmptyState text="Proqram məlumatı yoxdur" />
        )}
      </article>

      <article className="students-analytics-card students-analytics-teachers">
        <AnalyticsHeading
          icon={UsersRound}
          title="Müəllim yükü"
          description="Aktiv tələbələrin müəllimlər üzrə bölgüsü"
          meta={`${teachers.length} müəllim`}
          tone="amber"
        />
        {teacherData.length > 0 ? (
          <div className="students-teacher-content">
            <div className="students-radial-chart students-teacher-ring" aria-label="Müəllim yükü paylanması">
              <ChartContainer config={teacherChartConfig} className="students-chart students-teacher-chart">
                <PieChart accessibilityLayer>
                  <ChartTooltip
                    cursor={false}
                    content={
                      <ChartTooltipContent
                        hideLabel
                        formatter={(value, _name, item) => (
                          <div className="students-tooltip-value">
                            <span>{String(item.payload?.name ?? "Müəllim")}</span>
                            <strong>{Number(value)} tələbə</strong>
                          </div>
                        )}
                      />
                    }
                  />
                  <Pie
                    data={teacherData}
                    dataKey="count"
                    nameKey="name"
                    innerRadius={43}
                    outerRadius={58}
                    paddingAngle={3}
                    cornerRadius={6}
                    strokeWidth={0}
                    isAnimationActive={canAnimate}
                    animationDuration={950}
                    animationEasing="ease-out"
                  >
                    {teacherData.map((item) => (
                      <Cell fill={item.fill} key={item.name} />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
              <div className="students-radial-center">
                <strong>{teachers.reduce((sum, item) => sum + item.count, 0)}</strong>
                <span>tələbə</span>
              </div>
            </div>
            <div className="students-analytics-list">
              {teacherData.map((item) => (
                <div className="students-analytics-row" key={item.name}>
                  <span className="students-analytics-dot" style={{ backgroundColor: item.fill }} aria-hidden="true" />
                  <span>{item.name}</span>
                  <strong>{item.count} ({item.percentage}%)</strong>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <ChartEmptyState text="Müəllim məlumatı yoxdur" />
        )}
      </article>
    </section>
  );
}

function AnalyticsHeading({
  icon: Icon,
  title,
  description,
  meta,
  tone,
}: {
  icon: typeof CircleDollarSign;
  title: string;
  description: string;
  meta: string;
  tone: "green" | "blue" | "amber";
}) {
  return (
    <header className="students-analytics-heading">
      <span className={`students-analytics-icon is-${tone}`} aria-hidden="true">
        <Icon />
      </span>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <span className={`students-analytics-meta is-${tone}`}>{meta}</span>
    </header>
  );
}

function AnalyticsRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="students-analytics-row">
      <span className={`students-analytics-dot is-${color}`} aria-hidden="true" />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ChartEmptyState({ text }: { text: string }) {
  return <div className="students-chart-empty">{text}</div>;
}

function shortenLabel(value: string) {
  return value.length > 16 ? `${value.slice(0, 15)}…` : value;
}

function useChartAnimation() {
  const [canAnimate, setCanAnimate] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setCanAnimate(!mediaQuery.matches);
    sync();
    mediaQuery.addEventListener("change", sync);
    return () => mediaQuery.removeEventListener("change", sync);
  }, []);

  return canAnimate;
}
