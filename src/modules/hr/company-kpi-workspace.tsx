"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type FormEvent } from "react";
import type { Route } from "next";
import { CalendarRange, ChevronRight, Equal, LoaderCircle, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MonthPicker } from "@/components/ui/month-picker";
import { Progress } from "@/components/ui/progress";
import { unwrapActionResult } from "@/lib/action-result";
import { notifyCaughtError, notifySuccess } from "@/lib/app-notifications";
import type {
  CompanyKpiKey,
  CompanyKpiMetric,
  CompanyKpiTargets,
  CompanyKpiValueKind,
} from "@/modules/hr/company-kpi-calculations";
import type { CompanyKpiData } from "@/modules/hr/company-kpi-data";
import { kpiMetricHref } from "@/modules/hr/company-kpi-links";
import "./company-kpi.css";

type Action = (formData: FormData) => Promise<unknown>;

const targetFields: Array<{
  name: CompanyKpiKey;
  label: string;
  shortLabel: string;
  step: string;
  kind: CompanyKpiValueKind;
}> = [
  { name: "activeStudents", label: "Aktiv tələbə", shortLabel: "Aktiv tələbə", step: "1", kind: "count" },
  { name: "newSales", label: "Yeni satış", shortLabel: "Satış", step: "1", kind: "count" },
  { name: "churn", label: "Churn maksimumu", shortLabel: "Churn", step: "1", kind: "count" },
  { name: "leads", label: "Lead", shortLabel: "Lead", step: "1", kind: "count" },
  { name: "conversion", label: "Conversion (%)", shortLabel: "Conversion", step: "0.01", kind: "percent" },
  { name: "revenue", label: "Revenue (AZN)", shortLabel: "Revenue", step: "0.01", kind: "money" },
];

type PlanMonthDraft = { periodMonth: string } & CompanyKpiTargets;

