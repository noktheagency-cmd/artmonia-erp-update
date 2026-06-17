"use client";

import type { CSSProperties, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cx } from "@/components/ui/cx";

export type HrTone = "success" | "warning" | "danger" | "info" | "neutral";

export type HrTabItem<T extends string> = {
  id: T;
  label: string;
  icon: LucideIcon;
};

export function HrPageHeader({
  label,
  title,
  description,
  action,
}: {
  label: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="hr-ops-header">
      <div>
        <span className="hr-ops-kicker">{label}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action ? <div className="hr-ops-header-actions">{action}</div> : null}
    </header>
  );
}

export function HrTabs<T extends string>({
  tabs,
  activeTab,
  onSelect,
}: {
  tabs: Array<HrTabItem<T>>;
  activeTab: T;
  onSelect: (tab: T) => void;
}) {
  return (
    <nav className="hr-ops-tabs" aria-label="HR panel bolmeleri">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;

        return (
          <button
            className={cx("hr-ops-tab", isActive && "is-active")}
            key={tab.id}
            type="button"
            aria-pressed={isActive}
            onClick={() => onSelect(tab.id)}
          >
            <Icon size={15} strokeWidth={2} />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function HrPanel({
  children,
  className,
  as: Component = "section",
}: {
  children: ReactNode;
  className?: string;
  as?: "article" | "section" | "aside" | "div";
}) {
  return <Component className={cx("hr-ops-panel", className)}>{children}</Component>;
}

export function HrPanelHeader({
  icon: Icon,
  eyebrow,
  title,
  description,
  meta,
  action,
}: {
  icon?: LucideIcon;
  eyebrow?: string;
  title: string;
  description?: string;
  meta?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="hr-ops-panel-head">
      <div className="hr-ops-panel-title">
        {Icon ? (
          <span className="hr-ops-icon" aria-hidden="true">
            <Icon size={17} />
          </span>
        ) : null}
        <div>
          {eyebrow ? <span className="hr-ops-eyebrow">{eyebrow}</span> : null}
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
      </div>
      {meta || action ? (
        <div className="hr-ops-panel-actions">
          {meta}
          {action}
        </div>
      ) : null}
    </div>
  );
}

export function HrMetricTile({
  icon: Icon,
  label,
  value,
  helper,
  tone = "info",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  helper: string;
  tone?: HrTone;
}) {
  return (
    <article className={cx("hr-ops-metric", `is-${tone}`)}>
      <span className="hr-ops-metric-icon" aria-hidden="true">
        <Icon size={17} />
      </span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{helper}</small>
      </div>
    </article>
  );
}

export function HrToolbar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cx("hr-ops-toolbar", className)}>{children}</div>;
}

export function HrInspector({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <aside className={cx("hr-ops-inspector", className)}>{children}</aside>;
}

export function HrCompactChip({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: HrTone;
  className?: string;
}) {
  return <span className={cx("hr-ops-chip", `is-${tone}`, className)}>{children}</span>;
}

export function HrScoreBar({
  value,
  tone = "info",
  label,
}: {
  value: number;
  tone?: HrTone;
  label?: string;
}) {
  const normalized = Math.max(0, Math.min(100, value));

  return (
    <div className={cx("hr-ops-score", `is-${tone}`)} aria-label={label}>
      <span style={{ "--score": `${normalized}%` } as CSSProperties} />
    </div>
  );
}

export function HrSparkline({
  values,
  tone = "info",
  label,
}: {
  values: number[];
  tone?: HrTone;
  label?: string;
}) {
  const safeValues = values.length > 0 ? values : [0];
  const max = Math.max(...safeValues, 1);
  const points = safeValues
    .map((value, index) => {
      const x = safeValues.length === 1 ? 50 : (index / (safeValues.length - 1)) * 100;
      const y = 30 - (Math.max(0, value) / max) * 24;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg className={cx("hr-ops-sparkline", `is-${tone}`)} viewBox="0 0 100 32" role="img" aria-label={label}>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function HrFunnelBand({
  steps,
}: {
  steps: Array<{ label: string; value: number; tone?: HrTone }>;
}) {
  return (
    <div className="hr-ops-funnel" aria-label="Satis hunisi">
      {steps.map((step) => (
        <div
          className={cx("hr-ops-funnel-step", `is-${step.tone ?? "info"}`)}
          key={step.label}
          style={{ "--funnel": `${Math.max(8, Math.min(100, step.value))}%` } as CSSProperties}
        >
          <span>{step.label}</span>
          <strong>{step.value.toFixed(1)}%</strong>
        </div>
      ))}
    </div>
  );
}

export function HrEmptyState({ children }: { children: ReactNode }) {
  return <div className="hr-ops-empty">{children}</div>;
}
