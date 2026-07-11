"use client";

import dynamic from "next/dynamic";
import { useMemo, useState, useTransition, type CSSProperties, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  Banknote,
  CalendarDays,
  CircleDollarSign,
  Flag,
  Paintbrush,
  PartyPopper,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Star,
  Target,
  UsersRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { FormSelect } from "@/components/ui/select";
import type { HrBonusCampaignDto, HrBonusData, HrBonusStageDto } from "@/modules/hr/bonus-data";
import { notifyCaughtError } from "@/lib/app-notifications";
import "./bonus.css";

const VanGoghBonusIllustration = dynamic(
  () => import("@/modules/hr/van-gogh-bonus-illustration").then((module) => module.VanGoghBonusIllustration),
  { ssr: false, loading: () => <div className="hr-bonus-scene-loading"><Paintbrush /><span>Emalatxana hazırlanır…</span></div> },
);

type BonusAction = (formData: FormData) => Promise<unknown>;
type StageDraft = { threshold: number; bonusPool: number };

const metricOptions = [
  { value: "DEPARTMENT_COLLECTED_REVENUE", label: "Toplanmış gəlir" },
  { value: "DEPARTMENT_SALES_COUNT", label: "Satış sayı" },
  { value: "MANUAL_KPI", label: "Manual KPI" },
] as const;

const distributionOptions = [
  { value: "EQUAL", label: "Bərabər böl" },
  { value: "HR_APPROVAL", label: "HR təsdiqli bölgü" },
] as const;

const statusMeta = {
  SCHEDULED: { label: "Planlaşdırılıb", variant: "secondary" as const },
  ACTIVE: { label: "Aktiv", variant: "default" as const },
  ACHIEVED: { label: "Hədəf tamamlandı", variant: "default" as const },
  EXPIRED: { label: "Dövr bitib", variant: "outline" as const },
  CANCELLED: { label: "Ləğv edilib", variant: "destructive" as const },
};

export function BonusWorkspace({
  data,
  actions,
}: {
  data: HrBonusData;
  actions: {
    create: BonusAction;
    adjust: BonusAction;
    approve: BonusAction;
    post: BonusAction;
    cancel: BonusAction;
    refresh: BonusAction;
  };
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(data.campaigns[0]?.id ?? "");
  const [createOpen, setCreateOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [replayToken, setReplayToken] = useState(0);
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();
  const selected = data.campaigns.find((campaign) => campaign.id === selectedId) ?? data.campaigns[0];

  function run(action: () => Promise<unknown>, success: string, close?: () => void) {
    startTransition(() => {
      void action()
        .then(() => {
          setNotice(success);
          close?.();
          router.refresh();
        })
        .catch((error) => setNotice(notifyCaughtError(error, "Əməliyyat tamamlanmadı")));
    });
  }

  if (!selected) {
    return (
      <section className="hr-bonus-empty">
        <div className="hr-bonus-empty-art"><Paintbrush /><Sparkles /></div>
        <div>
          <h2>İlk komanda bonusunu yaradın</h2>
          <p>Departament hədəflərini etaplara bölün, nəticəni şəffaf göstərin və hər uğuru Van Gogh ilə qeyd edin.</p>
        </div>
        {data.permissions.canManage ? <Button onClick={() => setCreateOpen(true)}><Plus data-icon="inline-start" /> Bonus yarat</Button> : <p className="hr-bonus-empty-note">Sizin departament üçün aktiv kampaniya yoxdur.</p>}
        <CreateBonusDialog open={createOpen} departments={data.departments} pending={pending} onClose={() => setCreateOpen(false)} onSubmit={(formData) => run(() => actions.create(formData), "Bonus kampaniyası yaradıldı.", () => setCreateOpen(false))} />
      </section>
    );
  }

  const reachedStages = selected.stages.filter((stage) => stage.reachedAt);
  const nextStage = selected.stages.find((stage) => !stage.reachedAt);
  const latestStage = reachedStages.at(-1);
  const status = statusMeta[selected.status];
  const unit = selected.metricKind === "DEPARTMENT_SALES_COUNT" ? "satış" : selected.metricKind === "MANUAL_KPI" ? "xal" : "₼";

  return (
    <section className="hr-bonus-board" aria-busy={pending}>
      <div className="hr-bonus-command-row">
        <label className="hr-bonus-campaign-select">
          <span>Kampaniya</span>
          <select value={selected.id} onChange={(event) => setSelectedId(event.target.value)}>
            {data.campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name} · {campaign.department}</option>)}
          </select>
        </label>
        <div className="hr-bonus-command-actions">
          {data.permissions.canManage ? <Button variant="outline" onClick={() => run(() => actions.refresh(new FormData()), "Bonus göstəriciləri yeniləndi.")}><RefreshCw data-icon="inline-start" /> Yenilə</Button> : null}
          <Button variant="outline" aria-label="Animasiyanı yenidən oynat" onClick={() => setReplayToken((value) => value + 1)}><RotateCcw data-icon="inline-start" /> Yenidən oynat</Button>
          {data.permissions.canManage ? <Button onClick={() => setCreateOpen(true)}><Plus data-icon="inline-start" /> Bonus yarat</Button> : null}
        </div>
      </div>

      {notice ? <div className="hr-bonus-notice" role="status"><Sparkles />{notice}<button type="button" onClick={() => setNotice("")} aria-label="Bildirişi bağla">×</button></div> : null}

      <div className="hr-bonus-stage-layout">
        <section className="hr-bonus-stage-main" aria-labelledby="bonus-scene-title">
          <div className="hr-bonus-scene-heading">
            <div><span>Komanda səhnəsi</span><h2 id="bonus-scene-title">Van Gogh-un emalatxanası</h2></div>
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>
          <div className="hr-bonus-scene-wrap">
            <VanGoghBonusIllustration progress={selected.progress} reachedCount={reachedStages.length} celebrationKey={`${selected.id}:${latestStage?.id ?? "start"}`} replayToken={replayToken} />
            <div className="hr-bonus-progress-float">
              <span>{selected.department} komandası</span>
              <strong>{Math.round(selected.progress)}%</strong>
              <b>{formatMetric(selected.currentValue, unit)} <i>/ {formatMetric(selected.maxThreshold, unit)}</i></b>
              <div><span style={{ width: `${selected.progress}%` }} /></div>
              <small>{metricLabel(selected.metricKind)}</small>
            </div>
          </div>
          <MilestoneRail campaign={selected} unit={unit} />
        </section>

        <aside className="hr-bonus-inspector">
          <div className="hr-bonus-inspector-title">
            <div><span>Kampaniya</span><h2>{selected.name}</h2></div>
            <Flag />
          </div>
          <dl>
            <div><dt><UsersRound /> Departament</dt><dd>{selected.department}</dd></div>
            <div><dt><CalendarDays /> Dövr</dt><dd>{formatDate(selected.startsAt)} – {formatDate(selected.endsAt)}</dd></div>
            <div><dt><CircleDollarSign /> Ümumi bonus fondu</dt><dd>{formatMoney(selected.totalBonusPool)}</dd></div>
            <div><dt><Target /> Növbəti etap</dt><dd>{nextStage ? `${formatMetric(nextStage.threshold, unit)} → ${formatMoney(nextStage.bonusPool)}` : "Bütün etaplar tamamlandı"}</dd></div>
            <div><dt><UsersRound /> İştirak edən əməkdaşlar</dt><dd>{selected.participantCount} nəfər</dd></div>
          </dl>
          <div className="hr-bonus-inspector-progress">
            <div><span>Komanda tərəqqisi</span><strong>{Math.round(selected.progress)}%</strong></div>
            <div className="hr-bonus-track"><span style={{ width: `${selected.progress}%` }} /></div>
            <small>{formatMetric(selected.currentValue, unit)} / {formatMetric(selected.maxThreshold, unit)}</small>
          </div>
          {selected.ownAwardTotal > 0 ? <div className="hr-bonus-own-award"><PartyPopper /><div><span>Sizin açılmış bonus payınız</span><strong>{formatMoney(selected.ownAwardTotal)}</strong></div></div> : null}
          {data.permissions.canManage ? <div className="hr-bonus-inspector-actions"><Button variant="outline" onClick={() => setAdjustOpen(true)}>Nəticəyə düzəliş</Button><Button variant="ghost" onClick={() => setCancelOpen(true)}>Kampaniyanı ləğv et</Button></div> : null}
        </aside>
      </div>

      <section className="hr-bonus-history">
        <div className="hr-bonus-history-title"><div><Star /><span>Kampaniya tarixçəsi</span></div><small>{reachedStages.length}/{selected.stages.length} etap açılıb</small></div>
        {latestStage ? <StageHistoryRow stage={latestStage} campaign={selected} canApprove={data.permissions.canApprove} canPost={data.permissions.canPost} pending={pending} onApprove={() => { const form = new FormData(); form.set("stageId", latestStage.id); run(() => actions.approve(form), "Bonus payları HR tərəfindən təsdiqləndi."); }} onPost={() => { const form = new FormData(); form.set("stageId", latestStage.id); run(() => actions.post(form), "Bonus payları Maliyyə xərclərinə göndərildi."); }} /> : <div className="hr-bonus-history-empty">İlk etap açıldıqda uğur burada görünəcək.</div>}
      </section>

      <CreateBonusDialog open={createOpen} departments={data.departments} pending={pending} onClose={() => setCreateOpen(false)} onSubmit={(formData) => run(() => actions.create(formData), "Bonus kampaniyası yaradıldı.", () => setCreateOpen(false))} />
      <AdjustmentDialog open={adjustOpen} campaign={selected} pending={pending} onClose={() => setAdjustOpen(false)} onSubmit={(formData) => run(() => actions.adjust(formData), "Nəticə düzəlişi qeydə alındı.", () => setAdjustOpen(false))} />
      <CancelDialog open={cancelOpen} campaign={selected} pending={pending} onClose={() => setCancelOpen(false)} onSubmit={(formData) => run(() => actions.cancel(formData), "Kampaniya ləğv edildi.", () => setCancelOpen(false))} />
    </section>
  );
}

function MilestoneRail({ campaign, unit }: { campaign: HrBonusCampaignDto; unit: string }) {
  const labels = ["Rəng açıldı", "Ulduzlar oyandı", "Emalatxana canlandı", "Bonus qazandı"];
  return <div className="hr-bonus-milestones" style={{ "--milestones": campaign.stages.length } as CSSProperties}>{campaign.stages.map((stage, index) => { const reached = Boolean(stage.reachedAt); const current = !reached && campaign.stages.slice(0, index).every((item) => item.reachedAt); return <div className={reached ? "is-reached" : current ? "is-current" : ""} key={stage.id}><span>{reached ? <BadgeCheck /> : <Star />}</span><strong>{Math.round((stage.threshold / campaign.maxThreshold) * 100)}%</strong><small>{labels[index] ?? `${formatMetric(stage.threshold, unit)} hədəfi`}</small></div>; })}</div>;
}

function StageHistoryRow({ stage, campaign, canApprove, canPost, pending, onApprove, onPost }: { stage: HrBonusStageDto; campaign: HrBonusCampaignDto; canApprove: boolean; canPost: boolean; pending: boolean; onApprove: () => void; onPost: () => void }) {
  const pendingCount = stage.awards.filter((award) => award.status === "PENDING_HR").length;
  const approvedCount = stage.awards.filter((award) => award.status === "APPROVED").length;
  const postedCount = stage.awards.filter((award) => award.status === "POSTED").length;
  return <div className="hr-bonus-history-row"><span className="hr-bonus-history-medal"><Star /></span><div><Badge variant="secondary">ETAP AÇILDI</Badge><strong>{Math.round((stage.threshold / campaign.maxThreshold) * 100)}% — {stage.sortOrder + 1}. mərhələ</strong><p>Komanda {formatMetric(stage.threshold, campaign.metricKind === "DEPARTMENT_SALES_COUNT" ? "satış" : campaign.metricKind === "MANUAL_KPI" ? "xal" : "₼")} hədəfini keçdi.</p></div><div><span>Qeydiyyat vaxtı</span><strong>{formatDateTime(stage.reachedAt)}</strong></div><div><span>Bonus statusu</span><strong>{postedCount ? "Maliyyəyə göndərilib" : approvedCount ? "HR təsdiqləyib" : "HR təsdiqi gözlənilir"}</strong></div><div className="hr-bonus-history-actions">{canApprove && pendingCount ? <Button size="sm" variant="outline" disabled={pending} onClick={onApprove}><BadgeCheck data-icon="inline-start" /> Təsdiqlə</Button> : null}{canPost && approvedCount ? <Button size="sm" disabled={pending} onClick={onPost}><Banknote data-icon="inline-start" /> Maliyyəyə göndər</Button> : null}</div></div>;
}

function CreateBonusDialog({ open, departments, pending, onClose, onSubmit }: { open: boolean; departments: string[]; pending: boolean; onClose: () => void; onSubmit: (formData: FormData) => void }) {
  const [targetMode, setTargetMode] = useState<"single" | "staged">("staged");
  const [metricKind, setMetricKind] = useState("DEPARTMENT_COLLECTED_REVENUE");
  const [stages, setStages] = useState<StageDraft[]>([{ threshold: 5000, bonusPool: 250 }, { threshold: 10000, bonusPool: 500 }, { threshold: 20000, bonusPool: 1250 }]);
  const today = new Date().toISOString().slice(0, 10);
  const nextMonth = useMemo(() => { const value = new Date(); value.setDate(value.getDate() + 30); return value.toISOString().slice(0, 10); }, []);
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const formData = new FormData(event.currentTarget); formData.set("metricKind", metricKind); formData.set("stages", JSON.stringify(targetMode === "single" ? stages.slice(0, 1) : stages)); onSubmit(formData); }
  function updateStage(index: number, field: keyof StageDraft, value: number) { setStages((current) => current.map((stage, stageIndex) => stageIndex === index ? { ...stage, [field]: value } : stage)); }
  return <Dialog open={open} onOpenChange={(value) => !value && onClose()}><DialogContent className="hr-bonus-drawer"><DialogHeader><DialogTitle>Bonus yarat</DialogTitle><DialogDescription>Departament üçün hədəf və bonus etaplarını qurun.</DialogDescription></DialogHeader><form className="hr-bonus-create-form" onSubmit={submit}><FieldGroup><Field><FieldLabel htmlFor="bonus-name">Kampaniya adı</FieldLabel><Input id="bonus-name" name="name" placeholder="Məsələn: İyul satış sprinti" required minLength={3} /></Field><Field><FieldLabel>Departament</FieldLabel><FormSelect name="department" options={departments.map((department) => ({ value: department, label: department }))} placeholder="Departament seçin" required /></Field><div className="hr-bonus-form-grid"><Field><FieldLabel htmlFor="bonus-start">Başlama tarixi</FieldLabel><Input id="bonus-start" name="startsAt" type="date" defaultValue={today} required /></Field><Field><FieldLabel htmlFor="bonus-end">Bitmə tarixi</FieldLabel><Input id="bonus-end" name="endsAt" type="date" defaultValue={nextMonth} required /></Field></div><Field><FieldLabel>Nəticə mənbəyi</FieldLabel><FormSelect name="metricKind" value={metricKind} onValueChange={setMetricKind} options={metricOptions} required /><FieldDescription>{metricKind === "DEPARTMENT_COLLECTED_REVENUE" ? "Məsul menecerə bağlı tələbə ödənişlərindən avtomatik hesablanır." : metricKind === "DEPARTMENT_SALES_COUNT" ? "Departament əməkdaşlarına bağlı yeni qeydiyyatlardan hesablanır." : "Cari nəticə HR düzəlişləri ilə daxil edilir."}</FieldDescription></Field><Field><FieldLabel>Hədəf tipi</FieldLabel><div className="hr-bonus-segment"><button type="button" className={targetMode === "single" ? "is-active" : ""} onClick={() => setTargetMode("single")}>Tək hədəf</button><button type="button" className={targetMode === "staged" ? "is-active" : ""} onClick={() => setTargetMode("staged")}>Etaplı</button></div></Field><Field><FieldLabel>Etaplar</FieldLabel><div className="hr-bonus-stage-editor">{(targetMode === "single" ? stages.slice(0, 1) : stages).map((stage, index) => <div key={index}><span>{index + 1}</span><Input aria-label={`${index + 1}. etap hədəfi`} type="number" min="1" step={metricKind === "DEPARTMENT_SALES_COUNT" ? "1" : "0.01"} value={stage.threshold} onChange={(event) => updateStage(index, "threshold", Number(event.target.value))} /><i>→</i><Input aria-label={`${index + 1}. etap bonusu`} type="number" min="0.01" step="0.01" value={stage.bonusPool} onChange={(event) => updateStage(index, "bonusPool", Number(event.target.value))} /><small>₼</small>{targetMode === "staged" && stages.length > 1 ? <button type="button" aria-label="Etapı sil" onClick={() => setStages((current) => current.filter((_, stageIndex) => stageIndex !== index))}>×</button> : null}</div>)}{targetMode === "staged" && stages.length < 6 ? <Button type="button" variant="outline" size="sm" onClick={() => setStages((current) => [...current, { threshold: (current.at(-1)?.threshold ?? 0) + 5000, bonusPool: 500 }])}><Plus data-icon="inline-start" /> Etap əlavə et</Button> : null}</div></Field><Field><FieldLabel>Mükafat bölgüsü</FieldLabel><FormSelect name="distributionMode" options={distributionOptions} defaultValue="EQUAL" required /></Field></FieldGroup><DialogFooter className="hr-bonus-drawer-footer"><Button type="button" variant="outline" onClick={onClose}>Ləğv et</Button><Button type="submit" disabled={pending}>{pending ? "Yaradılır…" : "Bonus yarat"}</Button></DialogFooter></form></DialogContent></Dialog>;
}

