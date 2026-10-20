"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type { FormEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  Edit3,
  ExternalLink,
  FileText,
  Images,
  Megaphone,
  MessageCircle,
  MousePointerClick,
  Plus,
  RefreshCw,
  Trash2,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FormSelect } from "@/components/ui/select";
import { notifyCaughtError } from "@/lib/app-notifications";
import { unwrapActionResult } from "@/lib/action-result";
import {
  createMarketingCampaignAction,
  createMarketingReportAction,
  deleteMarketingCampaignAction,
  saveMarketingStatAction,
  syncMetaMarketingAction,
  updateMarketingCampaignAction,
} from "@/modules/marketing/actions";
import type { MarketingAdRow, MarketingCampaignRow, MarketingData } from "@/modules/marketing/queries";
import { MarketingViewTabs } from "@/modules/marketing/marketing-view-tabs";

const statuses = [
  { value: "DRAFT", label: "Qaralama" },
  { value: "ACTIVE", label: "Aktiv" },
  { value: "PAUSED", label: "Passiv" },
  { value: "COMPLETED", label: "Tamamlanıb" },
];
const channels = ["Instagram", "Facebook", "TikTok", "Google", "WhatsApp", "Digər"];
const statusLabels: Record<string, string> = { DRAFT: "Qaralama", ACTIVE: "Aktiv", PAUSED: "Passiv", COMPLETED: "Tamamlanıb" };

