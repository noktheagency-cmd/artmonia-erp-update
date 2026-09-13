import type { CSSProperties } from "react";
import Link from "next/link";
import type { Route } from "next";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  Minus,
  ArrowUpRight,
  BadgeDollarSign,
  GraduationCap,
  ReceiptText,
  TrendingDown,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import type { DashboardData } from "@/modules/dashboard/queries";
import { DashboardTasksPanel } from "@/modules/dashboard/dashboard-tasks-panel";
import { DashboardInsights } from "@/modules/dashboard/dashboard-insights";
import { RevenueAreaChart, RevenueSummaryCards } from "@/modules/dashboard/dashboard-visuals";
import type { TaskData } from "@/modules/tasks/queries";
import type { CompanyKpiData } from "@/modules/hr/company-kpi-data";
import { CompanyKpiProgressPanel } from "@/modules/dashboard/company-kpi-progress-panel";

type TaskAction = (formData: FormData) => unknown | Promise<unknown>;

type KpiPresentation = {
  icon: LucideIcon;
  tone: "blue" | "cyan" | "orange" | "violet";
};

const kpiPresentation: readonly KpiPresentation[] = [
  { icon: GraduationCap, tone: "blue" },
  { icon: WalletCards, tone: "cyan" },
  { icon: ReceiptText, tone: "orange" },
  { icon: BadgeDollarSign, tone: "violet" },
];

export function OwnerDashboard({
  data,
  actorName,
  companyKpiData,
  taskData,
  createTaskAction,
  updateTaskStatusAction,
}: {
  data: DashboardData;
  actorName: string;
  companyKpiData: CompanyKpiData | null;
  taskData: TaskData | null;
  createTaskAction: TaskAction;
  updateTaskStatusAction: TaskAction;
}) {
  return (
    <section className="owner-dashboard" aria-labelledby="owner-dashboard-title">
      <header className="owner-dashboard-header">
        <div className="owner-dashboard-greeting">
          <h1 id="owner-dashboard-title"><span>Salam,</span> {firstName(actorName)}</h1>
        </div>
        {companyKpiData?.permissions.canRead ? (
          <CompanyKpiProgressPanel data={companyKpiData} />
        ) : null}
      </header>

      <div className="owner-dashboard-kpi-grid">
        {data.kpis.map((item, index) => {
          const presentation = kpiPresentation[index] ?? kpiPresentation[0];

          return <DashboardKpiLink data={data} item={item} presentation={presentation} index={index} key={item.label} />;
        })}
      </div>

      <div className="owner-dashboard-primary-grid">
        <article
          className="owner-dashboard-panel owner-dashboard-revenue-panel owner-dashboard-entrance"
          style={sequenceStyle(4)}
        >
          <DashboardPanelHeader
            title="Mərkəzi maliyyə dinamikası"
            description="Tələbə və tədbir gəlirləri, mənfəət və xərclər · son 12 ay"
            href="/finance?type=payments"
            actionLabel="Gəlir hesabatını aç"
          />

          <RevenueAreaChart items={data.revenueBars} />

          <RevenueSummaryCards items={data.revenueBars} bestRevenueMonth={data.bestRevenueMonth} />
        </article>
        <DashboardInsights
          conversionRate={data.conversionRate}
          conversionHelper={data.conversionHelper}
          salesCount={data.salesCount}
          churnRate={data.churnRate}
          churnCounts={data.churnCounts}
        />
      </div>

      {taskData ? (
        <div className="owner-dashboard-lower-grid">
          <DashboardTasksPanel
            data={taskData}
            createTaskAction={createTaskAction}
            updateTaskStatusAction={updateTaskStatusAction}
          />
        </div>
      ) : null}

    </section>
  );
}

function DashboardKpiLink({
  data,
  item,
  presentation,
  index,
}: {
  data: DashboardData;
  item: DashboardData["kpis"][number];
  presentation: KpiPresentation;
  index: number;
}) {
  const Icon = presentation.icon;
  const TrendIcon = item.trend === "up" ? TrendingUp : item.trend === "down" ? TrendingDown : Minus;
  const href = getKpiHref(index, data.filters);

  return (
    <Link
      className={`owner-dashboard-kpi owner-dashboard-kpi-${presentation.tone} owner-dashboard-entrance`}
      href={href}
      style={sequenceStyle(index)}
    >
      <div className="owner-dashboard-kpi-head">
        <span className="owner-dashboard-kpi-icon" aria-hidden="true">
          <Icon size={19} strokeWidth={1.9} />
        </span>
        <span>{item.label}</span>
        <ArrowRight className="owner-dashboard-kpi-arrow" size={18} aria-hidden="true" />
      </div>
      <div className="owner-dashboard-kpi-value">
        <strong>{item.value}</strong>
        {item.detail ? <span>{item.detail}</span> : null}
      </div>
      <div className={`owner-dashboard-kpi-meta is-${item.trend}`}>
        <span className="owner-dashboard-kpi-trend">
          <TrendIcon size={15} strokeWidth={2.2} aria-hidden="true" />
          <em>{item.delta}</em>
        </span>
        <small>{item.helper}</small>
      </div>
    </Link>
  );
}

function getKpiHref(index: number, filters: DashboardData["filters"]): Route {
  if (index === 0) {
    return "/students?status=ACTIVE&tab=list";
  }

  const params = new URLSearchParams({ from: filters.from, to: filters.to });
  if (index === 1) params.set("type", "payments");
  if (index === 2) params.set("type", "expenses");

  return `/finance?${params.toString()}` as Route;
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

function firstName(value: string) {
  return value.trim().split(/\s+/)[0] || "komanda üzvü";
}
