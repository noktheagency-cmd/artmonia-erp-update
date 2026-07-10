import type { CSSProperties } from "react";
import Link from "next/link";
import type { Route } from "next";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  ArrowUpRight,
  BadgeDollarSign,
  GraduationCap,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import type { DashboardData } from "@/modules/dashboard/queries";
import { DashboardTasksPanel } from "@/modules/dashboard/dashboard-tasks-panel";
import { DashboardDateFilter } from "@/modules/dashboard/dashboard-date-filter";
import { DashboardInsights } from "@/modules/dashboard/dashboard-insights";
import { RevenueAreaChart, RevenueSummaryCards } from "@/modules/dashboard/dashboard-visuals";
import type { TaskData } from "@/modules/tasks/queries";

type TaskAction = (formData: FormData) => void | Promise<void>;

type KpiPresentation = {
  href: Route;
  icon: LucideIcon;
  tone: "blue" | "cyan" | "orange" | "violet";
};

const kpiPresentation: readonly KpiPresentation[] = [
  { href: "/students?status=ACTIVE&tab=list", icon: GraduationCap, tone: "blue" },
  { href: "/finance?type=payments", icon: WalletCards, tone: "cyan" },
  { href: "/finance", icon: BadgeDollarSign, tone: "orange" },
  { href: "/crm", icon: TrendingUp, tone: "violet" },
];

export function OwnerDashboard({
  data,
  taskData,
  createTaskAction,
}: {
  data: DashboardData;
  taskData: TaskData;
  createTaskAction: TaskAction;
}) {
  return (
    <section className="owner-dashboard" aria-labelledby="owner-dashboard-title">
      <header className="owner-dashboard-header">
        <div>
          <h1 id="owner-dashboard-title">Salam, Artmonia</h1>
        </div>
        <DashboardDateFilter from={data.filters.from} to={data.filters.to} label={data.filters.label} />
      </header>

      <div className="owner-dashboard-kpi-grid">
        {data.kpis.map((item, index) => {
          const presentation = kpiPresentation[index] ?? kpiPresentation[0];

          return <DashboardKpiLink item={item} presentation={presentation} index={index} key={item.label} />;
        })}
      </div>

      <div className="owner-dashboard-primary-grid">
        <article
          className="owner-dashboard-panel owner-dashboard-revenue-panel owner-dashboard-entrance"
          style={sequenceStyle(4)}
        >
          <DashboardPanelHeader
            title="Gəlir dinamikası"
            description="Son 12 ay üzrə dövriyyə, mənfəət və xərc görünüşü"
            href="/finance?type=payments"
            actionLabel="Gəlir hesabatını aç"
          />

          <RevenueAreaChart items={data.revenueBars} />

          <RevenueSummaryCards items={data.revenueBars} bestRevenueMonth={data.bestRevenueMonth} />
        </article>
        <DashboardInsights
          conversionRate={data.conversionRate}
          conversionHelper={data.conversionHelper}
          revenueForecast={data.revenueForecast}
          revenueForecastHelper={data.revenueForecastHelper}
          revenueBars={data.revenueBars}
          churnRate={data.churnRate}
          churnCounts={data.churnCounts}
        />
      </div>

      <div className="owner-dashboard-lower-grid">
        <DashboardTasksPanel
          data={taskData}
          createTaskAction={createTaskAction}
        />
      </div>
    </section>
  );
}

function DashboardKpiLink({
  item,
  presentation,
  index,
}: {
  item: DashboardData["kpis"][number];
  presentation: KpiPresentation;
  index: number;
}) {
  const Icon = presentation.icon;

  return (
    <Link
      className={`owner-dashboard-kpi owner-dashboard-kpi-${presentation.tone} owner-dashboard-entrance`}
      href={presentation.href}
      style={sequenceStyle(index)}
    >
      <div className="owner-dashboard-kpi-head">
        <span className="owner-dashboard-kpi-icon" aria-hidden="true">
          <Icon size={19} strokeWidth={1.9} />
        </span>
        <span>{item.label}</span>
        <ArrowRight className="owner-dashboard-kpi-arrow" size={18} aria-hidden="true" />
      </div>
      <strong>{item.value}</strong>
    </Link>
  );
}

function DashboardPanelHeader({
  title,
  description,
  href,
  actionLabel,
}: {
  title: string;
  description: string;
  href: Route;
  actionLabel: string;
}) {
  return (
    <div className="owner-dashboard-panel-head">
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <Link className="owner-dashboard-icon-link" href={href} aria-label={actionLabel}>
        <ArrowUpRight size={17} strokeWidth={1.9} />
      </Link>
    </div>
  );
}

function sequenceStyle(index: number) {
  return { "--dashboard-sequence": index } as CSSProperties;
}