export function MarketingWorkspace({ data }: { data: MarketingData }) {
  const router = useRouter();
  const [status, setStatus] = useState("all");
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [syncMessage, setSyncMessage] = useState("");
  const [syncPending, startSyncTransition] = useTransition();
  const campaigns = useMemo(
    () => data.campaigns.filter((campaign) =>
      status === "all" || campaign.status === status)
      .toSorted((left, right) => right.stats.spend - left.stats.spend
        || right.stats.conversations - left.stats.conversations
        || deterministicTextCompare(left.name, right.name)),
    [data.campaigns, status],
  );
  const selectedCampaign = campaigns.find((campaign) => campaign.id === selectedCampaignId) ?? campaigns[0] ?? null;
  const metaCurrency = campaigns.find((campaign) => campaign.metaCampaignId && campaign.stats.spend > 0)?.stats.currency ?? "AZN";
  const totals = useMemo(() => campaigns.reduce((result, campaign) => {
    result.spend += campaign.stats.spend;
    result.conversations += campaign.stats.conversations;
    result.impressions += campaign.stats.impressions;
    result.leads += campaign.leadCount;
    result.sales += campaign.saleCount;
    result.revenue += campaign.revenue;
    return result;
  }, { spend: 0, conversations: 0, impressions: 0, leads: 0, sales: 0, revenue: 0, currency: metaCurrency }), [campaigns, metaCurrency]);
  const costPerConversation = totals.conversations > 0 ? totals.spend / totals.conversations : 0;

  function syncMeta() {
    setSyncMessage("");
    startSyncTransition(async () => {
      try {
        const result = unwrapActionResult(await syncMetaMarketingAction());
        setSyncMessage(`${result.campaigns} kampaniya · ${result.ads} reklam · ${result.adInsightRows} günlük reklam nəticəsi yeniləndi`);
        router.refresh();
      } catch (error) {
        setSyncMessage(notifyCaughtError(error, "Meta məlumatları sinxronlaşdırılmadı", "Meta sync uğursuz oldu"));
      }
    });
  }

  return <section className="page-stack marketing-redesign">
    <header className="marketing-topbar">
      <div className="marketing-title-block">
        <span className="marketing-title-icon"><Megaphone size={20} /></span>
        <div>
          <h1>Marketing performansı</h1>
          <div className="marketing-sync-state">
            <span className={cx("marketing-provider-dot", data.meta.configured && "is-connected")} />
            {data.meta.configured ? "Meta bağlıdır" : "Meta konfiqurasiyası yoxdur"}
            {data.meta.lastSyncedAt ? ` · Son sync: ${dateTime(data.meta.lastSyncedAt)}` : ""}
            {syncMessage ? ` · ${syncMessage}` : ""}
          </div>
        </div>
      </div>
      <div className="marketing-topbar-actions">
        {data.permissions.canManage && data.meta.configured
          ? <Button type="button" variant="outline" onClick={syncMeta} disabled={syncPending}>
              <RefreshCw size={16} className={syncPending ? "is-spinning" : undefined} />
              {syncPending ? "Meta yenilənir..." : `Meta sync · ${data.meta.defaultMonths} ay`}
            </Button>
          : null}
        {data.permissions.canManage ? <CampaignDialog title="Kampaniya yarat" action={createMarketingCampaignAction} /> : null}
      </div>
    </header>

    <MarketingViewTabs active="results" />

    <div className="marketing-overview-grid" aria-label="Marketing əsas göstəriciləri">
      <Metric icon={MessageCircle} label="Meta conversation" value={count(totals.conversations)} helper={`${count(totals.impressions)} impression`} tone="violet" />
      <Metric icon={WalletCards} label="Meta xərci" value={money(totals.spend, totals.currency)} helper="Reklam hesabından" tone="blue" />
      <Metric icon={MousePointerClick} label="Conversation qiyməti" value={money(costPerConversation, totals.currency)} helper="Xərc / conversation" tone="amber" />
      <Metric icon={UsersRound} label="ERP lead" value={count(totals.leads)} helper="CRM-də qeydə alınan" tone="violet" />
      <Metric icon={Activity} label="Satış" value={count(totals.sales)} helper="Qeydiyyata çevrilən" tone="amber" />
      <Metric icon={WalletCards} label="Real gəlir" value={money(totals.revenue, "AZN")} helper="Satışa bağlı ödənişlər (course_sales)" tone="green" />
    </div>

    <section className="marketing-workspace-grid" aria-label="Kampaniya iş sahəsi">
      <aside className="marketing-campaign-rail">
        <header className="marketing-rail-head">
          <div><h2>Kampaniyalar</h2><span>{campaigns.length} nəticə</span></div>
          <FormSelect name="status" value={status} onValueChange={setStatus} options={[{ value: "all", label: "Bütün statuslar" }, ...statuses]} aria-label="Status üzrə filtr" />
        </header>
        <div className="marketing-campaign-list">
          {campaigns.length ? campaigns.map((campaign) => <button
            key={campaign.id}
            type="button"
            className={cx("marketing-campaign-item", selectedCampaign?.id === campaign.id && "is-selected")}
            aria-pressed={selectedCampaign?.id === campaign.id}
            onClick={() => setSelectedCampaignId(campaign.id)}
          >
            <span className="marketing-campaign-item-head">
              <strong>{campaign.name}</strong>
              <span className={cx("marketing-status", `is-${campaign.status.toLowerCase()}`)}><i />{statusLabels[campaign.status]}</span>
            </span>
            <small>{campaign.objective || campaign.owner || campaign.channel}</small>
            <span className="marketing-campaign-item-metrics">
              <span><small>Conversation</small><strong>{count(campaign.stats.conversations)}</strong></span>
              <span><small>Cost / conv.</small><strong>{money(campaign.stats.costPerConversation, campaign.stats.currency)}</strong></span>
              <span><small>Meta xərci</small><strong>{money(campaign.stats.spend, campaign.stats.currency)}</strong></span>
            </span>
            <span className="marketing-campaign-item-foot">
              <span>{campaign.metaCampaignId ? `Meta · ${campaign.metaCampaignId}` : campaign.channel}</span>
              <strong><Images size={12} /> {campaign.adCount} reklam</strong>
            </span>
          </button>) : <div className="marketing-rail-empty">Filtrə uyğun kampaniya yoxdur.</div>}
        </div>
        <footer>{data.campaigns.length} ümumi kampaniya</footer>
      </aside>

      {selectedCampaign
        ? <CampaignDetail key={`${selectedCampaign.id}:${data.period.from}:${data.period.to}`} campaign={selectedCampaign} period={data.period} canManage={data.permissions.canManage} />
        : <div className="marketing-detail-empty"><Megaphone size={24} /><strong>Kampaniya seçilməyib</strong><span>Nəticələri görmək üçün filtrinizi dəyişin.</span></div>}
    </section>
  </section>;
}

