"use client";

import { useState, useSyncExternalStore } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  BellRing,
  BookOpen,
  CalendarCheck2,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Layers3,
  PhoneCall,
  RotateCcw,
  Target,
  TrendingUp,
  UserRoundCheck,
  UsersRound,
  XCircle,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { StatusChip } from "@/components/ui/status-chip";
import { cx } from "@/components/ui/cx";
import type { CrmData } from "@/modules/crm/queries";

const stageIcons = [
  PhoneCall,
  BellRing,
  CalendarCheck2,
  BookOpen,
  CircleDollarSign,
  CheckCircle2,
  XCircle,
  RotateCcw,
];

const conversionConfig = {
  registered: { label: "Qeydiyyata alınıb", color: "#3158f5" },
  remaining: { label: "Davam edən", color: "#dfe6f0" },
  empty: { label: "Müraciət yoxdur", color: "#e7edf5" },
} satisfies ChartConfig;

const teamConfig = {
  leads: { label: "Müraciət", color: "#3158f5" },
  sales: { label: "Satış", color: "#18b88a" },
} satisfies ChartConfig;

function subscribeReducedMotion(callback: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function getReducedMotionSnapshot() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function useReducedMotion() {
  return useSyncExternalStore(subscribeReducedMotion, getReducedMotionSnapshot, () => true);
}

function parseValue(value: string) {
  const normalized = value.replace(/[^0-9.-]/g, "");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function CrmOverview({
  data,
  onStageSelect,
  onLeadSelect,
}: {
  data: CrmData;
  onStageSelect: (stage: string) => void;
  onLeadSelect: (leadId: string) => void;
}) {
  const reducedMotion = useReducedMotion();
  const [followUpCategory, setFollowUpCategory] = useState<"all" | "workshop_masterclass">("all");
  const total = parseValue(data.metrics[0]?.value ?? "0");
  const stageAllTimeTotal = data.stageAllTimeTotal;
  const sales = parseValue(data.dashboardStats.salesCount);
  const conversionRate = parseValue(data.dashboardStats.conversionRate);
  const conversionData =
    total > 0
      ? [
          { key: "registered", value: sales, fill: "var(--color-registered)" },
          {
            key: "remaining",
            value: Math.max(total - sales, 0),
            fill: "var(--color-remaining)",
          },
        ]
      : [{ key: "empty", value: 1, fill: "var(--color-empty)" }];
  const teamData = data.dashboardStats.teamPerformance.map((item) => ({
    manager: item.manager,
    leads: parseValue(item.leads),
    sales: parseValue(item.sales),
    conversionRate: item.conversionRate,
  }));
  const teamMax = Math.max(...teamData.map((item) => item.leads), 1);
  const workshopMasterclassCount = data.attentionFocus.filter(
    (item) => item.category === "workshop_masterclass"
  ).length;
  const visibleAttention = followUpCategory === "workshop_masterclass"
    ? data.attentionFocus.filter((item) => item.category === "workshop_masterclass")
    : data.attentionFocus;
  const todayAttention = visibleAttention.filter((item) => item.bucket === "today");
  const overdueAttention = visibleAttention.filter((item) => item.bucket === "overdue");

  return (
    <section className="crm-overview-grid" aria-label="CRM analitikası">
      <article className="crm-panel crm-pipeline-panel crm-enter" style={{ animationDelay: "100ms" }}>
        <PanelHeading
          icon={Target}
          title="Müraciət mərhələləri"
          description="BK-22/23: indiki mərhələ üzrə bütün dövr — ay/custom tarix filtri bu kartı və klik siyahısını daraltmır"
          meta={`Bütün dövr · ${stageAllTimeTotal.toLocaleString("az-AZ")} müraciət (dövr filtri tətbiq olunmur)`}
          tone="blue"
        />
        <div className="crm-stage-track" role="list" aria-label="Müraciət mərhələləri">
          {data.stageSummary.map((stage, index) => {
            const Icon = stageIcons[index] ?? TrendingUp;
            return (
              <button
                type="button"
                className={cx("crm-stage-node", `is-${stage.tone}`)}
                onClick={() => onStageSelect(stage.stage)}
                role="listitem"
                key={stage.stage}
                style={{ "--stage-delay": `${index * 55}ms` } as React.CSSProperties}
                aria-label={`${stage.label}: ${stage.value}. Siyahını filtrlə`}
              >
                <span className="crm-stage-icon" aria-hidden="true">
                  <Icon />
                </span>
                <span className="crm-stage-copy">
                  <span>{stage.label}</span>
                  <strong>{stage.value}</strong>
                </span>
              </button>
            );
          })}
        </div>
      </article>

      <article className="crm-panel crm-conversion-panel crm-enter" style={{ animationDelay: "145ms" }}>
        <PanelHeading
          icon={TrendingUp}
          title="Konversiya və follow-up"
          description="Qeydiyyata keçid və izləmə sağlamlığı"
          meta={data.dashboardStats.conversionRate}
          tone="green"
        />
        <div className="crm-conversion-layout">
          <div className="crm-conversion-chart">
            <ChartContainer
              config={conversionConfig}
              className="crm-donut-chart"
              initialDimension={{ width: 150, height: 150 }}
            >
              <PieChart accessibilityLayer>
                <Pie
                  data={conversionData}
                  dataKey="value"
                  nameKey="key"
                  innerRadius={50}
                  outerRadius={67}
                  startAngle={90}
                  endAngle={-270}
                  paddingAngle={total > 0 ? 2 : 0}
                  stroke="transparent"
                  isAnimationActive={!reducedMotion}
                  animationDuration={760}
                >
                  {conversionData.map((item) => (
                    <Cell key={item.key} fill={item.fill} />
                  ))}
                </Pie>
                <ChartTooltip content={<ChartTooltipContent hideLabel />} />
              </PieChart>
            </ChartContainer>
            <div className="crm-donut-center" aria-hidden="true">
              <strong>{data.dashboardStats.salesCount}</strong>
              <span>satış · {Math.round(conversionRate)}%</span>
            </div>
          </div>
          <dl className="crm-conversion-stats">
            <div>
              <dt>Cəmi müraciət (seçilmiş dövr)</dt>
              <dd>{data.metrics[0]?.value ?? "0"}</dd>
            </div>
            <div>
              <dt>Uyğun satış</dt>
              <dd>{data.dashboardStats.salesCount}</dd>
            </div>
            <div>
              <dt>Görüş (konsultasiya + sınaq)</dt>
              <dd>{data.dashboardStats.meetingAttendedCount} iştirak · {data.dashboardStats.meetingCount} təyinat</dd>
            </div>
            <div>
              <dt>Bugünkü follow-up</dt>
              <dd>{data.metrics[2]?.value ?? "0"}</dd>
            </div>
            <div>
              <dt>İtki faizi</dt>
              <dd>{data.dashboardStats.lossRate}</dd>
            </div>
          </dl>
        </div>
      </article>

      <article className="crm-panel crm-attention-panel crm-enter" style={{ animationDelay: "170ms" }}>
        <AttentionGroup
          title="Bu gün daxil olan müraciətlər"
          description="Bakı vaxtı ilə cari gündə follow-up-a əlavə edilən müraciətlər"
          tone="today"
          items={data.createdTodayFocus}
          onLeadSelect={onLeadSelect}
          createdToday
        />
      </article>

      <article className="crm-panel crm-attention-panel crm-enter" style={{ animationDelay: "190ms" }}>
        <PanelHeading
          icon={AlertTriangle}
          title="Əlaqə gözləyən müraciətlər"
          description="Cari günə planlanan və vaxtı keçmiş əlaqələr"
          meta={`${visibleAttention.length} müraciət`}
          tone="coral"
        />
        <div className="crm-attention-category-tabs" role="group" aria-label="Follow-up kateqoriyası">
          <button
            type="button"
            data-active={followUpCategory === "all"}
            onClick={() => setFollowUpCategory("all")}
          >
            Bütün follow-up <span>{data.attentionFocus.length}</span>
          </button>
          <button
            type="button"
            data-active={followUpCategory === "workshop_masterclass"}
            onClick={() => setFollowUpCategory("workshop_masterclass")}
          >
            Masterclass &amp; Workshop <span>{workshopMasterclassCount}</span>
          </button>
        </div>
        <div className="crm-attention-groups">
          <AttentionGroup
            title="Bu gün"
            description="Bu gün əlaqə saxlanılacaq"
            tone="today"
            items={todayAttention}
            onLeadSelect={onLeadSelect}
          />
          <AttentionGroup
            title="Gecikənlər"
            description="Planlaşdırılan vaxtı keçib"
            tone="overdue"
            items={overdueAttention}
            onLeadSelect={onLeadSelect}
          />
        </div>
      </article>

      <article className="crm-panel crm-team-panel crm-enter" style={{ animationDelay: "235ms" }}>
        <PanelHeading
          icon={UsersRound}
          title="Komanda performansı"
          description="Müraciət və satış nəticələri"
          meta={`${teamData.length} məsul`}
          tone="blue"
        />
        {teamData.length > 0 ? (
          <div className="crm-team-chart-scroll">
            <ChartContainer
              config={teamConfig}
              className="crm-team-chart"
              style={{ height: `${Math.max(118, teamData.length * 34)}px` }}
            >
              <BarChart accessibilityLayer data={teamData} layout="vertical" margin={{ left: 2, right: 12 }}>
              <CartesianGrid horizontal={false} />
              <XAxis
                type="number"
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
                domain={[0, teamMax]}
                ticks={[0, teamMax]}
              />
              <YAxis
                type="category"
                dataKey="manager"
                axisLine={false}
                tickLine={false}
                width={92}
                tick={{ fontSize: 9 }}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar
                dataKey="leads"
                fill="var(--color-leads)"
                radius={[0, 6, 6, 0]}
                isAnimationActive={!reducedMotion}
                animationDuration={700}
              />
              <Bar
                dataKey="sales"
                fill="var(--color-sales)"
                radius={[0, 6, 6, 0]}
                isAnimationActive={!reducedMotion}
                animationDuration={850}
              />
              </BarChart>
            </ChartContainer>
          </div>
        ) : (
          <div className="crm-inline-empty is-compact">
            <UserRoundCheck aria-hidden="true" />
            <span>Komanda məlumatı mövcud deyil.</span>
          </div>
        )}
      </article>

      <article className="crm-panel crm-interest-panel crm-enter" style={{ animationDelay: "280ms" }}>
        <PanelHeading
          icon={Layers3}
          title="Mənbə və proqram marağı"
          description="Aparıcı kanallar və seçimlər"
          tone="amber"
        />
        <div className="crm-breakdown-columns">
          <BreakdownList title="Mənbələr" items={data.dashboardStats.sourceStats} tone="blue" />
          <BreakdownList title="Proqramlar" items={data.dashboardStats.programStats} tone="green" />
        </div>
      </article>
    </section>
  );
}

function AttentionGroup({
  title,
  description,
  tone,
  items,
  onLeadSelect,
  createdToday = false,
}: {
  title: string;
  description: string;
  tone: "today" | "overdue";
  items: CrmData["attentionFocus"];
  onLeadSelect: (leadId: string) => void;
  createdToday?: boolean;
}) {
  const Icon = tone === "today" ? CalendarCheck2 : AlertTriangle;

  return (
    <section className={cx("crm-attention-group", `is-${tone}`)}>
      <header className="crm-attention-group-heading">
        <span aria-hidden="true"><Icon /></span>
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <strong>{items.length}</strong>
      </header>
      <div className="crm-attention-list">
        {items.length > 0 ? (
          items.map((item) => (
            <button
              type="button"
              className="crm-attention-row"
              onClick={() => onLeadSelect(item.id)}
              key={item.id}
              aria-label={createdToday
                ? `${item.name}. Bu gün daxil olub. Müraciəti aç`
                : `${item.name} ilə əlaqə saxlanılmalıdır. ${item.nextActionTypeLabel}, ${item.nextFollowUpAt}`}
            >
              <span className="crm-person-avatar" aria-hidden="true">
                {item.name.slice(0, 2).toUpperCase()}
              </span>
              <span className="crm-attention-person">
                <strong>{item.name}</strong>
                <small>{item.phone} · {item.manager}</small>
              </span>
              <StatusChip tone={item.priorityTone}>{item.priorityLabel}</StatusChip>
              <span className="crm-attention-action">
                <span>
                  <PhoneCall aria-hidden="true" />
                  <strong>{item.nextActionTypeLabel}</strong>
                </span>
                <small>
                  <Clock3 aria-hidden="true" />
                  {createdToday ? `Daxil olub: ${item.createdAt}` : item.nextFollowUpAt}
                </small>
              </span>
              <ArrowUpRight className="crm-attention-open-icon" aria-hidden="true" />
            </button>
          ))
        ) : (
          <div className="crm-attention-empty">
            <CheckCircle2 aria-hidden="true" />
            <span>{createdToday ? "Bu gün daxil olan müraciət yoxdur" : tone === "today" ? "Bu gün üçün iş yoxdur" : "Gecikən müraciət yoxdur"}</span>
          </div>
        )}
      </div>
    </section>
  );
}

function PanelHeading({
  icon: Icon,
  title,
  description,
  meta,
  tone,
}: {
  icon: React.ComponentType;
  title: string;
  description: string;
  meta?: string;
  tone: "blue" | "green" | "coral" | "amber";
}) {
  return (
    <header className="crm-panel-heading">
      <span className={cx("crm-panel-icon", `is-${tone}`)} aria-hidden="true">
        <Icon />
      </span>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {meta ? <span className={cx("crm-panel-meta", `is-${tone}`)}>{meta}</span> : null}
    </header>
  );
}

function BreakdownList({
  title,
  items,
  tone,
}: {
  title: string;
  items: Array<{ label: string; value: string }>;
  tone: "blue" | "green";
}) {
  const max = Math.max(...items.map((item) => parseValue(item.value)), 1);

  return (
    <section className="crm-interest-breakdown">
      <h3>{title}</h3>
      {items.length > 0 ? (
        items.slice(0, 4).map((item) => {
          const value = parseValue(item.value);
          return (
            <div className="crm-interest-row" key={`${title}-${item.label}`}>
              <div>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
              <span className={cx("crm-interest-track", `is-${tone}`)} aria-hidden="true">
                <span style={{ width: `${Math.max((value / max) * 100, 6)}%` }} />
              </span>
            </div>
          );
        })
      ) : (
        <p className="crm-interest-empty">Məlumat mövcud deyil</p>
      )}
    </section>
  );
}
