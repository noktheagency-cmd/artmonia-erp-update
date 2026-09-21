"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AttendanceAnalyticsCard } from "./attendance-analytics-card";
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
import { Layers3, UsersRound, type LucideIcon } from "lucide-react";
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
  capacity: number | null;
  utilization: number | null;
};

const distributionColors = [
  "var(--students-chart-blue)",
  "var(--students-chart-coral)",
  "var(--students-chart-amber)",
  "var(--students-chart-green)",
  "var(--students-chart-violet)",
  "var(--students-chart-cyan)",
] as const;

const programChartConfig = {
  count: { label: "Tələbə sayı", color: "var(--students-chart-blue)" },
} satisfies ChartConfig;

const teacherChartConfig = {
  count: { label: "Tələbə sayı", color: "var(--students-chart-violet)" },
} satisfies ChartConfig;

export function StudentOverviewCharts({
  canReadAttendance = false,
  programs,
  teachers,
}: {
  canReadAttendance?: boolean;
  programs: DistributionItem[];
  teachers: DistributionItem[];
}) {
  const canAnimate = useChartAnimation();
  const searchParams = useSearchParams();
  const programData = programs.map((item, index) => ({
    ...item,
    fill: distributionColors[index % distributionColors.length],
  }));
  const teacherData = teachers.map((item, index) => ({
    ...item,
    fill: distributionColors[(index + 3) % distributionColors.length],
  }));

  return (
    <section className="students-analytics-grid" aria-label="Tələbə analitikası">
      <article className="students-analytics-card students-analytics-programs">
        <AnalyticsHeading
          icon={Layers3}
          title="Təhsil proqramları"
          description="Tələbələrin proqramlara paylanması"
          meta={`${programs.length} proqram`}
          tone="blue"
        />
        {programData.length > 0 ? (
          <div className="students-program-scroll" tabIndex={0} aria-label="Bütün təhsil proqramları">
            <ChartContainer config={programChartConfig} className="students-chart students-program-chart" style={{ height: Math.max(178, programData.length * 36) }}>
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
                  interval={0}
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
          </div>
        ) : (
          <ChartEmptyState text="Proqram məlumatı yoxdur" />
        )}
      </article>

      <article className="students-analytics-card students-analytics-teachers">
        <AnalyticsHeading
          icon={UsersRound}
          title="Müəllim yükü"
          description="Aktiv tələbə sayı / müəllimin real tutumu"
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
            <div className="students-analytics-list" tabIndex={0} aria-label="Bütün müəllimlər">
              {teacherData.map((item) => (
                <div className="students-analytics-row" key={item.name}>
                  <span className="students-analytics-dot" style={{ backgroundColor: item.fill }} aria-hidden="true" />
                  <span>{item.name}</span>
                  <strong>{item.count}/{item.capacity ?? "—"} ({item.utilization ?? 0}% yük)</strong>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <ChartEmptyState text="Müəllim məlumatı yoxdur" />
        )}
      </article>
      {canReadAttendance && <AttendanceAnalyticsCard key={`${searchParams.get("attendance")}:${searchParams.get("attendanceFrom")}:${searchParams.get("attendanceTo")}`} />}
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
  icon: LucideIcon;
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