function CampaignDetail({ campaign, period, canManage }: { campaign: MarketingCampaignRow; period: MarketingData["period"]; canManage: boolean }) {
  const [ads, setAds] = useState<MarketingAdRow[] | null>(() => campaign.metaCampaignId ? null : []);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(Boolean(campaign.metaCampaignId));

  useEffect(() => {
    if (!campaign.metaCampaignId) return;
    const controller = new AbortController();
    async function loadAds() {
      try {
        const params = new URLSearchParams({ from: period.from, to: period.to });
        const response = await fetch(`/api/marketing/campaigns/${campaign.id}/ads?${params.toString()}`, {
          headers: { Accept: "application/json" },
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json() as { ads?: MarketingAdRow[]; error?: string };
        if (!response.ok || !payload.ads) throw new Error(payload.error || "Reklam məlumatları yüklənmədi.");
        setAds(payload.ads);
      } catch (caught) {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Reklam məlumatları yüklənmədi.");
      } finally {
        if (!controller.signal.aborted) setPending(false);
      }
    }
    void loadAds();
    return () => controller.abort();
  }, [campaign.id, campaign.metaCampaignId, period.from, period.to]);

  return <article className="marketing-campaign-detail">
    <header className="marketing-detail-head">
      <div className="marketing-detail-title">
        <div className="marketing-detail-title-line"><h2>{campaign.name}</h2><span className={cx("marketing-status", `is-${campaign.status.toLowerCase()}`)}><i />{statusLabels[campaign.status]}</span></div>
        <p>{campaign.objective || campaign.owner || campaign.channel}</p>
        <span>{displayDate(period.from)} – {displayDate(period.to)} · {campaign.adCount} reklam{campaign.metaCampaignId ? ` · Meta ID ${campaign.metaCampaignId}` : ""}</span>
      </div>
      {canManage ? <div className="marketing-row-actions">
        {!campaign.metaCampaignId ? <SpendDialog campaign={campaign} /> : null}
        <ReportDialog campaign={campaign} />
        {!campaign.metaCampaignId ? <CampaignDialog title="Düzəliş et" campaign={campaign} action={updateMarketingCampaignAction} trigger={<Button variant="ghost" size="icon" aria-label="Kampaniyanı düzəliş et"><Edit3 size={15} /></Button>} /> : null}
        {!campaign.metaCampaignId ? <DeleteButton campaign={campaign} /> : null}
      </div> : null}
    </header>
    <div className="marketing-detail-metrics">
      <DetailMetric label="Conversation" value={count(campaign.stats.conversations)} helper={`${count(campaign.stats.impressions)} impression`} />
      <DetailMetric label="Cost / conv." value={money(campaign.stats.costPerConversation, campaign.stats.currency)} helper="Xərc / conversation" />
      <DetailMetric label="Meta xərci" value={money(campaign.stats.spend, campaign.stats.currency)} helper={`${count(campaign.stats.clicks)} klik`} />
      <DetailMetric label="ERP nəticəsi" value={`${count(campaign.leadCount)} lead · ${count(campaign.saleCount)} satış`} helper={`${money(campaign.revenue, "AZN")} real gəlir`} />
    </div>
    <CampaignAdsPanel ads={ads} error={error} pending={pending} period={period} />
  </article>;
}

function CampaignAdsPanel({ ads, error, pending, period }: { ads: MarketingAdRow[] | null; error: string; pending: boolean; period: MarketingData["period"] }) {
  return <section className="marketing-ad-panel" aria-label="Kampaniyanın reklam və kreativləri">
    <header className="marketing-ad-panel-head">
      <div><h3>Reklamlar və kreativlər</h3><p>{displayDate(period.from)} – {displayDate(period.to)} tarixləri üzrə nəticələr</p></div>
      {ads ? <span>{ads.length} reklam</span> : null}
    </header>
    {pending ? <div className="marketing-ad-state"><RefreshCw size={18} className="is-spinning" /> Reklamlar yüklənir...</div> : null}
    {error ? <div className="marketing-ad-state is-error">{error}</div> : null}
    {!pending && !error && ads?.length === 0 ? <div className="marketing-ad-state">Bu kampaniyada reklam tapılmadı.</div> : null}
    {ads?.length ? <div className="marketing-ad-table">
      <div className="marketing-ad-table-head"><span>Reklam / kreativ</span><span>Conversation</span><span>Cost / conv.</span><span>Xərc</span><span>Post</span></div>
      <div className="marketing-ad-list">{ads.map((ad) => <article key={ad.id} className="marketing-ad-row">
        {ad.thumbnailUrl
          ? <span className="marketing-ad-thumbnail" style={{ backgroundImage: `url("${ad.thumbnailUrl.replaceAll('"', "%22")}")` }} role="img" aria-label={`${ad.name} reklam önizləməsi`} />
          : <span className="marketing-ad-thumbnail is-empty"><Images size={22} /></span>}
        <div className="marketing-ad-content">
          <div className="marketing-ad-title-line">
            <div><strong>{ad.name}</strong><span>{ad.adSetName}</span></div>
            <span className={cx("marketing-ad-status", isMetaActive(ad.status) && "is-active")}>{metaLabel(ad.status)}</span>
          </div>
          <div className="marketing-ad-tags">
            {ad.creativeTitle ? <span>{ad.creativeTitle}</span> : null}
            {ad.callToActionType ? <span>{metaLabel(ad.callToActionType)}</span> : null}
            {ad.optimizationGoal ? <span>{metaLabel(ad.optimizationGoal)}</span> : null}
          </div>
          {ad.creativeBody ? <p className="marketing-ad-copy">{ad.creativeBody}</p> : <p className="marketing-ad-copy is-muted">Kreativ mətni yoxdur.</p>}
          <small className="marketing-ad-id">Ad ID: {ad.metaAdId}</small>
        </div>
        <span className="marketing-ad-number" data-label="Conversation"><strong>{count(ad.stats.conversations)}</strong><small>{count(ad.stats.impressions)} impression</small></span>
        <span className="marketing-ad-number" data-label="Cost / conv."><strong>{money(ad.stats.costPerConversation, ad.stats.currency)}</strong></span>
        <span className="marketing-ad-number" data-label="Xərc"><strong>{money(ad.stats.spend, ad.stats.currency)}</strong></span>
        <span className="marketing-ad-link">{ad.instagramPermalinkUrl
          ? <a href={ad.instagramPermalinkUrl} target="_blank" rel="noopener noreferrer" aria-label={`${ad.name} Instagram postunu aç`}><ExternalLink size={15} /> Instagram</a>
          : <small>Link yoxdur</small>}</span>
      </article>)}</div>
    </div> : null}
  </section>;
}

function DetailMetric({ label, value, helper }: { label: string; value: string; helper: string }) {
  return <span><small>{label}</small><strong>{value}</strong><p>{helper}</p></span>;
}

function Metric({ icon: Icon, label, value, helper, tone }: { icon: typeof Activity; label: string; value: string; helper: string; tone: string }) {
  return <article className={cx("marketing-metric-card", `is-${tone}`)}><span className="marketing-metric-icon"><Icon size={18} /></span><div><small>{label}</small><strong>{value}</strong><p>{helper}</p></div></article>;
}

function CampaignDialog({ title, campaign, action, trigger }: { title: string; campaign?: MarketingCampaignRow; action: (formData: FormData) => Promise<unknown>; trigger?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const today = dateInput(new Date());
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setError("");
    startTransition(async () => {
      try { unwrapActionResult(await action(new FormData(form))); setOpen(false); }
      catch (caught) { setError(notifyCaughtError(caught, "Kampaniya yadda saxlanmadı", "Kampaniya saxlanmadı")); }
    });
  }
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild>{trigger ?? <Button><Plus size={16} />{title}</Button>}</DialogTrigger>
    <DialogContent className="marketing-modal">
      <DialogHeader><DialogTitle>{campaign ? "Kampaniyanı düzəliş et" : "Yeni kampaniya"}</DialogTitle><DialogDescription>Kampaniyanın əsas məlumatlarını və qeydlərini daxil edin.</DialogDescription></DialogHeader>
      <form className="marketing-form-v2" onSubmit={submit}>
        {campaign ? <input name="id" type="hidden" value={campaign.id} /> : null}
        <div className="marketing-form-grid">
          <Field label="Kampaniya adı"><Input name="name" defaultValue={campaign?.name} required maxLength={120} /></Field>
          <Field label="Kanal"><FormSelect name="channel" defaultValue={campaign?.channel ?? channels[0]} options={channels.map((value) => ({ value, label: value }))} searchable searchPlaceholder="Kanal axtar..." catalogKey="MARKETING_CHANNEL" createLabel="Yeni kanal əlavə et" /></Field>
          <Field label="Status"><FormSelect name="status" defaultValue={campaign?.status ?? "DRAFT"} options={statuses} /></Field>
          <Field label="Başlanğıc tarixi"><DatePicker name="startsAt" defaultValue={campaign?.startsAt ?? today} allowClear={false} /></Field>
          <Field label="Bitmə tarixi"><DatePicker name="endsAt" defaultValue={campaign?.endsAt || undefined} /></Field>
          <Field label="Məsul şəxs"><Input name="owner" defaultValue={campaign?.owner} maxLength={80} /></Field>
          <Field label="Hədəf"><Input name="objective" defaultValue={campaign?.objective} maxLength={240} /></Field>
        </div>
        <Field label="Qeyd"><textarea name="notes" defaultValue={campaign?.notes} maxLength={1000} rows={3} /></Field>
        {error ? <p className="marketing-form-error">{error}</p> : null}
        <DialogFooter><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Ləğv et</Button><Button type="submit" disabled={pending}>{pending ? "Yadda saxlanır..." : campaign ? "Dəyişiklikləri saxla" : "Kampaniya yarat"}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}

function SpendDialog({ campaign }: { campaign: MarketingCampaignRow }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setError("");
    startTransition(async () => {
      try { unwrapActionResult(await saveMarketingStatAction(new FormData(form))); setOpen(false); }
      catch (caught) { setError(notifyCaughtError(caught, "Xərc yadda saxlanmadı", "Xərc saxlanmadı")); }
    });
  }
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button variant="ghost" size="icon" aria-label="Xərc əlavə et"><Plus size={16} /></Button></DialogTrigger>
    <DialogContent className="marketing-modal"><DialogHeader><DialogTitle>Kampaniya xərci</DialogTitle><DialogDescription>Manual kampaniya üçün gündəlik xərc qeyd edin.</DialogDescription></DialogHeader>
      <form className="marketing-form-v2" onSubmit={submit}><input type="hidden" name="campaignId" value={campaign.id} /><div className="marketing-form-grid"><Field label="Tarix"><DatePicker name="recordedOn" defaultValue={dateInput(new Date())} allowClear={false} /></Field><Field label="Xərc (₼)"><Input name="spend" type="number" min="0" step="0.01" defaultValue="0" required /></Field></div>{error ? <p className="marketing-form-error">{error}</p> : null}<DialogFooter><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Ləğv et</Button><Button type="submit" disabled={pending}>Saxla</Button></DialogFooter></form>
    </DialogContent>
  </Dialog>;
}

function ReportDialog({ campaign }: { campaign: MarketingCampaignRow }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setError("");
    startTransition(async () => {
      try { unwrapActionResult(await createMarketingReportAction(new FormData(form))); setOpen(false); }
      catch (caught) { setError(notifyCaughtError(caught, "Hesabat yaradılmadı", "Hesabat yaradılmadı")); }
    });
  }
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button variant="ghost" size="icon" aria-label="Hesabat yarat"><FileText size={16} /></Button></DialogTrigger>
    <DialogContent className="marketing-modal"><DialogHeader><DialogTitle>Kampaniya hesabatı</DialogTitle><DialogDescription>Nəticəni qiymətləndirin və kampaniya qərarını qeyd edin.</DialogDescription></DialogHeader>
      <form className="marketing-form-v2" onSubmit={submit}><input type="hidden" name="campaignId" value={campaign.id} /><div className="marketing-report-summary"><strong>{campaign.name}</strong><span>{campaign.stats.conversations} conversation · {campaign.leadCount} lead · {campaign.saleCount} satış · {money(campaign.revenue, "AZN")} gəlir</span><p>{campaign.notes || "Kampaniya qeydi yoxdur."}</p></div><div className="marketing-form-grid"><Field label="Strategiya statusu"><FormSelect name="outcome" defaultValue="SUCCESSFUL" options={[{ value: "SUCCESSFUL", label: "Uğurlu" }, { value: "UNSUCCESSFUL", label: "Uğursuz" }]} /></Field><Field label="Qərar"><FormSelect name="decision" defaultValue="continue" options={[{ value: "continue", label: "Davam etdir (aktiv)" }, { value: "pause", label: "Dayandır (passiv)" }]} /></Field></div><Field label="Hesabat qeydi"><textarea name="notes" rows={4} maxLength={1500} placeholder="Nəticə, müşahidələr və növbəti addımlar..." /></Field>{error ? <p className="marketing-form-error">{error}</p> : null}<DialogFooter><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Ləğv et</Button><Button type="submit" disabled={pending}>{pending ? "Yaradılır..." : "Hesabat yarat"}</Button></DialogFooter></form>
    </DialogContent>
  </Dialog>;
}

