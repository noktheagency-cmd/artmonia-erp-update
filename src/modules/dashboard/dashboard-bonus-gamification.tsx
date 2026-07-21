"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import {
  ArrowUpRight,
  BadgeCheck,
  CalendarClock,
  Coins,
  Flag,
  LockKeyhole,
  Paintbrush,
  Sparkles,
  Target,
  UsersRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress";
import type { HrBonusCampaignDto, HrBonusData } from "@/modules/hr/bonus-data";
import "@/modules/hr/bonus.css";
import "./dashboard-bonus-gamification.css";

const VanGoghBonusIllustration = dynamic(
  () => import("@/modules/hr/van-gogh-bonus-illustration").then((module) => module.VanGoghBonusIllustration),
  {
    ssr: false,
    loading: () => (
      <div className="hr-bonus-scene-loading">
        <Paintbrush />
        <span>Emalatxana hazırlanır…</span>
      </div>
    ),
  },
);

export function DashboardBonusGamification({ data }: { data: HrBonusData }) {
  const campaign = preferredCampaign(data.campaigns, data.actorDepartment);

  if (!campaign) {
    return (
      <Card className="dashboard-bonus-card is-empty">
        <CardHeader>
          <CardTitle>Bonus emalatxanası</CardTitle>
          <CardDescription>HR tərəfindən aktiv kampaniya yaradıldıqda real irəliləyişiniz burada görünəcək.</CardDescription>
          <CardAction><Badge variant="secondary">Gözləyir</Badge></CardAction>
        </CardHeader>
        <CardContent className="dashboard-bonus-empty-content">
          <div className="dashboard-bonus-empty-scene">
            <VanGoghBonusIllustration progress={0} reachedCount={0} celebrationKey="" replayToken={0} />
          </div>
          <div className="dashboard-bonus-empty-copy"><div className="dashboard-bonus-empty-icon"><Sparkles /></div><div><strong>Yeni hədəfə hazır olun</strong><span>Bonus mərhələləri və qazanılan məbləğ HR kampaniyası başladıqda avtomatik hesablanacaq.</span></div></div>
        </CardContent>
      </Card>
    );
  }

  const reachedStages = campaign.stages.filter((stage) => stage.reachedAt);
  const nextStage = campaign.stages.find((stage) => !stage.reachedAt);
  const unit = metricUnit(campaign.metricKind);
  const daysLeft = Math.max(0, Math.ceil((new Date(campaign.endsAt).getTime() - new Date(data.asOf).getTime()) / 86_400_000));

  return (
    <Card className="dashboard-bonus-card">
      <CardHeader className="dashboard-bonus-header">
        <div>
          <CardTitle>Bonus irəliləyişi</CardTitle>
          <CardDescription>{campaign.name} · {campaign.department}</CardDescription>
        </div>
        <CardAction className="dashboard-bonus-actions">
          <Badge variant={campaign.status === "ACTIVE" ? "default" : "secondary"}>{statusLabel(campaign.status)}</Badge>
          {data.permissions.canSeeAll ? <Link href="/hr?view=bonus" aria-label="Bonus idarəetməsini aç"><ArrowUpRight /></Link> : null}
        </CardAction>
      </CardHeader>

      <CardContent className="dashboard-bonus-content">
        <div className="dashboard-bonus-scene">
          <div className="dashboard-bonus-illustration-wrap">
            <VanGoghBonusIllustration
              progress={campaign.progress}
              reachedCount={reachedStages.length}
              celebrationKey={`dashboard:${campaign.id}:${reachedStages.at(-1)?.id ?? "start"}`}
              replayToken={0}
            />
          </div>
          <div className="dashboard-bonus-progress-panel">
            <div className="dashboard-bonus-score">
              <span>Cari tərəqqi</span>
              <strong>{Math.round(campaign.progress)}%</strong>
              <small>{formatMetric(campaign.currentValue, unit)} / {formatMetric(campaign.maxThreshold, unit)}</small>
            </div>
            <Progress value={campaign.progress}>
              <ProgressLabel>Komanda hədəfi</ProgressLabel>
              <ProgressValue />
            </Progress>
            <div className="dashboard-bonus-stat-grid">
              <BonusStat icon={Coins} label="Sizin bonus" value={formatMoney(campaign.ownAwardTotal)} />
              <BonusStat icon={Target} label="Növbəti mərhələ" value={nextStage ? formatMetric(nextStage.threshold, unit) : "Tamamlandı"} />
              <BonusStat icon={UsersRound} label="İştirakçı" value={`${campaign.participantCount} nəfər`} />
              <BonusStat icon={CalendarClock} label="Qalan müddət" value={`${daysLeft} gün`} />
            </div>
          </div>
        </div>

        <div className="dashboard-bonus-milestones" style={{ "--dashboard-milestones": campaign.stages.length } as React.CSSProperties}>
          {campaign.stages.map((stage) => {
            const reached = Boolean(stage.reachedAt);
            const current = !reached && stage.id === nextStage?.id;
            return (
              <div className={reached ? "is-reached" : current ? "is-current" : ""} key={stage.id}>
                <span>{reached ? <BadgeCheck /> : current ? <Flag /> : <LockKeyhole />}</span>
                <strong>{formatMetric(stage.threshold, unit)}</strong>
                <small>{formatReward(stage)}</small>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function BonusStat({ icon: Icon, label, value }: { icon: typeof Coins; label: string; value: string }) {
  return <div><Icon /><span>{label}</span><strong>{value}</strong></div>;
}

function preferredCampaign(campaigns: HrBonusCampaignDto[], department: string) {
  return campaigns.find((campaign) => campaign.status === "ACTIVE" && (!department || campaign.department === department))
    ?? campaigns.find((campaign) => campaign.status === "ACTIVE")
    ?? campaigns.find((campaign) => campaign.status === "ACHIEVED")
    ?? campaigns[0];
}

function metricUnit(kind: HrBonusCampaignDto["metricKind"]) {
  return kind === "DEPARTMENT_SALES_COUNT" ? "satış" : kind === "TEACHER_RETENTION_RATE" ? "tələbə (orta)" : kind === "MANUAL_KPI" ? "xal" : "₼";
}

function formatReward(stage: HrBonusCampaignDto["stages"][number]) {
  if (stage.bonusPercent > 0 || stage.fixedAmount > 0) {
    return [stage.bonusPercent > 0 ? `${stage.bonusPercent}%` : "", stage.fixedAmount > 0 ? formatMoney(stage.fixedAmount) : ""].filter(Boolean).join(" + ");
  }
  return `${formatMoney(stage.bonusPool)} fond`;
}

function formatMetric(value: number, unit: string) {
  return unit === "₼" ? formatMoney(value) : `${formatRoundedInteger(value)} ${unit}`;
}

function formatMoney(value: number) {
  return `${formatRoundedInteger(value)} ₼`;
}

function formatRoundedInteger(value: number) {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function statusLabel(status: HrBonusCampaignDto["status"]) {
  return ({ SCHEDULED: "Planlaşdırılıb", ACTIVE: "Canlı", ACHIEVED: "Tamamlandı", EXPIRED: "Bağlanıb", CANCELLED: "Ləğv edilib" } as const)[status];
}
