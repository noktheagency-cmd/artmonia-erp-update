"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  RefreshCw,
  Target,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { cx } from "@/components/ui/cx";
import { notifyCaughtError } from "@/lib/app-notifications";
import { unwrapActionResult } from "@/lib/action-result";
import { syncMetaMarketingAction } from "@/modules/marketing/actions";
import type { MarketingDashboardData } from "@/modules/marketing/dashboard-queries";
import { MarketingViewTabs } from "@/modules/marketing/marketing-view-tabs";

export function MarketingDashboard({ data }: { data: MarketingDashboardData }) {
  const router = useRouter();
  const [syncMessage, setSyncMessage] = useState("");
  const [syncPending, startSync] = useTransition();
  const { totals } = data;

  function syncMeta() {
    setSyncMessage("");
    startSync(async () => {
      try {
        const result = unwrapActionResult(await syncMetaMarketingAction());
        setSyncMessage(`${result.insightRows} günlük nəticə yeniləndi`);
        router.refresh();
      } catch (error) {
        setSyncMessage(notifyCaughtError(error, "Meta məlumatları yenilənmədi", "Meta sync uğursuz oldu"));
      }
    });
  }

  return (
    <section className="page-stack marketing-dashboard-page">
      <header className="marketing-dashboard-header">
        <div>
          <h1>Marketing dashboard</h1>
          <p>Maliyyə xərcləri, Meta leadləri və satış nəticələri eyni axında.</p>
          <span className="marketing-dashboard-status">
            <i className={cx(data.meta.configured && "is-connected")} />
            {data.meta.configured ? "Meta bağlıdır" : "Meta bağlantısı yoxdur"}
            {data.meta.lastSyncedAt ? ` · Son sync: ${dateTime(data.meta.lastSyncedAt)}` : ""}
            {syncMessage ? ` · ${syncMessage}` : ""}
          </span>
        </div>
        <div className="marketing-dashboard-actions">
          {data.permissions.canManage && data.meta.configured ? (
            <Button type="button" variant="outline" onClick={syncMeta} disabled={syncPending}>
              <RefreshCw size={15} className={syncPending ? "is-spinning" : undefined} />
              {syncPending ? "Meta yenilənir..." : "Meta sync"}
            </Button>
          ) : null}
          <form className="marketing-dashboard-period" method="get">
            <input type="hidden" name="view" value="dashboard" />
            <DatePicker name="from" defaultValue={data.period.from} allowClear={false} aria-label="Başlanğıc tarixi" />
            <span>—</span>
            <DatePicker name="to" defaultValue={data.period.to} allowClear={false} aria-label="Son tarix" />
            <Button type="submit" variant="outline">Tətbiq et</Button>
          </form>
        </div>
      </header>

      <MarketingViewTabs active="dashboard" />

      <section className="marketing-dashboard-kpis" aria-label="Marketing əsas göstəriciləri">
        <article className="marketing-dashboard-kpi is-expense">
          <KpiHeading icon={Banknote} label="Marketing xərci" />
          <strong>{money(totals.marketingExpense)}</strong>
          <div className="marketing-expense-split">
            <span><i />Reklam <b>{money(totals.adExpense)}</b></span>
            <span><i />Agentlik və kontent <b>{money(totals.contentExpense)}</b></span>
          </div>
        </article>

        <article className="marketing-dashboard-kpi is-leads">
          <KpiHeading icon={UsersRound} label="Leadlər" />
          <div className="marketing-lead-split">
            <span><small>Ümumi lead</small><strong>{count(totals.metaLeads)}</strong><em>Meta-dan avtomatik</em></span>
            <span><small>Qualified lead</small><strong>{count(totals.qualifiedLeads)}</strong><em>Follow-up-a əlavə edilən</em></span>
          </div>
        </article>

        <article className="marketing-dashboard-kpi">
          <KpiHeading icon={Target} label="CPL" />
          <strong>{nullableMoney(totals.cpl)}</strong>
          <p>Reklam xərci / qualified lead</p>
        </article>

        <article className="marketing-dashboard-kpi">
          <KpiHeading icon={UserRoundCheck} label="CAC" />
          <strong>{nullableMoney(totals.cac)}</strong>
          <p>Ümumi marketing xərci / ilk ödəniş edən</p>
        </article>
      </section>

      <section className="marketing-dashboard-main-grid">
        <article className="marketing-dashboard-surface marketing-funnel-card">
          <header><div><h2>Konversiya axını</h2><p>Meta-dan real ödənişə qədər</p></div></header>
          <div className="marketing-funnel-flow">
            <FunnelStep index="1" icon={UsersRound} label="Meta lead" value={totals.metaLeads} rate="100%" tone="blue" />
            <ArrowRight className="marketing-funnel-arrow" size={18} />
            <FunnelStep index="2" icon={BadgeCheck} label="Follow-up" value={totals.qualifiedLeads} rate={rate(totals.qualifiedLeads, totals.metaLeads)} tone="orange" />
            <ArrowRight className="marketing-funnel-arrow" size={18} />
            <FunnelStep index="3" icon={UserRoundCheck} label="İlk ödəniş" value={totals.firstPayingStudents} rate={rate(totals.firstPayingStudents, totals.metaLeads)} tone="green" />
          </div>
        </article>

        <article className="marketing-dashboard-surface marketing-trend-card">
          <header><div><h2>Aylıq trend</h2><p>Lead və ilk ödəniş dinamikası</p></div></header>
          {data.trend.some((item) => item.metaLeads || item.qualifiedLeads || item.firstPayments) ? (
            <div className="marketing-trend-chart" aria-label="Aylıq lead trend qrafiki">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.trend} margin={{ top: 10, right: 10, bottom: 0, left: -24 }}>
                  <CartesianGrid stroke="#eceff3" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#7b8494" }} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#7b8494" }} />
                  <Tooltip contentStyle={{ border: "1px solid #e4e7ed", borderRadius: 10, fontSize: 11 }} />
                  <Line type="monotone" dataKey="metaLeads" name="Ümumi lead" stroke="#3276dc" strokeWidth={2.2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="qualifiedLeads" name="Qualified" stroke="#df772f" strokeWidth={2.2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="firstPayments" name="İlk ödəniş" stroke="#16986e" strokeWidth={2.2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : <EmptyState text="Seçilən dövr üçün trend datası yoxdur." />}
        </article>
      </section>

      <article className="marketing-dashboard-surface marketing-campaign-summary">
        <header><div><h2>Kampaniya nəticələri</h2><p>Meta lead → Follow-up → ilk ödəniş</p></div></header>
        {data.campaigns.length ? (
          <div className="marketing-dashboard-table-wrap">
            <table>
              <thead><tr><th>Kampaniya</th><th>Meta lead</th><th>Follow-up</th><th>İlk ödəniş</th><th>Lead → ödəniş</th></tr></thead>
              <tbody>{data.campaigns.map((campaign) => (
                <tr key={campaign.id}>
                  <td>{campaign.name}</td>
                  <td>{count(campaign.metaLeads)}</td>
                  <td>{count(campaign.qualifiedLeads)}</td>
                  <td>{count(campaign.firstPayments)}</td>
                  <td>{campaign.leadToPaymentRate.toFixed(1)}%</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <EmptyState text="Meta sync-dən sonra kampaniya nəticələri burada görünəcək." />}
      </article>
    </section>
  );
}

function KpiHeading({ icon: Icon, label }: { icon: typeof Banknote; label: string }) {
  return <span className="marketing-kpi-heading"><i><Icon size={16} /></i>{label}</span>;
}

function FunnelStep({ index, icon: Icon, label, value, rate: rateLabel, tone }: {
  index: string; icon: typeof UsersRound; label: string; value: number; rate: string; tone: string;
}) {
  return <div className={`marketing-funnel-step is-${tone}`}>
    <span><i>{index}</i><Icon size={16} />{label}</span>
    <strong>{count(value)}</strong>
    <small>{rateLabel}</small>
  </div>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="marketing-dashboard-empty">{text}</div>;
}

function rate(value: number, total: number) {
  return total > 0 ? `${(value * 100 / total).toFixed(1)}%` : "—";
}

function count(value: number) {
  return formatNumber(value, 0);
}

function money(value: number) {
  const decimals = Number.isInteger(value) ? 0 : 2;
  return `${formatNumber(value, decimals)} AZN`;
}

function nullableMoney(value: number | null) {
  return value === null ? "—" : money(value);
}

function dateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const baku = new Date(date.getTime() + 4 * 60 * 60 * 1000);
  return `${pad(baku.getUTCDate())}.${pad(baku.getUTCMonth() + 1)}.${baku.getUTCFullYear()} ${pad(baku.getUTCHours())}:${pad(baku.getUTCMinutes())}`;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function formatNumber(value: number, decimals: number) {
  const [whole, fraction] = value.toFixed(decimals).split(".");
  const grouped = whole!.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return fraction ? `${grouped},${fraction}` : grouped;
}