function DeleteButton({ campaign }: { campaign: MarketingCampaignRow }) {
  const [pending, startTransition] = useTransition();
  function remove() {
    if (!window.confirm(`“${campaign.name}” kampaniyası silinsin?`)) return;
    const formData = new FormData();
    formData.set("id", campaign.id);
    startTransition(async () => {
      try { unwrapActionResult(await deleteMarketingCampaignAction(formData)); }
      catch (error) { notifyCaughtError(error, "Kampaniya silinmədi", "Kampaniya silinmədi"); }
    });
  }
  return <Button type="button" variant="ghost" size="icon" className="marketing-delete-button" onClick={remove} disabled={pending} aria-label="Kampaniyanı sil"><Trash2 size={15} /></Button>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="marketing-field"><span>{label}</span>{children}</label>;
}

function money(value: number, currency: string) {
  const symbols: Record<string, string> = { USD: "$", AZN: "₼", EUR: "€", GBP: "£" };
  const formatted = number(value, 2);
  return symbols[currency] ? `${symbols[currency]}${formatted}` : `${formatted} ${currency}`;
}

function count(value: number) {
  return number(value, 0);
}

function deterministicTextCompare(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function number(value: number, decimals: number) {
  const safeValue = Number.isFinite(value) ? value : 0;
  const [integer, fraction] = safeValue.toFixed(decimals).split(".");
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}

function dateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const bakuTime = new Date(date.getTime() + 4 * 60 * 60 * 1000);
  const day = String(bakuTime.getUTCDate()).padStart(2, "0");
  const month = String(bakuTime.getUTCMonth() + 1).padStart(2, "0");
  const year = bakuTime.getUTCFullYear();
  const hours = String(bakuTime.getUTCHours()).padStart(2, "0");
  const minutes = String(bakuTime.getUTCMinutes()).padStart(2, "0");
  return `${day}.${month}.${year} ${hours}:${minutes}`;
}

function displayDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}.${month}.${year}` : value;
}

function isMetaActive(status: string) {
  return status === "ACTIVE";
}

function metaLabel(value: string) {
  const known: Record<string, string> = {
    ACTIVE: "Aktiv",
    PAUSED: "Passiv",
    CAMPAIGN_PAUSED: "Kampaniya passiv",
    ADSET_PAUSED: "Ad set passiv",
    ARCHIVED: "Arxiv",
    DELETED: "Silinib",
    INSTAGRAM_MESSAGE: "Instagram mesaj",
    VIEW_INSTAGRAM_PROFILE: "Instagram profil",
    LEAD_GENERATION: "Lead toplama",
  };
  if (known[value]) return known[value];
  const label = value.replaceAll("_", " ").toLocaleLowerCase("az");
  return label ? `${label.charAt(0).toLocaleUpperCase("az")}${label.slice(1)}` : "—";
}

function dateInput(value: Date) {
  return value.toISOString().slice(0, 10);
}
