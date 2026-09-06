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
  Trash2,
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
import { unwrapActionResult } from "@/lib/action-result";
import "./bonus.css";

const VanGoghBonusIllustration = dynamic(
  () => import("@/modules/hr/van-gogh-bonus-illustration").then((module) => module.VanGoghBonusIllustration),
  { ssr: false, loading: () => <div className="hr-bonus-scene-loading"><Paintbrush /><span>Emalatxana hazırlanır…</span></div> },
);

type BonusAction = (formData: FormData) => Promise<unknown>;
type StageDraft = { threshold: number; bonusPool: number; bonusPercent: number; fixedAmount: number };
type TeacherPenaltyDraft = { tierIndex: number; churnThreshold: number; deductionAmount: number };

const metricOptions = [
  { value: "DEPARTMENT_COLLECTED_REVENUE", label: "Toplanmış gəlir" },
  { value: "DEPARTMENT_SALES_COUNT", label: "Satış sayı" },
  { value: "TEACHER_RETENTION_RATE", label: "Müəllim: tələbə sayı və churn" },
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
    remove: BonusAction;
    refresh: BonusAction;
  };
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(data.campaigns[0]?.id ?? "");
  const [createOpen, setCreateOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [replayToken, setReplayToken] = useState(0);
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();
  const selected = data.campaigns.find((campaign) => campaign.id === selectedId) ?? data.campaigns[0];

  function run(action: () => Promise<unknown>, success: string, close?: () => void) {
    startTransition(() => {
      void action()
        .then((result) => {
          unwrapActionResult(result);
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
        <CreateBonusDialog open={createOpen} departments={data.departments} teacherDepartments={data.teacherDepartments} employees={data.employees} pending={pending} onClose={() => setCreateOpen(false)} onSubmit={(formData) => run(() => actions.create(formData), "Bonus kampaniyası yaradıldı.", () => setCreateOpen(false))} />
      </section>
    );
  }

  const reachedStages = selected.stages.filter((stage) => stage.reachedAt);
  const nextStage = selected.stages.find((stage) => !stage.reachedAt);
  const latestStage = reachedStages.at(-1);
  const status = statusMeta[selected.status];
  const unit = selected.metricKind === "DEPARTMENT_SALES_COUNT"
    ? "satış"
    : selected.metricKind === "TEACHER_RETENTION_RATE"
      ? "tələbə (orta)"
      : selected.metricKind === "MANUAL_KPI"
        ? "xal"
        : "₼";

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
            <div><dt><RefreshCw /> Davam etmə</dt><dd>{selected.recursMonthly ? "Hər ay avtomatik" : "Yalnız bu dövr"}</dd></div>
            <div><dt><CircleDollarSign /> Maksimum bonus qaydası</dt><dd>{formatStageRule(selected.stages.at(-1), selected)}</dd></div>
            <div><dt><Target /> Növbəti etap</dt><dd>{nextStage ? `${formatMetric(nextStage.threshold, unit)} → ${formatStageRule(nextStage, selected)}` : "Bütün etaplar tamamlandı"}</dd></div>
            <div><dt><UsersRound /> İştirak edən əməkdaşlar</dt><dd>{selected.participantCount} nəfər</dd></div>
          </dl>
          <div className="hr-bonus-inspector-progress">
            <div><span>Komanda tərəqqisi</span><strong>{Math.round(selected.progress)}%</strong></div>
            <div className="hr-bonus-track"><span style={{ width: `${selected.progress}%` }} /></div>
            <small>{formatMetric(selected.currentValue, unit)} / {formatMetric(selected.maxThreshold, unit)}</small>
          </div>
          {selected.metricKind === "DEPARTMENT_SALES_COUNT" ? <div className="hr-bonus-method-note"><strong>Faktiki yeni satışlar</strong><span>Bu günə qədərki yeni qeydiyyatlar hesablanır. Ödənişli geri dönüşlər şirkət KPI-na daxildir, yeni satış bonusuna daxil deyil.</span><span>Gələcək tarixli qeydiyyat: {selected.scheduledValue ?? 0}</span></div> : null}
          {selected.ownAwardTotal > 0 ? <div className="hr-bonus-own-award"><PartyPopper /><div><span>Sizin açılmış bonus payınız</span><strong>{formatMoney(selected.ownAwardTotal)}</strong></div></div> : null}
          {selected.metricKind === "TEACHER_RETENTION_RATE" ? <div className="hr-bonus-method-note"><strong>Sadə hesab</strong><span>Tələbə sayına uyğun bonus seçilir, sonra həmin pillə üçün churn kəsintisi çıxılır.</span></div> : null}
          {selected.perUnitBonusPercent > 0 || selected.perUnitBonusAmount > 0 ? <div className="hr-bonus-method-note"><strong>Satışdan sonrakı bonus</strong><span>İlk {selected.requiredThreshold} satış məcburidir. Sonrakı hər satış üçün {selected.perUnitBonusPercent > 0 ? `${selected.perUnitBonusPercent}%` : ""}{selected.perUnitBonusPercent > 0 && selected.perUnitBonusAmount > 0 ? " + " : ""}{selected.perUnitBonusAmount > 0 ? formatMoney(selected.perUnitBonusAmount) : ""} hesablanır.</span></div> : null}
          {data.permissions.canManage ? <div className="hr-bonus-inspector-actions">{selected.metricKind !== "TEACHER_RETENTION_RATE" ? <Button variant="outline" onClick={() => setAdjustOpen(true)}>Nəticəyə düzəliş</Button> : null}<Button variant="ghost" onClick={() => setCancelOpen(true)}>Kampaniyanı ləğv et</Button><Button variant="destructive" onClick={() => setDeleteOpen(true)}><Trash2 data-icon="inline-start" /> Birdəfəlik sil</Button></div> : null}
        </aside>
      </div>

      <section className="hr-bonus-history">
        <div className="hr-bonus-history-title"><div><Star /><span>Kampaniya tarixçəsi</span></div><small>{reachedStages.length}/{selected.stages.length} etap açılıb</small></div>
        {latestStage ? <StageHistoryRow stage={latestStage} campaign={selected} canApprove={data.permissions.canApprove} canPost={data.permissions.canPost} pending={pending} onApprove={() => { const form = new FormData(); form.set("stageId", latestStage.id); run(() => actions.approve(form), "Bonus payları HR tərəfindən təsdiqləndi."); }} onPost={() => { const form = new FormData(); form.set("stageId", latestStage.id); run(() => actions.post(form), "Bonus payları Maliyyə xərclərinə göndərildi."); }} /> : <div className="hr-bonus-history-empty">İlk etap açıldıqda uğur burada görünəcək.</div>}
      </section>

      <CreateBonusDialog open={createOpen} departments={data.departments} teacherDepartments={data.teacherDepartments} employees={data.employees} pending={pending} onClose={() => setCreateOpen(false)} onSubmit={(formData) => run(() => actions.create(formData), "Bonus kampaniyası yaradıldı.", () => setCreateOpen(false))} />
      <AdjustmentDialog open={adjustOpen} campaign={selected} pending={pending} onClose={() => setAdjustOpen(false)} onSubmit={(formData) => run(() => actions.adjust(formData), "Nəticə düzəlişi qeydə alındı.", () => setAdjustOpen(false))} />
      <CancelDialog open={cancelOpen} campaign={selected} pending={pending} onClose={() => setCancelOpen(false)} onSubmit={(formData) => run(() => actions.cancel(formData), "Kampaniya ləğv edildi.", () => setCancelOpen(false))} />
      <DeleteCampaignDialog open={deleteOpen} campaign={selected} pending={pending} onClose={() => setDeleteOpen(false)} onSubmit={(formData) => run(() => actions.remove(formData), "Kampaniya birdəfəlik silindi.", () => { setDeleteOpen(false); setSelectedId(""); })} />
    </section>
  );
}

function MilestoneRail({ campaign, unit }: { campaign: HrBonusCampaignDto; unit: string }) {
  const labels = ["Rəng açıldı", "Ulduzlar oyandı", "Emalatxana canlandı", "Bonus qazandı"];
  return <div className="hr-bonus-milestones" style={{ "--milestones": campaign.stages.length } as CSSProperties}>{campaign.stages.map((stage, index) => { const reached = Boolean(stage.reachedAt); const current = !reached && campaign.stages.slice(0, index).every((item) => item.reachedAt); return <div className={reached ? "is-reached" : current ? "is-current" : ""} key={stage.id}><span>{reached ? <BadgeCheck /> : <Star />}</span><strong>{Math.round((stage.threshold / campaign.maxThreshold) * 100)}%</strong><small>{stage.isIncremental ? `${campaign.requiredThreshold + 1}-ci satışdan bonus` : labels[index] ?? `${formatMetric(stage.threshold, unit)} hədəfi`}</small></div>; })}</div>;
}

function StageHistoryRow({ stage, campaign, canApprove, canPost, pending, onApprove, onPost }: { stage: HrBonusStageDto; campaign: HrBonusCampaignDto; canApprove: boolean; canPost: boolean; pending: boolean; onApprove: () => void; onPost: () => void }) {
  const pendingCount = stage.awards.filter((award) => award.status === "PENDING_HR").length;
  const approvedCount = stage.awards.filter((award) => award.status === "APPROVED").length;
  const postedCount = stage.awards.filter((award) => award.status === "POSTED").length;
  const unit = campaign.metricKind === "DEPARTMENT_SALES_COUNT" ? "satış" : campaign.metricKind === "TEACHER_RETENTION_RATE" ? "tələbə" : campaign.metricKind === "MANUAL_KPI" ? "xal" : "₼";
  return <div className="hr-bonus-history-row"><span className="hr-bonus-history-medal"><Star /></span><div><Badge variant="secondary">ETAP AÇILDI</Badge><strong>{formatMetric(stage.threshold, unit)} — {formatStageRule(stage, campaign)}</strong><p>{campaign.metricKind === "TEACHER_RETENTION_RATE" ? `${stage.awards.length} müəllim tələbə sayı pilləsinə uyğun bonus qazandı.` : `Komanda ${formatMetric(stage.threshold, unit)} hədəfini keçdi.`}</p></div><div><span>Qeydiyyat vaxtı</span><strong>{formatDateTime(stage.reachedAt)}</strong></div><div><span>Bonus statusu</span><strong>{postedCount ? "Maliyyəyə göndərilib" : approvedCount ? "HR təsdiqləyib" : "HR təsdiqi gözlənilir"}</strong></div><div className="hr-bonus-history-actions">{canApprove && pendingCount ? <Button size="sm" variant="outline" disabled={pending} onClick={onApprove}><BadgeCheck data-icon="inline-start" /> Təsdiqlə</Button> : null}{canPost && approvedCount ? <Button size="sm" disabled={pending} onClick={onPost}><Banknote data-icon="inline-start" /> Maliyyəyə göndər</Button> : null}</div></div>;
}

function CreateBonusDialog({ open, departments, teacherDepartments, employees, pending, onClose, onSubmit }: {
  open: boolean;
  departments: string[];
  teacherDepartments: string[];
  employees: HrBonusData["employees"];
  pending: boolean;
  onClose: () => void;
  onSubmit: (formData: FormData) => void;
}) {
  const initialTeacherDepartment = teacherDepartments.includes(departments[0] ?? "");
  const [targetMode, setTargetMode] = useState<"single" | "staged">("staged");
  const [department, setDepartment] = useState(departments[0] ?? "");
  const [metricKind, setMetricKind] = useState(initialTeacherDepartment ? "TEACHER_RETENTION_RATE" : "DEPARTMENT_COLLECTED_REVENUE");
  const [stages, setStages] = useState<StageDraft[]>(() => initialTeacherDepartment ? teacherStages() : salesStages());
  const [teacherPenalties, setTeacherPenalties] = useState<TeacherPenaltyDraft[]>(() => teacherPenaltyDefaults());
  const [useUniformPercent, setUseUniformPercent] = useState(false);
  const [perUnitEnabled, setPerUnitEnabled] = useState(false);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>(() => employees.filter((employee) => employee.department === (departments[0] ?? "")).map((employee) => employee.id));
  const isTeacherMetric = metricKind === "TEACHER_RETENTION_RATE";
  const departmentEmployees = useMemo(() => employees.filter((employee) => employee.department === department && (!isTeacherMetric || employee.isTeacher)), [department, employees, isTeacherMetric]);
  const today = new Date().toISOString().slice(0, 10);
  const nextMonth = useMemo(() => { const value = new Date(); value.setDate(value.getDate() + 30); return value.toISOString().slice(0, 10); }, []);

  function selectDepartment(value: string) {
    setDepartment(value);
    setSelectedEmployeeIds(employees.filter((employee) => employee.department === value).map((employee) => employee.id));
    if (teacherDepartments.includes(value)) {
      setTargetMode("staged");
      setMetricKind("TEACHER_RETENTION_RATE");
      setStages(teacherStages());
      setTeacherPenalties(teacherPenaltyDefaults());
      setUseUniformPercent(false);
      setPerUnitEnabled(false);
    } else if (metricKind === "TEACHER_RETENTION_RATE") {
      setMetricKind("DEPARTMENT_SALES_COUNT");
      setStages(salesStages());
    }
  }

  function selectMetric(value: string) {
    setMetricKind(value);
    if (value === "TEACHER_RETENTION_RATE") {
      setTargetMode("staged");
      setStages(teacherStages());
      setTeacherPenalties(teacherPenaltyDefaults());
      setUseUniformPercent(false);
      setPerUnitEnabled(false);
    }
    else if (metricKind === "TEACHER_RETENTION_RATE") setStages(salesStages());
    if (value !== "DEPARTMENT_SALES_COUNT") setPerUnitEnabled(false);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("department", department);
    formData.set("metricKind", metricKind);
    formData.set("participantIds", JSON.stringify(selectedEmployeeIds));
    const submittedStages = (targetMode === "single" ? stages.slice(0, 1) : stages).map((stage, stageIndex) => ({
      ...stage,
      churnRules: isTeacherMetric
        ? teacherPenalties
            .filter((rule) => rule.tierIndex === stageIndex)
            .toSorted((first, second) => first.churnThreshold - second.churnThreshold)
            .map(({ churnThreshold, deductionAmount }) => ({ churnThreshold, deductionAmount }))
        : [],
    }));
    formData.set("stages", JSON.stringify(submittedStages));
    onSubmit(formData);
  }

  function updateStage(index: number, field: keyof StageDraft, value: number) {
    setStages((current) => current.map((stage, stageIndex) => {
      if (field === "bonusPercent" && useUniformPercent) return { ...stage, bonusPercent: value };
      return stageIndex === index ? { ...stage, [field]: value } : stage;
    }));
  }

  function toggleUniformPercent() {
    const next = !useUniformPercent;
    if (next) {
      const sharedPercent = stages[0]?.bonusPercent ?? 0;
      setStages((items) => items.map((stage) => ({ ...stage, bonusPercent: sharedPercent })));
    }
    setUseUniformPercent(next);
  }

  function updatePenalty(index: number, field: keyof TeacherPenaltyDraft, value: number) {
    setTeacherPenalties((current) => current.map((rule, ruleIndex) => ruleIndex === index ? { ...rule, [field]: value } : rule));
  }

  function removeTeacherStage(index: number) {
    setStages((current) => current.filter((_, stageIndex) => stageIndex !== index));
    setTeacherPenalties((current) => current
      .filter((rule) => rule.tierIndex !== index)
      .map((rule) => ({ ...rule, tierIndex: rule.tierIndex > index ? rule.tierIndex - 1 : rule.tierIndex })));
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="hr-bonus-drawer">
        <DialogHeader>
          <DialogTitle>Bonus yarat</DialogTitle>
          <DialogDescription>Hədəfi, maaşa əlavə faizi və istəyə bağlı sabit ödənişi qurun.</DialogDescription>
        </DialogHeader>
        <form className="hr-bonus-create-form" onSubmit={submit}>
          <FieldGroup>
            <Field><FieldLabel htmlFor="bonus-name">Kampaniya adı</FieldLabel><Input id="bonus-name" name="name" placeholder="Məsələn: İyul satış sprinti" required minLength={3} /></Field>
            <Field><FieldLabel>Departament</FieldLabel><FormSelect name="department" value={department} onValueChange={selectDepartment} options={departments.map((item) => ({ value: item, label: item }))} placeholder="Departament seçin" searchable searchPlaceholder="Departament axtar..." catalogKey="HR_DEPARTMENT" createLabel="Yeni departament əlavə et" required /></Field>
            <Field>
              <FieldLabel>İştirak edən əməkdaşlar</FieldLabel>
              <FieldDescription>Bonusun kimlərə tətbiq olunacağını manual seçin.</FieldDescription>
              <div className="hr-bonus-participant-list">
                {departmentEmployees.map((employee) => { const checked = selectedEmployeeIds.includes(employee.id); return <label key={employee.id}><input type="checkbox" checked={checked} onChange={() => setSelectedEmployeeIds((current) => checked ? current.filter((id) => id !== employee.id) : [...current, employee.id])} /><span><strong>{employee.name}</strong><small>{employee.position}</small></span></label>; })}
              </div>
              {!departmentEmployees.length ? <FieldDescription>Bu departamentdə aktiv əməkdaş tapılmadı.</FieldDescription> : null}
            </Field>
            <div className="hr-bonus-form-grid"><Field><FieldLabel htmlFor="bonus-start">Başlama tarixi</FieldLabel><Input id="bonus-start" name="startsAt" type="date" defaultValue={today} required /></Field><Field><FieldLabel htmlFor="bonus-end">Bitmə tarixi</FieldLabel><Input id="bonus-end" name="endsAt" type="date" defaultValue={nextMonth} required /></Field></div>
            <label className="hr-bonus-recurring"><input type="checkbox" name="recursMonthly" value="true" /><span><strong>Hər ay avtomatik davam et</strong><small>Bu dövr bitəndə eyni qaydalarla növbəti ay yaradılacaq.</small></span></label>
            <Field><FieldLabel>Nəticə mənbəyi</FieldLabel><FormSelect name="metricKind" value={metricKind} onValueChange={selectMetric} options={metricOptions} required /><FieldDescription>{metricDescription(metricKind)}</FieldDescription></Field>
            {metricKind === "DEPARTMENT_SALES_COUNT" ? <Field>
              <label className="hr-bonus-recurring"><input type="checkbox" checked={perUnitEnabled} onChange={(event) => { const enabled = event.target.checked; setPerUnitEnabled(enabled); if (enabled) { setTargetMode("staged"); setStages(milestoneExampleStages()); } }} /><span><strong>Məcburi həddən sonra hər satış üçün bonus</strong><small>Faiz və ya sabit məbləğ hər əlavə satış üçün ayrıca hesablanır.</small></span></label>
              {perUnitEnabled ? <div className="hr-bonus-per-unit-grid"><label><span>Məcburi satış</span><Input name="requiredThreshold" type="number" min="1" step="1" defaultValue="20" required /></label><label><span>Hər satış üçün faiz</span><Input name="perUnitBonusPercent" type="number" min="0" max="100" step="0.01" defaultValue="10" required /></label><label><span>Hər satış üçün AZN</span><Input name="perUnitBonusAmount" type="number" min="0" step="0.01" defaultValue="0" required /></label></div> : <><input type="hidden" name="requiredThreshold" value="0" /><input type="hidden" name="perUnitBonusPercent" value="0" /><input type="hidden" name="perUnitBonusAmount" value="0" /></>}
            </Field> : <><input type="hidden" name="requiredThreshold" value="0" /><input type="hidden" name="perUnitBonusPercent" value="0" /><input type="hidden" name="perUnitBonusAmount" value="0" /></>}
            {!isTeacherMetric ? <Field><FieldLabel>Hədəf tipi</FieldLabel><div className="hr-bonus-segment"><button type="button" className={targetMode === "single" ? "is-active" : ""} onClick={() => setTargetMode("single")}>Tək hədəf</button><button type="button" className={targetMode === "staged" ? "is-active" : ""} onClick={() => setTargetMode("staged")}>Etaplı</button></div></Field> : null}
            {isTeacherMetric ? <>
              <Field>
                <FieldLabel>Tələbə sayına görə bonus</FieldLabel>
                <FieldDescription>Müəllim hansı pilləyə çatırsa, həmin pillənin baza bonusu götürülür.</FieldDescription>
                <div className="hr-bonus-stage-editor is-teacher-tier">
                  {stages.map((stage, index) => <div key={index}><span>{index + 1}</span><FormSelect name={`teacherTier-${index}`} aria-label={`${index + 1}. tələbə sayı pilləsi`} value={String(stage.threshold)} onValueChange={(value) => updateStage(index, "threshold", Number(value))} options={teacherTierOptions(stages, index)} searchable searchPlaceholder="Pillə axtar..." /><i>→</i><Input aria-label={`${index + 1}. müəllim bonusu`} type="number" min="0.01" step="0.01" value={stage.fixedAmount} onChange={(event) => updateStage(index, "fixedAmount", Number(event.target.value))} /><small>₼ bonus</small>{stages.length > 1 ? <button type="button" aria-label="Pilləni sil" onClick={() => removeTeacherStage(index)}>×</button> : null}</div>)}
                  {stages.length < 6 && (stages.at(-1)?.threshold ?? 0) < 500 ? <Button type="button" variant="outline" size="sm" onClick={() => setStages((current) => { const last = current.at(-1); return [...current, { threshold: (last?.threshold ?? 10) + 10, bonusPool: 0, bonusPercent: 0, fixedAmount: (last?.fixedAmount ?? 0) + 100 }]; })}><Plus data-icon="inline-start" /> Tələbə pilləsi əlavə et</Button> : null}
                </div>
              </Field>
              <Field>
                <FieldLabel>Churn kəsintiləri</FieldLabel>
                <FieldDescription>Pilləni seçin, churn sayını və bonusdan çıxılacaq məbləği yazın.</FieldDescription>
                <div className="hr-bonus-penalty-editor">
                  {teacherPenalties.map((rule, index) => <div key={index}><FormSelect name={`teacherPenaltyTier-${index}`} aria-label={`${index + 1}. churn pilləsi`} value={String(rule.tierIndex)} onValueChange={(value) => updatePenalty(index, "tierIndex", Number(value))} options={stages.map((stage, stageIndex) => ({ value: String(stageIndex), label: `${stage.threshold}+ tələbə` }))} /><Input aria-label={`${index + 1}. churn sayı`} type="number" min="1" max="500" step="1" value={rule.churnThreshold} onChange={(event) => updatePenalty(index, "churnThreshold", Number(event.target.value))} /><small>churn</small><i>→</i><Input aria-label={`${index + 1}. churn kəsintisi`} type="number" min="0" step="0.01" value={rule.deductionAmount} onChange={(event) => updatePenalty(index, "deductionAmount", Number(event.target.value))} /><small>₼ çıx</small><button type="button" aria-label="Churn qaydasını sil" onClick={() => setTeacherPenalties((current) => current.filter((_, ruleIndex) => ruleIndex !== index))}>×</button></div>)}
                  {teacherPenalties.length < 12 ? <Button type="button" variant="outline" size="sm" onClick={() => setTeacherPenalties((current) => [...current, { tierIndex: Math.max(0, stages.length - 1), churnThreshold: (current.at(-1)?.churnThreshold ?? 0) + 1, deductionAmount: (current.at(-1)?.deductionAmount ?? 0) + 20 }])}><Plus data-icon="inline-start" /> Churn qaydası əlavə et</Button> : null}
                </div>
              </Field>
            </> : <Field>
              <FieldLabel>{perUnitEnabled ? "Milestonlar" : "Etaplar"}</FieldLabel>
              <FieldDescription>{perUnitEnabled ? "Məsələn, 50 satışda 50 AZN, 70 satışda 70 AZN. Yuxarı mileston əvvəlkini tamamlayır." : "Faiz maaş/hesablanmış müəllim ödənişi üzərindən, sabit hissə isə AZN ilə hesablanır. Yuxarı etap əvvəlki etabı əvəz edir."}</FieldDescription>
              {targetMode === "staged" ? <div className="hr-bonus-uniform-percent">
                <Button type="button" variant={useUniformPercent ? "default" : "outline"} size="sm" aria-pressed={useUniformPercent} onClick={toggleUniformPercent}>
                  {useUniformPercent ? "Eyni faiz aktivdir" : "Eyni faizi bütün etaplara tətbiq et"}
                </Button>
                <small>{useUniformPercent ? "Bir faiz sahəsini dəyişəndə bütün etaplar yenilənir. Faiz yekundur, etaplar üzrə toplanmır." : "Aktiv etdikdə ilk etabın faizi bütün etaplara köçürülür."}</small>
              </div> : null}
              <div className="hr-bonus-stage-editor is-reward-rule">
                {(targetMode === "single" ? stages.slice(0, 1) : stages).map((stage, index) => <div key={index}><span>{index + 1}</span><Input aria-label={`${index + 1}. etap hədəfi`} title="Hədəf" type="number" min="1" step={metricKind === "DEPARTMENT_SALES_COUNT" ? "1" : "0.01"} value={stage.threshold} onChange={(event) => updateStage(index, "threshold", Number(event.target.value))} /><i>→</i><Input aria-label={`${index + 1}. etap bonus faizi`} title="Bonus faizi" type="number" min="0" max="100" step="0.01" value={stage.bonusPercent} onChange={(event) => updateStage(index, "bonusPercent", Number(event.target.value))} /><small>%</small><b>+</b><Input aria-label={`${index + 1}. etap sabit ödənişi`} title="Sabit ödəniş (optional)" type="number" min="0" step="0.01" value={stage.fixedAmount} onChange={(event) => updateStage(index, "fixedAmount", Number(event.target.value))} /><small>₼</small>{targetMode === "staged" && stages.length > 1 ? <button type="button" aria-label="Etapı sil" onClick={() => setStages((current) => current.filter((_, stageIndex) => stageIndex !== index))}>×</button> : null}</div>)}
                {targetMode === "staged" && stages.length < (perUnitEnabled ? 5 : 6) ? <Button type="button" variant="outline" size="sm" onClick={() => setStages((current) => { const last = current.at(-1); return [...current, { threshold: (last?.threshold ?? 0) + 10, bonusPool: 0, bonusPercent: useUniformPercent ? (current[0]?.bonusPercent ?? 0) : perUnitEnabled ? 0 : Math.min(100, (last?.bonusPercent ?? 0) + 10), fixedAmount: last?.fixedAmount ?? 0 }]; })}><Plus data-icon="inline-start" /> {perUnitEnabled ? "Mileston əlavə et" : "Etap əlavə et"}</Button> : null}
              </div>
            </Field>}
            <Field><FieldLabel>Təsdiq axını</FieldLabel><FormSelect name="distributionMode" options={distributionOptions} defaultValue="HR_APPROVAL" required /></Field>
          </FieldGroup>
          <DialogFooter className="hr-bonus-drawer-footer"><Button type="button" variant="outline" onClick={onClose}>Ləğv et</Button><Button type="submit" disabled={pending}>{pending ? "Yaradılır…" : "Bonus yarat"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AdjustmentDialog({ open, campaign, pending, onClose, onSubmit }: { open: boolean; campaign: HrBonusCampaignDto; pending: boolean; onClose: () => void; onSubmit: (formData: FormData) => void }) { return <Dialog open={open} onOpenChange={(value) => !value && onClose()}><DialogContent className="hr-bonus-small-dialog"><DialogHeader><DialogTitle>Nəticəyə düzəliş</DialogTitle><DialogDescription>Avtomatik nəticəyə auditli müsbət və ya mənfi dəyişiklik əlavə edin.</DialogDescription></DialogHeader><form onSubmit={(event) => { event.preventDefault(); onSubmit(new FormData(event.currentTarget)); }}><input type="hidden" name="campaignId" value={campaign.id} /><FieldGroup><Field><FieldLabel htmlFor="adjustment-amount">Düzəliş</FieldLabel><Input id="adjustment-amount" name="amount" type="number" step="0.01" placeholder="Məsələn: 250 və ya -100" required /></Field><Field><FieldLabel htmlFor="adjustment-reason">Səbəb</FieldLabel><textarea id="adjustment-reason" name="reason" rows={4} minLength={3} maxLength={500} required /></Field></FieldGroup><DialogFooter><Button type="button" variant="outline" onClick={onClose}>Ləğv et</Button><Button type="submit" disabled={pending}>Düzəlişi saxla</Button></DialogFooter></form></DialogContent></Dialog>; }

function CancelDialog({ open, campaign, pending, onClose, onSubmit }: { open: boolean; campaign: HrBonusCampaignDto; pending: boolean; onClose: () => void; onSubmit: (formData: FormData) => void }) { return <Dialog open={open} onOpenChange={(value) => !value && onClose()}><DialogContent className="hr-bonus-small-dialog"><DialogHeader><DialogTitle>Kampaniyanı ləğv etmək?</DialogTitle><DialogDescription>“{campaign.name}” dayandırılacaq. Maliyyəyə göndərilmiş bonuslar varsa ləğv bloklanacaq.</DialogDescription></DialogHeader><form onSubmit={(event) => { event.preventDefault(); onSubmit(new FormData(event.currentTarget)); }}><input type="hidden" name="campaignId" value={campaign.id} /><Field><FieldLabel htmlFor="cancel-reason">Ləğv səbəbi</FieldLabel><textarea id="cancel-reason" name="reason" rows={4} minLength={3} maxLength={500} required /></Field><DialogFooter><Button type="button" variant="outline" onClick={onClose}>Geri qayıt</Button><Button type="submit" variant="destructive" disabled={pending}>Kampaniyanı ləğv et</Button></DialogFooter></form></DialogContent></Dialog>; }

function DeleteCampaignDialog({ open, campaign, pending, onClose, onSubmit }: { open: boolean; campaign: HrBonusCampaignDto; pending: boolean; onClose: () => void; onSubmit: (formData: FormData) => void }) { return <Dialog open={open} onOpenChange={(value) => !value && onClose()}><DialogContent className="hr-bonus-small-dialog"><DialogHeader><DialogTitle>Kampaniyanı birdəfəlik silmək?</DialogTitle><DialogDescription>“{campaign.name}” və onun hesablanmamış bonus qeydləri geri qaytarılmadan silinəcək. Maliyyəyə göndərilmiş bonus varsa əməliyyat təhlükəsizlik üçün bloklanacaq.</DialogDescription></DialogHeader><form onSubmit={(event) => { event.preventDefault(); onSubmit(new FormData(event.currentTarget)); }}><input type="hidden" name="campaignId" value={campaign.id} /><Field><FieldLabel htmlFor="delete-campaign-reason">Silmə səbəbi</FieldLabel><textarea id="delete-campaign-reason" name="reason" rows={4} minLength={3} maxLength={500} required /></Field><DialogFooter><Button type="button" variant="outline" onClick={onClose}>Geri qayıt</Button><Button type="submit" variant="destructive" disabled={pending}><Trash2 data-icon="inline-start" /> Birdəfəlik sil</Button></DialogFooter></form></DialogContent></Dialog>; }

function metricLabel(kind: HrBonusCampaignDto["metricKind"]) { return metricOptions.find((option) => option.value === kind)?.label ?? kind; }
function metricDescription(kind: string) {
  if (kind === "DEPARTMENT_COLLECTED_REVENUE") return "Məsul menecerə bağlı tələbə ödənişlərindən avtomatik hesablanır.";
  if (kind === "DEPARTMENT_SALES_COUNT") return "Departament əməkdaşlarına bağlı yeni qeydiyyatlardan hesablanır.";
  if (kind === "TEACHER_RETENTION_RATE") return "Dövrün əvvəlində müəllimdə olan tələbə sayı və dövr ərzindəki churn sayı ilə hesablanır.";
  return "Cari nəticə HR düzəlişləri ilə daxil edilir.";
}
function salesStages(): StageDraft[] {
  return [
    { threshold: 20, bonusPool: 0, bonusPercent: 20, fixedAmount: 0 },
    { threshold: 30, bonusPool: 0, bonusPercent: 30, fixedAmount: 100 },
  ];
}
function milestoneExampleStages(): StageDraft[] {
  return [
    { threshold: 50, bonusPool: 0, bonusPercent: 0, fixedAmount: 50 },
    { threshold: 70, bonusPool: 0, bonusPercent: 0, fixedAmount: 70 },
    { threshold: 100, bonusPool: 0, bonusPercent: 0, fixedAmount: 100 },
  ];
}
function teacherStages(): StageDraft[] {
  return [
    { threshold: 20, bonusPool: 0, bonusPercent: 0, fixedAmount: 200 },
    { threshold: 30, bonusPool: 0, bonusPercent: 0, fixedAmount: 300 },
    { threshold: 40, bonusPool: 0, bonusPercent: 0, fixedAmount: 400 },
  ];
}
function teacherPenaltyDefaults(): TeacherPenaltyDraft[] {
  return [
    { tierIndex: 0, churnThreshold: 3, deductionAmount: 60 },
    { tierIndex: 2, churnThreshold: 6, deductionAmount: 100 },
  ];
}
function teacherTierOptions(stages: StageDraft[], editingIndex: number) {
  const selectedByOtherRows = new Set(stages.filter((_, index) => index !== editingIndex).map((stage) => stage.threshold));
  const lowerBound = stages[editingIndex - 1]?.threshold ?? 0;
  const upperBound = stages[editingIndex + 1]?.threshold ?? 501;
  const standardValues = Array.from({ length: 50 }, (_, index) => (index + 1) * 10);
  const values = [...new Set([...standardValues, stages[editingIndex].threshold])]
    .filter((value) => value > lowerBound && value < upperBound)
    .filter((value) => !selectedByOtherRows.has(value))
    .toSorted((first, second) => first - second);
  return values.map((value) => ({ value: String(value), label: `${value}+ tələbə` }));
}
function formatRewardRule(stage?: Pick<HrBonusStageDto, "bonusPool" | "bonusPercent" | "fixedAmount">) {
  if (!stage) return "—";
  if (stage.bonusPercent > 0 || stage.fixedAmount > 0) {
    const percent = stage.bonusPercent > 0 ? `${stage.bonusPercent}%` : "";
    const fixed = stage.fixedAmount > 0 ? `${formatMoney(stage.fixedAmount)} sabit` : "";
    return [percent, fixed].filter(Boolean).join(" + ");
  }
  return formatMoney(stage.bonusPool);
}
function formatStageRule(stage: HrBonusStageDto | undefined, campaign: HrBonusCampaignDto) {
  if (stage?.isIncremental) {
    const percent = campaign.perUnitBonusPercent > 0 ? `${campaign.perUnitBonusPercent}%` : "";
    const fixed = campaign.perUnitBonusAmount > 0 ? formatMoney(campaign.perUnitBonusAmount) : "";
    return `hər əlavə satış üçün ${[percent, fixed].filter(Boolean).join(" + ")}`;
  }
  return formatRewardRule(stage);
}
const azMonths = ["yan", "fev", "mar", "apr", "may", "iyn", "iyl", "avq", "sen", "okt", "noy", "dek"];
function formatMoney(value: number) { return `${new Intl.NumberFormat("az-AZ", { maximumFractionDigits: 2 }).format(value)} ₼`; }
function formatMetric(value: number, unit: string) { const formatted = new Intl.NumberFormat("az-AZ", { maximumFractionDigits: 2 }).format(value); return unit === "₼" ? `${formatted} ₼` : `${formatted} ${unit}`; }
function formatDate(value: string) { const [year, month, day] = value.split("-"); return `${day} ${azMonths[Number(month) - 1]} ${year}`; }
function formatDateTime(value: string) { if (!value) return "—"; const date = new Date(value); return `${String(date.getDate()).padStart(2, "0")} ${azMonths[date.getMonth()]} ${date.getFullYear()}, ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`; }