function AdjustmentDialog({ open, campaign, pending, onClose, onSubmit }: { open: boolean; campaign: HrBonusCampaignDto; pending: boolean; onClose: () => void; onSubmit: (formData: FormData) => void }) { return <Dialog open={open} onOpenChange={(value) => !value && onClose()}><DialogContent className="hr-bonus-small-dialog"><DialogHeader><DialogTitle>Nəticəyə düzəliş</DialogTitle><DialogDescription>Avtomatik nəticəyə auditli müsbət və ya mənfi dəyişiklik əlavə edin.</DialogDescription></DialogHeader><form onSubmit={(event) => { event.preventDefault(); onSubmit(new FormData(event.currentTarget)); }}><input type="hidden" name="campaignId" value={campaign.id} /><FieldGroup><Field><FieldLabel htmlFor="adjustment-amount">Düzəliş</FieldLabel><Input id="adjustment-amount" name="amount" type="number" step="0.01" placeholder="Məsələn: 250 və ya -100" required /></Field><Field><FieldLabel htmlFor="adjustment-reason">Səbəb</FieldLabel><textarea id="adjustment-reason" name="reason" rows={4} minLength={3} maxLength={500} required /></Field></FieldGroup><DialogFooter><Button type="button" variant="outline" onClick={onClose}>Ləğv et</Button><Button type="submit" disabled={pending}>Düzəlişi saxla</Button></DialogFooter></form></DialogContent></Dialog>; }

