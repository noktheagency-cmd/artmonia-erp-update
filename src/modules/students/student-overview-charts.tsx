"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AttendanceAnalyticsCard } from "./attendance-analytics-card";
import { Cell, Pie, PieChart } from "recharts";
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
          <ProgramBars rows={programData} canAnimate={canAnimate} />
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

function ProgramBars({
  rows,
  canAnimate,
}: {
  rows: Array<DistributionItem & { fill: string }>;
  canAnimate: boolean;
}) {
  const maxCount = Math.max(...rows.map((row) => row.count), 1);
  return (
    <div className="students-program-scroll" tabIndex={0} aria-label="Bütün təhsil proqramları">
      <ul className="students-program-bars">
        {rows.map((item) => {
          const width = Math.max(6, Math.round((item.count / maxCount) * 100));
          return (
            <li className="students-program-row" key={item.name} title={`${item.name}: ${item.count} tələbə`}>
              <span className="students-program-label">{item.name}</span>
              <div className="students-program-track" aria-hidden="true">
                <span
                  className={`students-program-fill${canAnimate ? " is-animated" : ""}`}
                  style={{ width: `${width}%`, backgroundColor: item.fill }}
                />
              </div>
              <strong className="students-program-count">{item.count}</strong>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ChartEmptyState({ text }: { text: string }) {
  return <div className="students-chart-empty">{text}</div>;
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
