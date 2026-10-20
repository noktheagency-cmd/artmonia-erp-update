"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock3,
  LockKeyhole,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import { cx } from "@/components/ui/cx";
import type { InstagramDmAnalyticsData } from "@/modules/instagram-dm/analytics-queries";
import { MarketingViewTabs } from "@/modules/marketing/marketing-view-tabs";

export function InstagramDmAnalytics({ data }: { data: InstagramDmAnalyticsData }) {
  const router = useRouter();
  const [refreshPending, startRefresh] = useTransition();
  const ai = data.ai.state === "ready" ? data.ai : null;
  const aiUnavailableReason = data.ai.state === "ready" ? "" : data.ai.reason;
  const analysisRunning = data.snapshot?.status === "RUNNING";
  useEffect(() => {
    if (!analysisRunning || refreshPending) return;
    const timer = window.setTimeout(() => startRefresh(() => router.refresh()), 15_000);
    return () => window.clearTimeout(timer);
  }, [analysisRunning, refreshPending, router, data.generatedAt]);

  return (
    <section className="page-stack instagram-dm-page">
      <header className="instagram-dm-header">
        <div>
          <h1>DM Intelligence</h1>
          <span className="instagram-dm-connection">
            <i className={cx(data.account.connected && "is-connected")} />
            {data.account.connected ? "Instagram bağlıdır" : "Instagram bağlantısı yoxdur"}
            <b>· {displayDate(data.period.from)}–{displayDate(data.period.to)}</b>
          </span>
        </div>
        <div className="instagram-dm-header-actions">
          <span className="instagram-dm-privacy"><LockKeyhole size={14} /> Mesaj mətnləri göstərilmir</span>
          <button
            type="button"
            className="instagram-dm-refresh"
            aria-label="DM analizini yenilə"
            title="Göstəriciləri yenilə; tamamlanmış gündəlik AI analizi təkrar hesablanmır"
            disabled={refreshPending}
            onClick={() => startRefresh(() => router.refresh())}
          >
            <RefreshCw size={16} className={refreshPending ? "is-spinning" : undefined} />
          </button>
        </div>
      </header>

      <MarketingViewTabs active="dm" />

      <section className="instagram-dm-metrics" aria-label="DM əsas göstəriciləri">
        <Metric icon={MessageCircle} label="Aktiv dialoqlar" value={count(data.summary.conversations)} helper={`${count(data.summary.inboundConversations)} müştəri yazan · ${count(data.summary.outboundOnlyConversations)} yalnız komanda`} tone="blue" />
        <Metric icon={TrendingUp} label="Cavab faizi" value={percent(data.summary.responseRate)} helper={`${count(data.summary.answeredConversations)} cavablanan`} tone="green" />
        <Metric icon={Clock3} label="Median ilk cavab" value={durationLabel(data.summary.medianFirstResponseMinutes)} helper="İlk inbound → ilk outbound" tone="blue" />
        <Metric icon={BarChart3} label="Pik saat" value={peakHour(data.summary.peakInboundHour)} helper="Bakı vaxtı ilə" tone="orange" />
        <Metric
          icon={AlertTriangle}
          label="Yüksək niyyətli, cavabsız"
          value={ai ? count(ai.highIntentUnanswered) : "—"}
          helper={ai ? "AI tərəfindən aşkarlanıb" : "AI nəticəsi gözlənilir"}
          tone="warning"
        />
      </section>

      <p className="instagram-dm-scope-note">
        {count(data.summary.messages)} mesaj · Aktiv dialoq: seçilmiş dövrdə ən azı bir mesajı olan unikal söhbət; yeni lead sayı deyil.
        Cavab faizi yalnız müştərinin yazdığı {count(data.summary.inboundConversations)} dialoq üzrədir.
        Səs və şəkil məzmunu AI tərəfindən oxunmur; nəticələr bazaya toplanmış mətnlərlə məhdudlaşır.
      </p>
      <p className="instagram-dm-scope-note">
        Hər tarix aralığı üçün Bakı vaxtı ilə gündə ilk girişdə bir analiz saxlanır. Sonrakı girişlər həmin nəticəni göstərir.
        {data.snapshot ? ` Model: ${data.snapshot.model}. Məlumat kəsiyi: ${dateTime(data.snapshot.dataCutoffAt)}.` : ""}
        {data.snapshot?.status === "FAILED" ? " Uğursuz cəhdə 15 dəqiqə sonra yenidən cəhd edilə bilər." : ""}
      </p>

      {ai ? (
        <>
          <section className="instagram-ai-section">
            <header><Sparkles size={16} /><div><h2>AI ilə müştəri davranışı</h2><p>{count(ai.analyzedConversations)} mətnli dialoq analiz edilib · {count(ai.customerConversations)} müştəri dialoqu · {count(ai.excludedConversations)} HR/tədbir/əlaqəsiz dialoq çıxarılıb</p></div></header>
            <div className="instagram-ai-behavior-grid">
              <InsightCard title="Xidmət marağı" icon={Target} tone="blue" items={ai.serviceInterest} />
              <IntentCard hot={ai.purchaseIntent.hot} warm={ai.purchaseIntent.warm} cold={ai.purchaseIntent.cold} />
              <InsightCard title="Maneələr" icon={ShieldCheck} tone="orange" items={ai.barriers} />
              <InsightCard title="Nəticə və növbəti addım" icon={TrendingUp} tone="violet" items={ai.outcomes} />
            </div>
          </section>

          <section className="instagram-team-grid">
            <article className="instagram-team-scores">
              <header><div><h2>Ümumi komanda danışıq analizi</h2><p>Fərdi menecer adı göstərilmir</p></div><UsersRound size={19} /></header>
              <div>
                <Score label="Ton və peşəkarlıq" value={ai.teamScores.professionalism} />
                <Score label="Ehtiyacın aşkarlanması" value={ai.teamScores.needDiscovery} />
                <Score label="Cavab keyfiyyəti" value={ai.teamScores.answerQuality} />
                <Score label="Etirazların idarəsi" value={ai.teamScores.objectionHandling} />
                <Score label="Qeydiyyata yönləndirmə" value={ai.teamScores.registrationDirection} />
              </div>
            </article>

            <article className="instagram-incomplete-card">
              <span><AlertTriangle size={17} /></span>
              <small>Yarımçıq dialoqlar</small>
              <strong>{count(ai.incompleteDialogs)}</strong>
              <p>Son müştəri mesajı cavab və ya əməliyyat tələb edir.</p>
            </article>

            <article className="instagram-ai-advice">
              <header><Sparkles size={17} /><div><h2>AI insaytı və tövsiyələr</h2><p>{ai.summary}</p></div></header>
              <ul>{ai.recommendations.map((recommendation, index) => <li key={`${index}-${recommendation}`}><CheckCircle2 size={14} />{recommendation}</li>)}</ul>
            </article>
          </section>
        </>
      ) : (
        <section className="instagram-ai-unavailable">
          <Sparkles size={24} />
          <div role="status"><h2>{analysisRunning ? "AI analizi hazırlanır" : "AI analizi hazır deyil"}</h2><p>{aiUnavailableReason}</p></div>
        </section>
      )}

      {data.history.length > 0 ? (
        <section className="instagram-dm-history" aria-label="Gündəlik analiz tarixçəsi">
          <h2>Gündəlik analiz tarixçəsi</h2>
          <p>{displayDate(data.period.from)}–{displayDate(data.period.to)} dövrünün gündəlik vəziyyəti. Aylıq nəticə üçün sətirlər toplanmır: eyni dialoq müxtəlif günlərdə görünə bilər. Son 31 qeyd göstərilir.</p>
          <div className="instagram-dm-history-scroll">
            <table>
              <thead><tr><th>Analiz günü</th><th>Vəziyyət</th><th>Analiz edilən</th><th>Müştəri sorğusu</th><th>Yüksək niyyətli, cavabsız</th></tr></thead>
              <tbody>{data.history.map((entry) => <tr key={entry.day}>
                <td>{displayDate(entry.day)}</td>
                <td>{({ READY: "Hazır", RUNNING: "Hazırlanır", FAILED: "Xəta", NO_DATA: "Mətnli dialoq yoxdur" })[entry.state] ?? entry.state}</td>
                <td>{entry.analyzedConversations === null ? "—" : count(entry.analyzedConversations)}</td>
                <td>{entry.customerConversations === null ? "—" : count(entry.customerConversations)}</td>
                <td>{entry.highIntentUnanswered === null ? "—" : count(entry.highIntentUnanswered)}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </section>
      ) : null}

      <footer className="instagram-dm-page-foot">
        <span>Son webhook: {data.account.lastWebhookAt ? dateTime(data.account.lastWebhookAt) : "—"}</span>
        <span>Göstəricilər yeniləndi: {dateTime(data.generatedAt)}</span>
        <span>AI analiz edildi: {data.ai.generatedAt ? dateTime(data.ai.generatedAt) : "—"}</span>
      </footer>
    </section>
  );
}

function Metric({ icon: Icon, label, value, helper, tone }: {
  icon: typeof MessageCircle; label: string; value: string; helper: string; tone: string;
}) {
  return <article className={`instagram-dm-metric is-${tone}`}>
    <div><span>{label}</span><strong>{value}</strong><small>{helper}</small></div>
    <i><Icon size={19} /></i>
  </article>;
}

function InsightCard({ title, icon: Icon, tone, items }: {
  title: string; icon: typeof Target; tone: string; items: Array<{ label: string; percentage: number }>;
}) {
  return <article className={`instagram-insight-card is-${tone}`}>
    <header><Icon size={16} /><h3>{title}</h3></header>
    <dl>{items.length ? items.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{percent(item.percentage)}</dd></div>) : <div><dt>Açıq sübut aşkarlanmayıb</dt><dd>—</dd></div>}</dl>
  </article>;
}

function IntentCard({ hot, warm, cold }: { hot: number; warm: number; cold: number }) {
  return <article className="instagram-insight-card is-green">
    <header><TrendingUp size={16} /><h3>Alış niyyəti</h3></header>
    <dl>
      <div><dt>Yüksək niyyətli</dt><dd>{percent(hot)}</dd></div>
      <div><dt>Orta niyyətli</dt><dd>{percent(warm)}</dd></div>
      <div><dt>Aşağı niyyətli</dt><dd>{percent(cold)}</dd></div>
    </dl>
  </article>;
}

function Score({ label, value }: { label: string; value: number }) {
  const safeValue = Math.max(0, Math.min(100, value));
  return <div className="instagram-score-row">
    <span>{label}</span>
    <i><b style={{ width: `${safeValue}%` }} /></i>
    <strong title={safeValue === 0 ? "Bu meyar üçün qiymətləndirilə bilən cavab yoxdur" : undefined}>{safeValue === 0 ? "—" : `${Math.round(safeValue)}/100`}</strong>
  </div>;
}

function count(value: number) {
  return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}
function percent(value: number) {
  const rounded = Math.round(value * 10) / 10;
  return `${String(rounded).replace(".", ",")}%`;
}
function durationLabel(minutes: number | null) {
  if (minutes === null) return "—";
  const rounded = Math.max(0, Math.round(minutes));
  if (rounded < 60) return `${rounded} dəq`;
  const hours = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return remainder ? `${hours} saat ${remainder} dəq` : `${hours} saat`;
}
function peakHour(hour: number | null) {
  return hour === null ? "—" : `${String(hour).padStart(2, "0")}:00–${String((hour + 1) % 24).padStart(2, "0")}:00`;
}
function dateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const baku = new Date(date.getTime() + 4 * 60 * 60 * 1000);
  return `${pad(baku.getUTCDate())}.${pad(baku.getUTCMonth() + 1)}.${baku.getUTCFullYear()} ${pad(baku.getUTCHours())}:${pad(baku.getUTCMinutes())}`;
}
function displayDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}.${month}.${year}` : value;
}
function pad(value: number) {
  return String(value).padStart(2, "0");
}