function CancelDialog({ open, campaign, pending, onClose, onSubmit }: { open: boolean; campaign: HrBonusCampaignDto; pending: boolean; onClose: () => void; onSubmit: (formData: FormData) => void }) { return <Dialog open={open} onOpenChange={(value) => !value && onClose()}><DialogContent className="hr-bonus-small-dialog"><DialogHeader><DialogTitle>Kampaniyanı ləğv etmək?</DialogTitle><DialogDescription>“{campaign.name}” dayandırılacaq. Maliyyəyə göndərilmiş bonuslar varsa ləğv bloklanacaq.</DialogDescription></DialogHeader><form onSubmit={(event) => { event.preventDefault(); onSubmit(new FormData(event.currentTarget)); }}><input type="hidden" name="campaignId" value={campaign.id} /><Field><FieldLabel htmlFor="cancel-reason">Ləğv səbəbi</FieldLabel><textarea id="cancel-reason" name="reason" rows={4} minLength={3} maxLength={500} required /></Field><DialogFooter><Button type="button" variant="outline" onClick={onClose}>Geri qayıt</Button><Button type="submit" variant="destructive" disabled={pending}>Kampaniyanı ləğv et</Button></DialogFooter></form></DialogContent></Dialog>; }

function metricLabel(kind: HrBonusCampaignDto["metricKind"]) { return metricOptions.find((option) => option.value === kind)?.label ?? kind; }
const azMonths = ["yan", "fev", "mar", "apr", "may", "iyn", "iyl", "avq", "sen", "okt", "noy", "dek"];
function formatMoney(value: number) { return `${new Intl.NumberFormat("az-AZ", { maximumFractionDigits: 2 }).format(value)} ₼`; }
function formatMetric(value: number, unit: string) { const formatted = new Intl.NumberFormat("az-AZ", { maximumFractionDigits: 2 }).format(value); return unit === "₼" ? `${formatted} ₼` : `${formatted} ${unit}`; }
function formatDate(value: string) { const [year, month, day] = value.split("-"); return `${day} ${azMonths[Number(month) - 1]} ${year}`; }
function formatDateTime(value: string) { if (!value) return "—"; const date = new Date(value); return `${String(date.getDate()).padStart(2, "0")} ${azMonths[date.getMonth()]} ${date.getFullYear()}, ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`; }