export function CompanyKpiWorkspace({
  data,
  saveAction,
  savePlanAction,
}: {
  data: CompanyKpiData;
  saveAction: Action;
  savePlanAction: Action;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function changeMonth(month: string) {
    if (!/^\d{4}-\d{2}$/.test(month)) return;
    router.replace(`/hr?view=company-kpi&month=${month}`);
  }

  function runSave(action: Action, formData: FormData, success: string) {
    startTransition(() => {
      void action(formData)
        .then((result) => {
          unwrapActionResult(result);
          notifySuccess(success);
          router.refresh();
        })
        .catch((error) => notifyCaughtError(error, `${success} mümkün olmadı`));
    });
  }

  function submitTargets(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    runSave(saveAction, new FormData(event.currentTarget), "Aylıq hədəflər yadda saxlanıldı");
  }

  const [panel, setPanel] = useState<"month" | "plan">("month");

  return (
    <div className="company-kpi-workspace">
      <div className="company-kpi-toolbar">
        <div>
          <h2>Şirkət KPI</h2>
          <p>{data.monthLabel} · hədəf və faktiki nəticə</p>
        </div>
        <label>
          <span>Ay</span>
          <MonthPicker
            aria-label="KPI ayı"
            value={data.periodMonth}
            onValueChange={changeMonth}
            allowClear={false}
          />
        </label>
      </div>

      <div className="company-kpi-panel-switch" role="tablist" aria-label="KPI bölmələri">
        <button type="button" role="tab" aria-selected={panel === "month"} className={panel === "month" ? "is-active" : ""} onClick={() => setPanel("month")}>
          Bu ayın nəticələri
        </button>
        {data.permissions.canManage || data.plan ? (
          <button type="button" role="tab" aria-selected={panel === "plan"} className={panel === "plan" ? "is-active" : ""} onClick={() => setPanel("plan")}>
            Uzunmüddətli plan
          </button>
        ) : null}
      </div>

      {panel === "month" ? (
        <>
          {data.permissions.canManage && !data.plan ? (
            <form className="company-kpi-target-form" key={data.periodMonth} onSubmit={submitTargets}>
              <div className="company-kpi-target-form-head">
                <strong>Aylıq hədəflər</strong>
                <span>Plan yoxdursa bu ay üçün hədəfləri birbaşa daxil edin</span>
              </div>
              <div className="company-kpi-target-form-grid">
                <input type="hidden" name="periodMonth" value={data.periodMonth} />
                {targetFields.map((field) => (
                  <label key={field.name}>
                    <span>{field.label}</span>
                    <Input name={field.name} type="number" min="0" max={field.name === "conversion" ? "100" : undefined} step={field.step} defaultValue={data.targets?.[field.name] ?? ""} required />
                  </label>
                ))}
              </div>
              <div className="company-kpi-target-form-actions">
                <Button type="submit" size="sm" disabled={pending}>
                  {pending ? <LoaderCircle className="company-kpi-spinner" data-icon="inline-start" /> : <Save data-icon="inline-start" />}
                  {pending ? "Yadda saxlanır..." : "Hədəfləri saxla"}
                </Button>
              </div>
            </form>
          ) : null}

          {data.plan ? <CompensationNotice data={data} /> : null}

          <section className="company-kpi-list" aria-label="Şirkət KPI göstəriciləri">
            {data.metrics.map((metric) => (
              <KpiProgressRow
                key={metric.key}
                metric={metric}
                baseTarget={data.baseTargets?.[metric.key] ?? null}
                carryIn={data.carryIn?.[metric.key] ?? null}
                href={kpiMetricHref(metric.key, data.periodMonth)}
              />
            ))}
          </section>
        </>
      ) : (
        <>
          {data.permissions.canManage ? (
            <PlanEditor data={data} pending={pending} onSave={(formData) => runSave(savePlanAction, formData, "KPI planı yadda saxlanıldı")} />
          ) : data.plan ? (
            <PlanSummary data={data} />
          ) : null}
        </>
      )}
    </div>
  );
}

function PlanEditor({ data, pending, onSave }: { data: CompanyKpiData; pending: boolean; onSave: (formData: FormData) => void }) {
  const initialDuration = data.plan?.durationMonths ?? 6;
  const initialTotals = data.plan?.totals ?? multiplyTargets(data.baseTargets ?? zeroTargets(), initialDuration);
  const [name, setName] = useState(data.plan?.name ?? `${data.periodMonth} şirkət KPI planı`);
  const [startMonth, setStartMonth] = useState(data.plan?.startMonth ?? data.periodMonth);
  const [duration, setDuration] = useState<6 | 12>(initialDuration);
  const [totals, setTotals] = useState<CompanyKpiTargets>(initialTotals);
  const [months, setMonths] = useState<PlanMonthDraft[]>(() => data.plan
    ? data.plan.months.map((month) => ({ periodMonth: month.periodMonth, ...month.baseTargets }))
    : distributePlan(startMonth, initialDuration, initialTotals));

  const sums = useMemo(() => sumMonths(months), [months]);
  const balanced = targetFields.every((field) => Math.abs(sums[field.name] - totals[field.name]) < 0.011);

  function redistribute(nextStart = startMonth, nextDuration = duration, nextTotals = totals) {
    setMonths(distributePlan(nextStart, nextDuration, nextTotals));
  }

  function changeDuration(value: 6 | 12) {
    setDuration(value);
    redistribute(startMonth, value, totals);
  }

  function changeStartMonth(value: string) {
    if (!/^\d{4}-\d{2}$/.test(value)) return;
    setStartMonth(value);
    redistribute(value, duration, totals);
  }

  function changeTotal(key: CompanyKpiKey, value: number) {
    const nextTotals = { ...totals, [key]: Math.max(0, value) };
    setTotals(nextTotals);
    setMonths((current) => distributeMetric(current, key, nextTotals[key]));
  }

  function changeMonthValue(index: number, key: CompanyKpiKey, value: number) {
    setMonths((current) => current.map((month, monthIndex) => monthIndex === index ? { ...month, [key]: Math.max(0, value) } : month));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("name", name);
    formData.set("startMonth", startMonth);
    formData.set("durationMonths", String(duration));
    formData.set("totals", JSON.stringify(totals));
    formData.set("months", JSON.stringify(months));
    onSave(formData);
  }

  return (
    <form className="company-kpi-plan" onSubmit={submit}>
      <div className="company-kpi-plan-head">
        <div><CalendarRange /><span><strong>Uzunmüddətli plan</strong><small>Ümumi hədəfi aylara bölün — cədvəl ikinci addımdır</small></span></div>
        <div className="company-kpi-plan-duration" role="group" aria-label="Plan müddəti">
          <button type="button" className={duration === 6 ? "is-active" : ""} onClick={() => changeDuration(6)}>6 ay</button>
          <button type="button" className={duration === 12 ? "is-active" : ""} onClick={() => changeDuration(12)}>İllik</button>
        </div>
      </div>

      <div className="company-kpi-plan-meta">
        <label><span>Plan adı</span><Input value={name} onChange={(event) => setName(event.target.value)} minLength={3} maxLength={120} required /></label>
        <label>
          <span>Başlanğıc ayı</span>
          <MonthPicker
            value={startMonth}
            onValueChange={changeStartMonth}
            allowClear={false}
            required
          />
        </label>
        <Button type="button" variant="outline" onClick={() => redistribute()}><Equal data-icon="inline-start" /> Bərabər böl</Button>
      </div>

      <div className="company-kpi-plan-section-label">1. Ümumi hədəflər</div>
      <div className="company-kpi-plan-totals">
        {targetFields.map((field) => (
          <label key={field.name}>
            <span>{field.label}</span>
            <Input type="number" min="0" step={field.step} value={totals[field.name]} onChange={(event) => changeTotal(field.name, Number(event.target.value))} />
          </label>
        ))}
      </div>

      <div className="company-kpi-plan-section-label">2. Aylıq bölgü</div>

      <div className="company-kpi-plan-table-wrap" data-erp-table-scroll="">
        <table className="company-kpi-plan-table">
          <thead><tr><th>Ay</th>{targetFields.map((field) => <th key={field.name}>{field.shortLabel}</th>)}</tr></thead>
          <tbody>{months.map((month, index) => (
            <tr key={month.periodMonth}>
              <th>{formatMonth(month.periodMonth)}</th>
              {targetFields.map((field) => <td key={field.name}><Input aria-label={`${formatMonth(month.periodMonth)} ${field.label}`} type="number" min="0" max={field.name === "conversion" ? "100" : undefined} step={field.step} value={month[field.name]} onChange={(event) => changeMonthValue(index, field.name, Number(event.target.value))} /></td>)}
            </tr>
          ))}</tbody>
          <tfoot><tr><th>Cəm</th>{targetFields.map((field) => <td className={Math.abs(sums[field.name] - totals[field.name]) < 0.011 ? "is-balanced" : "is-unbalanced"} key={field.name}>{formatValue(sums[field.name], field.kind)}</td>)}</tr></tfoot>
        </table>
      </div>

      <div className="company-kpi-plan-footer">
        <span className={balanced ? "is-balanced" : "is-unbalanced"}>{balanced ? "Aylıq bölgü ümumi hədəflərlə balansdadır." : "Qırmızı cəmləri ümumi hədəflə bərabərləşdirin."}</span>
        <Button type="submit" disabled={pending || !balanced}>{pending ? <LoaderCircle className="company-kpi-spinner" data-icon="inline-start" /> : <Save data-icon="inline-start" />}{pending ? "Yadda saxlanır..." : "Planı saxla"}</Button>
      </div>
    </form>
  );
}

function PlanSummary({ data }: { data: CompanyKpiData }) {
  if (!data.plan) return null;
  return <section className="company-kpi-plan-summary"><CalendarRange /><div><strong>{data.plan.name}</strong><span>{data.plan.durationMonths === 12 ? "İllik" : "6 aylıq"} plan · {formatMonth(data.plan.startMonth)} – {formatMonth(data.plan.endMonth)}</span></div></section>;
}

function CompensationNotice({ data }: { data: CompanyKpiData }) {
  if (!data.plan) return null;
  const adjustments = targetFields.filter((field) => Math.abs(data.carryIn?.[field.name] ?? 0) > 0.011);
  return <div className="company-kpi-compensation"><strong>Avtomatik kompensasiya</strong>{adjustments.length ? <span>{adjustments.map((field) => `${field.shortLabel}: ${signedValue(data.carryIn?.[field.name] ?? 0, field.kind)}`).join(" · ")}</span> : <span>Əvvəlki tamamlanmış aydan qalıq yoxdur; baza bölgüsü qüvvədədir.</span>}</div>;
}

function KpiProgressRow({
  metric,
  baseTarget,
  carryIn,
  href,
}: {
  metric: CompanyKpiMetric;
  baseTarget: number | null;
  carryIn: number | null;
  href: Route;
}) {
  const progress = Math.min(metric.completion, 100);
  return (
    <Link
      href={href}
      className={`company-kpi-row is-${metric.status}`}
      aria-label={`${metric.label} səhifəsinə keç`}
    >
      <div className="company-kpi-row-head">
        <div>
          <strong>{metric.label}</strong>
          <span className="company-kpi-status">{metric.statusLabel}</span>
        </div>
        <div className="company-kpi-values">
          <span>Actual <b>{formatValue(metric.actual, metric.kind)}</b></span>
          <span>Target <b>{formatValue(metric.target, metric.kind)}</b></span>
          <ChevronRight className="company-kpi-row-chevron" aria-hidden="true" />
        </div>
      </div>
      <Progress value={progress} aria-label={`${metric.label}: ${metric.progressLabel}`} />
      <div className="company-kpi-row-foot">
        <span>{metric.progressLabel}</span>
        <span>{differenceLabel(metric)}</span>
        <span>Proqnoz: {formatValue(metric.projected, metric.kind)}</span>
        <span>{metric.paceLabel}: {formatValue(metric.requiredDaily, metric.requiredDailyKind)}</span>
        {baseTarget !== null && carryIn !== null ? (
          <span>Baza: {formatValue(baseTarget, metric.kind)} · kompensasiya {signedValue(carryIn, metric.kind)}</span>
        ) : null}
      </div>
    </Link>
  );
}

function distributePlan(startMonth: string, duration: 6 | 12, totals: CompanyKpiTargets) {
  const base = Array.from({ length: duration }, (_, index) => ({ periodMonth: addMonthKey(startMonth, index), ...zeroTargets() }));
  return targetFields.reduce((months, field) => distributeMetric(months, field.name, totals[field.name]), base);
}

function distributeMetric(months: PlanMonthDraft[], key: CompanyKpiKey, total: number) {
  const integerMetric = key === "activeStudents" || key === "newSales" || key === "churn" || key === "leads";
  const units = integerMetric ? Math.round(total) : Math.round(total * 100);
  const base = Math.floor(units / months.length);
  let remainder = units - base * months.length;
  return months.map((month) => {
    const current = base + (remainder > 0 ? 1 : 0);
    remainder = Math.max(0, remainder - 1);
    return { ...month, [key]: integerMetric ? current : current / 100 };
  });
}

function sumMonths(months: PlanMonthDraft[]): CompanyKpiTargets {
  return targetFields.reduce((totals, field) => ({ ...totals, [field.name]: round2(months.reduce((sum, month) => sum + month[field.name], 0)) }), zeroTargets());
}

function multiplyTargets(targets: CompanyKpiTargets, multiplier: number): CompanyKpiTargets {
  return targetFields.reduce((result, field) => ({ ...result, [field.name]: round2(targets[field.name] * multiplier) }), zeroTargets());
}

function zeroTargets(): CompanyKpiTargets { return { activeStudents: 0, newSales: 0, churn: 0, leads: 0, conversion: 0, revenue: 0 }; }
function round2(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
function addMonthKey(value: string, amount: number) { const [year, month] = value.split("-").map(Number); return new Date(Date.UTC(year, month - 1 + amount, 1)).toISOString().slice(0, 7); }
const shortMonthNames = ["yan", "fev", "mar", "apr", "may", "iyn", "iyl", "avq", "sen", "okt", "noy", "dek"] as const;

function formatMonth(value: string) {
  const [year, month] = value.split("-");
  const monthIndex = Number(month) - 1;
  return `${shortMonthNames[monthIndex] ?? month} ${year}`;
}

function differenceLabel(metric: CompanyKpiMetric) {
  if (!metric.hasTarget) return "Fərq targetdən sonra hesablanacaq";
  if (metric.key === "churn") return metric.difference >= 0 ? `Qalan limit: ${formatValue(metric.difference, "count")}` : `Limit ${formatValue(Math.abs(metric.difference), "count")} aşılıb`;
  return metric.difference >= 0 ? `${formatValue(metric.difference, metric.kind)} öndə` : `Qalan: ${formatValue(Math.abs(metric.difference), metric.kind)}`;
}

function signedValue(value: number, kind: CompanyKpiValueKind) { return `${value > 0 ? "+" : value < 0 ? "−" : ""}${formatValue(Math.abs(value), kind)}`; }

function formatValue(value: number, kind: CompanyKpiValueKind) {
  const maximumFractionDigits = kind === "count" ? (Number.isInteger(value) ? 0 : 1) : 2;
  const fixed = Math.abs(value).toFixed(maximumFractionDigits);
  const [integerPart, rawFraction = ""] = fixed.split(".");
  const fraction = rawFraction.replace(/0+$/, "");
  const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const formatted = `${value < 0 ? "-" : ""}${groupedInteger}${fraction ? `,${fraction}` : ""}`;
  if (kind === "money") return `${formatted} AZN`;
  if (kind === "percent") return `${formatted}%`;
  return formatted;
}
